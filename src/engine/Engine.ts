// The engine: owns the connection to the central unit, the accessory queue and
// the live state (later the interlocking levels). Runs in an Electron
// utilityProcess (STK-4), but has no Electron imports itself: ports are plain
// message endpoints, so it can be tested in Node.
import {lanXGetTurnoutInfo, versionToNumber} from '@lever/z21-protocol';
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
import {projectSchema} from '../model/project';
import {
  ENGINE_API_VERSION,
  EngineCommand,
  engineCommandSchema,
  EngineEventInput,
  EngineSnapshot,
} from '../shared/engineApi';
import {FeedbackSource} from '../shared/feedback';

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
};

const realSchedule = (ms: number, run: () => void) => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

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

  constructor(
    private readonly connection: ConnectionManager,
    options: EngineOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.defaultPulseMs = options.defaultPulseMs ?? DEFAULT_PULSE_MS;
    this.queue = new AccessoryQueue({
      send: (datasets) => connection.sendDatasets(datasets),
      gapMs: options.accessoryGapMs,
      onStart: (job) => this.onJobStart(job),
    });
    this.interlocking = new Interlocking({
      enqueue: (job) => this.enqueue(job),
      schedule: options.schedule ?? realSchedule,
      onChange: (changes) => this.broadcast({type: 'layout', changes}),
      onNotice: (notice) => this.notice(notice),
    });

    connection.on('state', (state) => {
      this.broadcast({type: 'connection', state, ...connection.getAddress()});
      this.onConnectionState(state === 'connected');
    });
    connection.on('trackStatus', (status) => {
      this.broadcast({type: 'trackStatus', status});
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
      this.handleCommand(data);
    });
    port.onClose(() => {
      this.ports.delete(port);
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
    this.interlocking.load(project);
    this.setAccessoryGap(project.settings.centralUnit.accessoryGapMs);
    this.setFeedbackSources(project.settings.centralUnit.feedbackSources);
    // Ask for the position of accessories not reported yet (LOAD-3).
    if (this.connection.getState() === 'connected') {
      for (const fAdr of this.interlocking.addresses()) {
        if (this.accessories.get(fAdr) === undefined) {
          this.query(fAdr);
        }
      }
    }
  }

  // Logs off cleanly (§2.2).
  shutdown(): void {
    this.queue.dispose();
    this.connection.disconnect();
  }

  snapshot(): EngineSnapshot {
    return {
      connection: {
        state: this.connection.getState(),
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

  handleCommand(data: unknown): void {
    const parsed = engineCommandSchema.safeParse(data);
    if (!parsed.success) {
      console.error('Engine: invalid command', parsed.error.message);
      return;
    }
    const command: EngineCommand = parsed.data;
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
      this.interlocking.connectionLost();
      this.broadcastSnapshot();
      return;
    }
    // Startup state, rate-limited through the queue, never as a burst
    // (LOAD-3): every accessory of the layout, and any touched by hand.
    [...new Set([...this.interlocking.addresses(), ...this.knownAccessories])]
      .sort((a, b) => a - b)
      .forEach((fAdr) => this.query(fAdr));
    feedbackStartupQueries(this.feedbackSources).forEach((job) =>
      this.enqueue(job),
    );
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

  private query(fAdr: number): void {
    this.awaitingReply.add(fAdr);
    this.enqueue(turnoutQuery(fAdr));
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

const turnoutQuery = (fAdr: number): AccessoryJob => ({
  kind: 'query',
  key: `turnout:${fAdr}`,
  dataset: lanXGetTurnoutInfo(fAdr),
});
