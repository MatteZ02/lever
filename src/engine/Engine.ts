// The engine: owns the connection to the central unit, the accessory queue and
// the live state (later the interlocking levels). Runs in an Electron
// utilityProcess (STK-4), but has no Electron imports itself: ports are plain
// message endpoints, so it can be tested in Node.
import {
  lanXGetLocoInfo,
  lanXGetTurnoutInfo,
  lanXSetLocoDrive,
  versionToNumber,
} from '@lever/z21-protocol';
import {
  AccessoryJob,
  AccessoryQueue,
  DEFAULT_PULSE_MS,
} from '../connection/AccessoryQueue';
import {ConnectionManager} from '../connection/ConnectionManager';
import {
  broadcastFlagsFor,
  FeedbackTracker,
  feedbackStartupQueries,
} from '../connection/FeedbackTracker';
import {AccessoryStateStore} from '../interlocking/accessoryState';
import {Interlocking, InterlockingNotice} from '../interlocking/Interlocking';
import {Loco} from '../model/locos';
import {Project, projectSchema} from '../model/project';
import {
  ENGINE_API_VERSION,
  EngineCommand,
  engineCommandSchema,
  EngineEventInput,
  EngineReport,
  EngineSnapshot,
} from '../shared/engineApi';
import {FeedbackSource} from '../shared/feedback';
import {LayoutLiveChanges} from '../shared/liveState';
import {LocoControl} from './LocoControl';

// LAN_X_SET_EXT_ACCESSORY exists from Z21 FW 1.40 (§5.4). The z21 start in
// use runs 1.33 (REU-5).
const EXT_ACCESSORY_MIN_FIRMWARE = 140;

// The part of a MessagePort the engine uses.
export type EnginePort = {
  postMessage(message: unknown): void;
  onMessage(listener: (data: unknown) => void): void;
  onClose(listener: () => void): void;
};

export type EngineOptions = {
  now?: () => number;
  accessoryGapMs?: number;
  defaultPulseMs?: number;
  // Timers for the interlocking (confirmation, block release); tests inject
  // fake ones.
  schedule?: (ms: number, run: () => void) => () => void;
  // Reports to the main process (ACC-4 last-known turnout positions).
  report?: (report: EngineReport) => void;
};

const realSchedule = (ms: number, run: () => void) => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

// Commands that come from an operator's action. Each one also refreshes the
// track status if it is stale (see ConnectionManager.refreshStatusIfStale).
// STOP and track power are left out: their own reply reports the status.
// Position refresh (positionRefreshMs): never more often than this, and on
// an operator's action only when the last round is at least this old.
const MIN_POSITION_REFRESH_MS = 2000;
const POSITION_REFRESH_ON_ACTION_MS = 3000;
// LAN_X_GET_LOCO_INFO subscribes a client to at most 16 locos (§4, FIFO).
export const MAX_LOCO_SUBSCRIPTIONS = 16;
// While Lever drives a loco (a Level 3 hold, a Level 4 run), its speed is
// asked this often: a central unit that does not pass on other clients'
// drive commands (DR5000?) would otherwise hide a driver accelerating a
// held train.
export const CONTROLLED_LOCO_POLL_MS = 2000;

const USER_ACTIONS: ReadonlySet<EngineCommand['type']> = new Set([
  'switchAccessory',
  'queryAccessory',
  'setExtAccessory',
  'setTurnout',
  'setSignal',
  'pressAccessory',
  'setTrainLabel',
]);

export class Engine {
  private readonly ports = new Set<EnginePort>();
  private readonly now: () => number;
  private readonly queue: AccessoryQueue;
  private readonly accessories = new AccessoryStateStore();
  private readonly feedback = new FeedbackTracker();
  // Accessories whose position is asked for after every (re)connect
  // (LOAD-3): those touched this session, later also the project's.
  private readonly knownAccessories = new Set<number>();
  private readonly defaultPulseMs: number;
  private readonly interlocking: Interlocking;
  // Turnout info queries sent and not answered yet: a report for one of
  // these is a reply, anything else a broadcast of a change.
  private readonly awaitingReply = new Set<number>();
  private feedbackSources: FeedbackSource[] = [];
  private protocolLog = false;
  private projectId: string | null = null;
  // ACC-4: positions to command after the next connection.
  private pendingRestore: Record<string, string> | null = null;
  // Levels 3 and 4.
  private readonly locoControl: LocoControl;
  private project: Project | null = null;
  // Loco addresses subscribed (LAN_X_GET_LOCO_INFO), oldest first.
  private subscribed: number[] = [];
  private controlledLocos = new Set<number>();
  private cancelLocoPoll: (() => void) | null = null;
  private readonly report: (report: EngineReport) => void;
  private readonly schedule: (ms: number, run: () => void) => () => void;
  // The station view each window shows (key: its port); their turnouts are
  // the ones the position refresh asks for.
  private readonly shownViews = new Map<unknown, string[]>();
  private positionRefreshMs = 0;
  private lastPositionRefreshAt = 0;
  private cancelPositionRefresh: (() => void) | null = null;

  constructor(
    private readonly connection: ConnectionManager,
    options: EngineOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.defaultPulseMs = options.defaultPulseMs ?? DEFAULT_PULSE_MS;
    this.report = options.report ?? (() => {});
    this.schedule = options.schedule ?? realSchedule;
    this.queue = new AccessoryQueue({
      send: (datasets) => connection.sendDatasets(datasets),
      gapMs: options.accessoryGapMs,
      onStart: (job) => this.onJobStart(job),
    });
    this.locoControl = new LocoControl({
      drive: ({address, steps, speed, forward}) => {
        if (this.connection.getState() === 'connected') {
          this.connection.sendDatasets([
            lanXSetLocoDrive({
              address,
              steps,
              speed,
              forward,
              emergencyStop: false,
            }),
          ]);
        }
      },
      schedule: (ms, run) =>
        this.schedule(ms, () => {
          run();
          this.interlocking.locosChanged();
        }),
    });
    this.interlocking = new Interlocking({
      enqueue: (job) => this.enqueue(job),
      schedule: this.schedule,
      onChange: (changes) => {
        this.broadcast({type: 'layout', changes});
        this.reportConfirmedTurnouts(changes);
        if (changes.trains) {
          this.subscribeTrainLocos();
        }
      },
      onNotice: (notice) => this.notice(notice),
      query: (fAdr) => this.query(fAdr),
      setLocoTarget: (loco, target) => this.setLocoTarget(loco, target),
      locoSpeed: (loco) => this.locoControl.kmh(loco),
      locoForward: (loco) => this.locoControl.forward(loco),
      now: this.now,
    });

    connection.on('state', (state) => {
      this.broadcastConnection();
      this.onConnectionState(state === 'connected');
    });
    connection.on('interrupted', (interrupted) => {
      this.broadcastConnection();
      if (!interrupted) {
        // Reports may have been lost meanwhile: ask every position again, in
        // the background (never ahead of the operator's commands). A set
        // route stays set unless a turnout is found moved.
        this.queryAll(true);
      }
    });
    connection.on('trackStatus', (status) => {
      this.broadcast({type: 'trackStatus', status});
      if (
        status === 'emergencyStop' ||
        status === 'powerOff' ||
        status === 'shortCircuit'
      ) {
        // Every loco stands; automatic trains must not start again by
        // themselves when power comes back (resume automation by hand).
        this.locoControl.allStopped();
        this.interlocking.setAutomationPaused(true);
      }
    });
    connection.on('deviceInfo', (deviceInfo) => {
      this.broadcast({type: 'deviceInfo', deviceInfo});
    });
    connection.on('log', (entry) => {
      this.broadcast({type: 'log', entry});
    });
    connection.on('message', (message) => {
      const now = this.now();
      switch (message.type) {
        case 'turnoutInfo':
          this.interlocking.accessoryReport(
            message.fAdr,
            message.position,
            this.awaitingReply.delete(message.fAdr),
          );
          this.broadcast({
            type: 'accessory',
            state: this.accessories.reported(
              message.fAdr,
              message.position,
              now,
            ),
          });
          return;
        case 'extAccessoryInfo':
          this.interlocking.extAccessoryReport(
            message.rawAddress,
            message.valid ? message.value : undefined,
            false,
          );
          this.broadcast({
            type: 'extAccessory',
            state: this.accessories.extReported(
              message.rawAddress,
              message.value,
              message.valid,
              now,
            ),
          });
          return;
      }
      if (message.type === 'locoInfo') {
        const {loco} = message;
        this.locoControl.reported({
          address: loco.address,
          speedSteps: loco.speedSteps,
          forward: loco.forward,
          speed: loco.speed,
          emergencyStop: loco.emergencyStop,
        });
        this.interlocking.locosChanged();
        return;
      }
      const changes = this.feedback.handle(message, now);
      if (changes.length > 0) {
        this.broadcast({type: 'feedback', changes});
        this.interlocking.feedbackChanged(changes);
      }
    });
  }

  attachPort(port: EnginePort): void {
    this.ports.add(port);
    port.onMessage((data) => {
      this.handleCommand(data, port);
    });
    port.onClose(() => {
      this.ports.delete(port);
      this.shownViews.delete(port);
    });
    this.post(port, {type: 'snapshot', snapshot: this.snapshot()});
  }

  connect(host: string, port: number): void {
    this.connection.connect(host, port);
  }

  setProtocolLog(enabled: boolean): void {
    this.protocolLog = enabled;
    this.connection.setLogging(enabled);
    this.broadcastSnapshot();
  }

  setFeedbackSources(sources: FeedbackSource[]): void {
    const unique = [...new Set(sources)].sort();
    const added = unique.filter(
      (source) => !this.feedbackSources.includes(source),
    );
    this.feedbackSources = unique;
    this.connection.setBroadcastFlags(broadcastFlagsFor(unique));
    // The queue drops jobs while disconnected; reconnecting asks again.
    feedbackStartupQueries(added).forEach((job) => this.enqueue(job));
    this.broadcastSnapshot();
  }

  setAccessoryGap(gapMs: number): void {
    this.queue.setGap(gapMs);
  }

  // The open project (from the main process): elements to operate, and the
  // central-unit profile (gap, feedback sources).
  loadLayout(data: unknown): void {
    const parsed = projectSchema.safeParse(data);
    if (!parsed.success) {
      console.error('Engine: invalid project', parsed.error.message);
      return;
    }
    const project = parsed.data;
    if (project.id !== this.projectId) {
      this.pendingRestore = null;
    }
    this.projectId = project.id;
    this.project = project;
    this.interlocking.load(project);
    this.setAccessoryGap(project.settings.centralUnit.accessoryGapMs);
    this.setFeedbackSources(project.settings.centralUnit.feedbackSources);
    this.connection.setStatusPoll(project.settings.centralUnit.statusRefreshMs);
    const refreshMs = project.settings.centralUnit.positionRefreshMs;
    this.setPositionRefresh(
      refreshMs > 0 ? Math.max(MIN_POSITION_REFRESH_MS, refreshMs) : 0,
    );
    // Ask for the position of accessories not reported yet (LOAD-3).
    if (this.connection.getState() === 'connected') {
      for (const fAdr of this.interlocking.addresses()) {
        if (this.accessories.get(fAdr) === undefined) {
          this.query(fAdr);
        }
      }
    }
  }

  // ACC-4: commands the last known turnout positions once, after the next
  // connection (now, if connected). Through the interlocking and the
  // rate-limited queue, after the start-up queries.
  restoreTurnouts(projectId: string, positions: Record<string, string>): void {
    if (projectId !== this.projectId) {
      return;
    }
    if (this.connection.getState() === 'connected') {
      this.interlocking.restoreTurnouts(positions);
    } else {
      this.pendingRestore = positions;
    }
  }

  // Logs off cleanly (§2.2).
  shutdown(): void {
    this.stopPositionRefresh();
    this.queue.dispose();
    this.connection.disconnect();
  }

  snapshot(): EngineSnapshot {
    return {
      connection: {
        state: this.connection.getState(),
        interrupted: this.connection.isInterrupted(),
        ...this.connection.getAddress(),
      },
      trackStatus: this.connection.getTrackStatus(),
      deviceInfo: this.connection.getDeviceInfo(),
      protocolLog: this.protocolLog,
      accessories: this.accessories.all(),
      extAccessories: this.accessories.allExt(),
      feedbackSources: this.feedbackSources,
      feedbackInputs: this.feedback.all(),
      accessoryQueueLength: this.queue.size(),
      layout: this.interlocking.state(),
    };
  }

  // `source`: the window (port) it came from.
  handleCommand(data: unknown, source: unknown = this): void {
    const parsed = engineCommandSchema.safeParse(data);
    if (!parsed.success) {
      console.error('Engine: invalid command', parsed.error.message);
      return;
    }
    const command: EngineCommand = parsed.data;
    if (USER_ACTIONS.has(command.type)) {
      this.connection.refreshStatusIfStale();
    }
    switch (command.type) {
      // STOP and track power go straight out, never through the queue.
      case 'emergencyStop':
        this.connection.emergencyStop();
        break;
      case 'setTrackPower':
        this.connection.setTrackPower(command.on);
        break;
      case 'setProtocolLog':
        this.setProtocolLog(command.enabled);
        break;
      case 'switchAccessory':
        this.knownAccessories.add(command.fAdr);
        this.enqueue({
          kind: 'switch',
          fAdr: command.fAdr,
          output: command.output,
          pulseMs: command.pulseMs ?? this.defaultPulseMs,
          queued: command.queued,
        });
        break;
      case 'queryAccessory':
        this.knownAccessories.add(command.fAdr);
        this.query(command.fAdr);
        break;
      case 'setExtAccessory':
        this.enqueue({
          kind: 'extAccessory',
          rawAddress: command.rawAddress,
          value: command.value,
        });
        break;
      case 'setFeedbackSources':
        this.setFeedbackSources(command.sources);
        break;
      case 'setTurnout':
      case 'setSignal':
      case 'pressAccessory': {
        const {v: _v, ...elementCommand} = command;
        this.interlocking.command(elementCommand);
        break;
      }
      case 'setTrainLabel':
        this.interlocking.setTrainLabel(command.blockId, command.label);
        break;
      case 'setRoute':
        this.interlocking.setRoute(
          command.from,
          command.to,
          command.via,
          command.key,
          command.allowCrossing,
          command.override,
        );
        break;
      case 'assignTrainLoco':
        this.interlocking.assignTrainLoco(command.trainId, command.locoId);
        break;
      case 'driveTrain':
        this.interlocking.driveTrain(command.trainId, command.blockId);
        break;
      case 'runSchedule':
        this.interlocking.runSchedule(command.trainId, command.scheduleId);
        break;
      case 'stopTrain':
        this.interlocking.stopTrain(command.trainId);
        break;
      case 'setAutomationPaused':
        this.interlocking.setAutomationPaused(command.paused);
        break;
      case 'cancelRoute':
        this.interlocking.cancelRoute(command.routeId);
        break;
      case 'releaseRoute':
        this.interlocking.releaseRoute(command.routeId);
        break;
      case 'undoRoute':
        this.interlocking.undoRoute();
        break;
      case 'showViews': {
        const before = this.shownViews.get(source) ?? [];
        if (command.viewIds.length === 0) {
          this.shownViews.delete(source);
        } else {
          this.shownViews.set(source, command.viewIds);
        }
        // Another station on screen: bring its positions up to date now.
        if (command.viewIds.some((id) => !before.includes(id))) {
          this.refreshPositions();
        }
        break;
      }
    }
    // After the command itself, so its job is queued first.
    if (USER_ACTIONS.has(command.type)) {
      this.refreshPositionsIfStale();
    }
  }

  // Unknown firmware (no reply, e.g. some third-party units) is allowed: the
  // command is then simply ignored by a unit that does not support it.
  private extAccessoriesSupported(): boolean {
    const firmware = this.connection.getDeviceInfo().firmwareVersion;
    return (
      firmware === undefined ||
      !(versionToNumber(firmware) < EXT_ACCESSORY_MIN_FIRMWARE)
    );
  }

  private onConnectionState(connected: boolean): void {
    this.queue.setConnected(connected);
    if (!connected) {
      // Nothing reported before can be trusted after a connection loss
      // (MULTI-3).
      this.accessories.clear();
      this.feedback.clear();
      this.awaitingReply.clear();
      this.locoControl.forgetReports();
      this.interlocking.connectionLost();
      this.broadcastSnapshot();
      this.stopPositionRefresh();
      return;
    }
    this.startPositionRefresh();
    // Subscriptions do not survive a new login.
    this.subscribed = [];
    this.subscribeTrainLocos();
    this.queryAll();
    feedbackStartupQueries(this.feedbackSources).forEach((job) =>
      this.enqueue(job),
    );
    if (this.pendingRestore) {
      const positions = this.pendingRestore;
      this.pendingRestore = null;
      this.interlocking.restoreTurnouts(positions);
    }
  }

  // --- locos (Levels 3 and 4) --------------------------------------------------

  private setLocoTarget(
    loco: Loco,
    target: {kmh: number; forward?: boolean} | null,
  ): void {
    this.locoControl.setTarget(loco, target);
    if (target) {
      this.controlledLocos.add(loco.address);
    } else {
      this.controlledLocos.delete(loco.address);
    }
    this.startLocoPoll();
  }

  // The locos of the trains: subscribed, so their speed is known (and a
  // driver accelerating a held train is seen). At most 16, the newest
  // trains' locos first; Throttles have their own 16 each.
  private subscribeTrainLocos(): void {
    if (!this.project || this.connection.getState() !== 'connected') {
      return;
    }
    const locos = new Map(this.project.locos.map((loco) => [loco.id, loco]));
    const wanted = Object.values(this.interlocking.state().trains)
      .flatMap((train) => {
        const loco = train.locoId ? locos.get(train.locoId) : undefined;
        return loco ? [loco.address] : [];
      })
      .slice(-MAX_LOCO_SUBSCRIPTIONS);
    const added = wanted.filter(
      (address) => !this.subscribed.includes(address),
    );
    if (added.length === 0) {
      return;
    }
    this.subscribed = [...this.subscribed, ...added].slice(
      -MAX_LOCO_SUBSCRIPTIONS,
    );
    this.connection.sendDatasets(added.map(lanXGetLocoInfo));
  }

  private startLocoPoll(): void {
    if (this.controlledLocos.size === 0) {
      this.cancelLocoPoll?.();
      this.cancelLocoPoll = null;
      return;
    }
    if (this.cancelLocoPoll) {
      return;
    }
    this.cancelLocoPoll = this.schedule(CONTROLLED_LOCO_POLL_MS, () => {
      this.cancelLocoPoll = null;
      if (this.connection.getState() === 'connected') {
        this.connection.sendDatasets(
          [...this.controlledLocos]
            .slice(0, MAX_LOCO_SUBSCRIPTIONS)
            .map(lanXGetLocoInfo),
        );
      }
      this.startLocoPoll();
    });
  }

  // Startup state, rate-limited through the queue, never as a burst
  // (LOAD-3): every accessory of the layout, and any touched by hand.
  private queryAll(background = false): void {
    [...new Set([...this.interlocking.addresses(), ...this.knownAccessories])]
      .sort((a, b) => a - b)
      .forEach((fAdr) => this.query(fAdr, background));
  }

  private broadcastConnection(): void {
    this.broadcast({
      type: 'connection',
      state: this.connection.getState(),
      interrupted: this.connection.isInterrupted(),
      ...this.connection.getAddress(),
    });
  }

  // Positions the central unit confirmed are the last known ones (ACC-4).
  // Start-up reports are not: a restarted unit may report a default.
  private reportConfirmedTurnouts(changes: LayoutLiveChanges): void {
    if (!this.projectId) {
      return;
    }
    const positions: Record<string, string> = {};
    for (const [id, turnout] of Object.entries(changes.turnouts ?? {})) {
      if (turnout?.status === 'confirmed' && turnout.position) {
        positions[id] = turnout.position;
      }
    }
    if (Object.keys(positions).length > 0) {
      this.report({
        type: 'turnoutPositions',
        projectId: this.projectId,
        positions,
      });
    }
  }

  private onJobStart(job: AccessoryJob): void {
    if (job.kind !== 'query' && job.tag) {
      this.interlocking.jobStarted(job.tag);
    }
    if (job.kind === 'switch') {
      this.broadcast({
        type: 'accessory',
        state: this.accessories.commanded(job.fAdr, job.output, this.now()),
      });
    }
    this.broadcast({type: 'accessoryQueue', length: this.queue.size()});
  }

  // --- position refresh -------------------------------------------------------
  // For central units that do not report turnouts switched by other programs
  // (DR5000: WinDigipet over USB, other network clients). Asks for the
  // positions of the stations on screen, as background queries that never
  // delay a command. A position that differs from the known one counts as
  // seen switching (Interlocking.accessoryReport).

  private setPositionRefresh(intervalMs: number): void {
    if (intervalMs === this.positionRefreshMs) {
      return;
    }
    this.positionRefreshMs = intervalMs;
    this.stopPositionRefresh();
    if (this.connection.getState() === 'connected') {
      this.startPositionRefresh();
    }
  }

  private startPositionRefresh(): void {
    this.stopPositionRefresh();
    if (this.positionRefreshMs <= 0) {
      return;
    }
    const tick = () => {
      if (this.now() - this.lastPositionRefreshAt >= this.positionRefreshMs) {
        this.refreshPositions();
      }
      this.cancelPositionRefresh = this.schedule(this.positionRefreshMs, tick);
    };
    this.cancelPositionRefresh = this.schedule(this.positionRefreshMs, tick);
  }

  private stopPositionRefresh(): void {
    this.cancelPositionRefresh?.();
    this.cancelPositionRefresh = null;
  }

  private refreshPositionsIfStale(): void {
    if (
      this.now() - this.lastPositionRefreshAt >=
      POSITION_REFRESH_ON_ACTION_MS
    ) {
      this.refreshPositions();
    }
  }

  private refreshPositions(): void {
    if (
      this.positionRefreshMs <= 0 ||
      this.connection.getState() !== 'connected' ||
      this.shownViews.size === 0
    ) {
      return;
    }
    this.lastPositionRefreshAt = this.now();
    const views = new Set([...this.shownViews.values()].flat());
    for (const fAdr of this.interlocking.addressesOfViews(views)) {
      this.awaitingReply.add(fAdr);
      this.enqueue(turnoutQuery(fAdr, true));
    }
  }

  private query(fAdr: number, background = false): void {
    this.awaitingReply.add(fAdr);
    this.enqueue(turnoutQuery(fAdr, background));
  }

  private notice(notice: InterlockingNotice): void {
    this.broadcast({
      type: 'notice',
      notice: {
        code: notice.code,
        time: this.now(),
        ...('elementId' in notice ? {elementId: notice.elementId} : {}),
        ...('blockId' in notice ? {blockId: notice.blockId} : {}),
        ...('reason' in notice ? {reason: notice.reason} : {}),
        ...('routeId' in notice ? {routeId: notice.routeId} : {}),
        ...('toElementId' in notice ? {toElementId: notice.toElementId} : {}),
        ...('skipped' in notice ? {skipped: notice.skipped} : {}),
        ...('manualBack' in notice ? {manualBack: notice.manualBack} : {}),
        ...('manualThrow' in notice ? {manualThrow: notice.manualThrow} : {}),
        ...('trainId' in notice ? {trainId: notice.trainId} : {}),
        ...('name' in notice ? {name: notice.name} : {}),
        ...('blockIds' in notice && notice.blockIds
          ? {blockIds: notice.blockIds}
          : {}),
        ...('routeIds' in notice && notice.routeIds
          ? {routeIds: notice.routeIds}
          : {}),
      },
    });
  }

  private enqueue(job: AccessoryJob): void {
    // Extended accessories need FW 1.40 (REU-5); refuse rather than send.
    if (job.kind === 'extAccessory' && !this.extAccessoriesSupported()) {
      this.broadcast({
        type: 'notice',
        notice: {code: 'extAccessoryUnsupported', time: this.now()},
      });
      return;
    }
    this.queue.enqueue(job);
    this.broadcast({type: 'accessoryQueue', length: this.queue.size()});
  }

  private broadcastSnapshot(): void {
    this.broadcast({type: 'snapshot', snapshot: this.snapshot()});
  }

  private broadcast(event: EngineEventInput): void {
    for (const port of this.ports) {
      this.post(port, event);
    }
  }

  private post(port: EnginePort, event: EngineEventInput): void {
    try {
      port.postMessage({v: ENGINE_API_VERSION, ...event});
    } catch (error) {
      // A closed window's port; it is removed on close.
      console.error('Engine: could not post to port', error);
    }
  }
}

const turnoutQuery = (fAdr: number, background = false): AccessoryJob => ({
  kind: 'query',
  key: `turnout:${fAdr}`,
  dataset: lanXGetTurnoutInfo(fAdr),
  ...(background ? {background} : {}),
});
