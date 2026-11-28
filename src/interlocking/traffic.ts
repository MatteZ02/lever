// Trains, Level 3 protection and Level 4 automatic driving, owned by the
// interlocking (Interlocking.ts gives it the layout's state through
// TrafficDeps). After every change the interlocking calls evaluate(): each
// train's hold and automatic run are worked out again, routes are set or
// released for automatic trains, and each loco gets its target speed (or is
// left to its driver).
import {buildBlockGraph, BlockGraph} from '../model/blockGraph';
import {Loco} from '../model/locos';
import {AutomationLevel, Project} from '../model/project';
import {routeProblems} from '../model/routeChecks';
import {RouteSteps} from '../model/routeConflicts';
import {findRouteToBlock, RoutePlan} from '../model/routing';
import {NodeId, Topology} from '../model/topology';
import {RouteLive, TrainLive} from '../shared/liveState';
import {AutoRun, stepAuto} from './automatic';
import {HoldReason, holdReason, ProtectionContext} from './protection';
import {LocoTarget, Train, TrainContext, TrainTracker} from './trains';

export type TrafficNotice =
  | {code: 'trainHeld'; trainId: string; name: string; reason: HoldReason}
  | {code: 'trainLost'; trainId: string; name: string}
  | {code: 'trainUnclear'; blockId: string}
  | {code: 'trainArrived'; trainId: string; name: string; blockId: string}
  | {code: 'automationPaused'};

export type TrafficDeps = {
  position: (turnoutId: string) => string | undefined;
  occupied: (blockId: string) => boolean;
  signalAtStop: (signalId: string) => boolean;
  levelOfBlock: (blockId: string) => AutomationLevel;
  levelOfElement: (elementId: string) => AutomationLevel;
  routes: () => Record<string, RouteLive>;
  routePaths: () => {id: string; steps: RouteSteps}[];
  // Sets a route for an automatic train; its id, or undefined if refused.
  setRoute: (plan: RoutePlan) => string | undefined;
  releaseRoute: (routeId: string) => void;
  setLocoTarget: (loco: Loco, target: LocoTarget | null) => void;
  locoSpeed: (loco: Loco) => number | undefined;
  locoForward: (loco: Loco) => boolean | undefined;
  schedule: (ms: number, run: () => void) => () => void;
  now: () => number;
  notice: (notice: TrafficNotice) => void;
};

export class TrafficControl {
  private readonly tracker = new TrainTracker();
  private project: Project | null = null;
  private topology: Topology | null = null;
  private graph: BlockGraph = {exits: new Map(), ends: new Map()};
  private runs = new Map<string, AutoRun>();
  private holds = new Map<string, HoldReason>();
  // Trains whose automatic run was stopped: braked to 0, then their loco is
  // left to its driver.
  private stopping = new Set<string>();
  // Loco targets sent, by loco id (JSON, to send only changes).
  private targets = new Map<string, string>();
  private paused = false;
  private evaluating = false;
  private again = false;
  private dwellTimer: (() => void) | null = null;
  private lastLive = '';
  private live: Record<string, TrainLive> = {};

  constructor(private readonly deps: TrafficDeps) {}

  load(project: Project, topology: Topology): void {
    this.project = project;
    this.topology = topology;
    this.graph = buildBlockGraph(project, topology);
    this.tracker.prune(
      new Set(project.blocks.map((block) => block.id)),
      new Set(project.locos.map((loco) => loco.id)),
    );
    for (const [trainId, run] of this.runs) {
      if (!this.tracker.get(trainId)) {
        this.runs.delete(trainId);
      } else if (run.scheduleId) {
        const schedule = project.schedules.find((s) => s.id === run.scheduleId);
        if (!schedule || schedule.stops.length === 0) {
          this.runs.delete(trainId);
        }
      }
    }
  }

  trains(): Record<string, TrainLive> {
    return this.live;
  }

  isPaused(): boolean {
    return this.paused;
  }

  // The train number on each block (block labels follow their trains).
  labels(): Map<string, string> {
    const result = new Map<string, string>();
    for (const train of this.tracker.all()) {
      for (const block of train.blocks) {
        result.set(block.blockId, train.name);
      }
    }
    return result;
  }

  label(blockId: string, name: string | null): void {
    const before = this.tracker.at(blockId);
    this.tracker.label(blockId, name);
    if (before && !this.tracker.get(before.id)) {
      this.dropTrain(before.id);
    }
  }

  assignLoco(trainId: string, locoId: string | null): void {
    const train = this.tracker.get(trainId);
    if (!train) {
      return;
    }
    if (train.locoId && train.locoId !== locoId) {
      this.release(train.locoId);
      this.runs.delete(trainId);
    }
    // A loco belongs to one train.
    if (locoId) {
      for (const other of this.tracker.all()) {
        if (other.id !== trainId && other.locoId === locoId) {
          this.tracker.assignLoco(other.id, null);
          this.runs.delete(other.id);
        }
      }
    }
    this.tracker.assignLoco(trainId, locoId);
  }

  drive(trainId: string, blockId: string): void {
    if (!this.tracker.get(trainId)) {
      return;
    }
    this.replaceRun(trainId, {
      trainId,
      stops: [{blockId, dwellS: 0}],
      repeat: false,
      index: 0,
      state: 'waiting',
    });
  }

  runSchedule(trainId: string, scheduleId: string): void {
    const schedule = this.project?.schedules.find((s) => s.id === scheduleId);
    if (
      !this.tracker.get(trainId) ||
      !schedule ||
      schedule.stops.length === 0
    ) {
      return;
    }
    this.replaceRun(trainId, {
      trainId,
      stops: schedule.stops,
      repeat: schedule.repeat,
      scheduleId,
      index: 0,
      state: 'waiting',
    });
  }

  // Automatic driving off for this train: it brakes to 0, its route is
  // released, and its driver has it again once it stands.
  stopTrain(trainId: string): void {
    const run = this.runs.get(trainId);
    if (run?.routeId) {
      this.deps.releaseRoute(run.routeId);
    }
    if (run) {
      this.stopping.add(trainId);
    }
    this.runs.delete(trainId);
  }

  setPaused(paused: boolean): void {
    if (paused && !this.paused && this.runs.size > 0) {
      this.deps.notice({code: 'automationPaused'});
    }
    this.paused = paused;
  }

  occupancyChanged(blockId: string, occupied: boolean): void {
    const {notices} = this.tracker.occupancyChanged(
      blockId,
      occupied,
      this.trainContext(),
    );
    for (const notice of notices) {
      if (notice.code === 'trainLost') {
        this.dropTrain(notice.trainId);
      }
      this.deps.notice(notice);
    }
  }

  connectionLost(): void {
    // Trains and runs stay; positions are unknown until reported, so
    // protection holds what it cannot see (turnoutUnknown).
  }

  // Works out holds, automatic runs and loco targets again. Returns whether
  // the trains' live state changed.
  evaluate(): boolean {
    if (this.evaluating) {
      this.again = true;
      return false;
    }
    this.evaluating = true;
    try {
      let rounds = 0;
      do {
        this.again = false;
        this.evaluateOnce();
      } while (this.again && ++rounds < 5);
    } finally {
      this.evaluating = false;
    }
    const live = this.buildLive();
    const json = JSON.stringify(live);
    if (json === this.lastLive) {
      return false;
    }
    this.lastLive = json;
    this.live = live;
    return true;
  }

  private evaluateOnce(): void {
    const project = this.project;
    if (!project) {
      return;
    }
    const locos = new Map(project.locos.map((loco) => [loco.id, loco]));
    const protection = this.protectionContext();
    const wanted = new Map<string, LocoTarget | null>();
    let nextDwell: number | undefined;
    for (const train of this.tracker.all()) {
      const loco = train.locoId ? locos.get(train.locoId) : undefined;
      const hold = holdReason(train, protection);
      const previousHold = this.holds.get(train.id);
      if (hold && hold !== previousHold) {
        this.deps.notice({
          code: 'trainHeld',
          trainId: train.id,
          name: train.name,
          reason: hold,
        });
      }
      if (hold) {
        this.holds.set(train.id, hold);
      } else {
        this.holds.delete(train.id);
      }

      let target: LocoTarget | null = null;
      const run = this.runs.get(train.id);
      if (run) {
        const step = stepAuto(run, train, this.autoContext(train, loco));
        let next = step.run;
        if (step.releaseRoute) {
          this.deps.releaseRoute(step.releaseRoute);
          this.again = true;
        }
        if (step.setRoute) {
          // Once more afterwards: the route may be set at once.
          this.again = true;
          const routeId = this.deps.setRoute(step.setRoute);
          next = routeId
            ? {...next, routeId}
            : {...next, state: 'waiting', reason: 'routeFailed'};
        }
        if (next.state === 'done') {
          this.runs.delete(train.id);
          const stop = run.stops[run.index];
          if (stop) {
            this.deps.notice({
              code: 'trainArrived',
              trainId: train.id,
              name: train.name,
              blockId: stop.blockId,
            });
          }
        } else {
          this.runs.set(train.id, next);
          if (next.state === 'dwelling' && next.dwellUntil !== undefined) {
            nextDwell = Math.min(nextDwell ?? Infinity, next.dwellUntil);
          }
        }
        target = step.target;
      } else if (this.stopping.has(train.id)) {
        const speed = loco ? this.deps.locoSpeed(loco) : undefined;
        if (loco && speed !== undefined && speed > 0) {
          target = {kmh: 0};
        } else {
          this.stopping.delete(train.id);
        }
      }
      if (hold && loco) {
        target = {
          kmh: 0,
          ...(target?.forward !== undefined ? {forward: target.forward} : {}),
        };
      }
      if (loco) {
        wanted.set(loco.id, target);
      }
    }
    // Apply: changed targets, and release locos no longer in any train.
    for (const [locoId, target] of wanted) {
      const loco = locos.get(locoId)!;
      const json = JSON.stringify(target);
      if (this.targets.get(locoId) !== json) {
        this.deps.setLocoTarget(loco, target);
        if (target) {
          this.targets.set(locoId, json);
        } else {
          this.targets.delete(locoId);
        }
      }
    }
    for (const locoId of [...this.targets.keys()]) {
      if (!wanted.has(locoId)) {
        this.release(locoId);
      }
    }
    this.scheduleDwell(nextDwell);
  }

  private scheduleDwell(until: number | undefined): void {
    this.dwellTimer?.();
    this.dwellTimer = null;
    if (until === undefined) {
      return;
    }
    this.dwellTimer = this.deps.schedule(
      Math.max(0, until - this.deps.now()),
      () => {
        this.dwellTimer = null;
        this.evaluate();
      },
    );
  }

  private release(locoId: string): void {
    const loco = this.project?.locos.find((l) => l.id === locoId);
    if (loco) {
      this.deps.setLocoTarget(loco, null);
    }
    this.targets.delete(locoId);
  }

  private replaceRun(trainId: string, run: AutoRun): void {
    const old = this.runs.get(trainId);
    if (old?.routeId) {
      this.deps.releaseRoute(old.routeId);
    }
    this.stopping.delete(trainId);
    this.runs.set(trainId, run);
  }

  private dropTrain(trainId: string): void {
    const run = this.runs.get(trainId);
    if (run?.routeId) {
      this.deps.releaseRoute(run.routeId);
    }
    this.runs.delete(trainId);
    this.holds.delete(trainId);
    this.stopping.delete(trainId);
  }

  private locoOf(locoId: string): Loco | undefined {
    return this.project?.locos.find((loco) => loco.id === locoId);
  }

  private trainContext(): TrainContext {
    return {
      graph: this.graph,
      position: this.deps.position,
      occupied: this.deps.occupied,
      locoForward: (locoId) => {
        const loco = this.locoOf(locoId);
        return loco ? this.deps.locoForward(loco) : undefined;
      },
    };
  }

  private protectionContext(): ProtectionContext {
    const project = this.project!;
    const blocks = new Map(project.blocks.map((block) => [block.id, block]));
    return {
      graph: this.graph,
      position: this.deps.position,
      occupied: this.deps.occupied,
      levelOfBlock: this.deps.levelOfBlock,
      clearAhead: (blockId) =>
        blocks.get(blockId)?.clearAhead ?? project.settings.blocksClearAhead,
      signalAtStop: this.deps.signalAtStop,
      locoForward: (locoId) => {
        const loco = this.locoOf(locoId);
        return loco ? this.deps.locoForward(loco) : undefined;
      },
    };
  }

  private autoContext(train: Train, loco: Loco | undefined) {
    const project = this.project!;
    const topology = this.topology!;
    const own = new Set(train.blocks.map((block) => block.blockId));
    return {
      graph: this.graph,
      position: this.deps.position,
      levelOfBlock: this.deps.levelOfBlock,
      loco,
      speedKmh: loco ? this.deps.locoSpeed(loco) : undefined,
      paused: this.paused,
      now: this.deps.now(),
      routeState: (routeId: string) => this.deps.routes()[routeId]?.state,
      findRoute: (from: string, exits: NodeId[], to: string) =>
        findRouteToBlock(project, topology, from, exits, to),
      routeProblems: (plan: RoutePlan) =>
        routeProblems(plan, {
          topology,
          routes: this.deps.routePaths(),
          occupied: this.deps.occupied,
          levelOfBlock: this.deps.levelOfBlock,
          levelOfElement: this.deps.levelOfElement,
          ownBlocks: own,
        }),
    };
  }

  private buildLive(): Record<string, TrainLive> {
    const result: Record<string, TrainLive> = {};
    for (const train of this.tracker.all()) {
      const loco = train.locoId ? this.locoOf(train.locoId) : undefined;
      const speed = loco ? this.deps.locoSpeed(loco) : undefined;
      const forward = loco ? this.deps.locoForward(loco) : undefined;
      const run = this.runs.get(train.id);
      const hold = this.holds.get(train.id);
      result[train.id] = {
        id: train.id,
        name: train.name,
        ...(train.locoId ? {locoId: train.locoId} : {}),
        blockIds: train.blocks.map((block) => block.blockId),
        directionKnown: train.blocks[0]?.entryNode !== undefined,
        ...(train.aheadIsForward !== undefined
          ? {aheadIsForward: train.aheadIsForward}
          : {}),
        ...(speed !== undefined ? {speedKmh: Math.round(speed)} : {}),
        ...(forward !== undefined ? {forward} : {}),
        ...(hold ? {hold} : {}),
        ...(run
          ? {
              auto: {
                state: run.state,
                ...(run.reason ? {reason: run.reason} : {}),
                ...(run.scheduleId
                  ? {scheduleId: run.scheduleId}
                  : {destinationBlockId: run.stops[0]?.blockId}),
                stopIndex: run.index,
              },
            }
          : {}),
        controlled: loco ? this.targets.has(loco.id) : false,
      };
    }
    return result;
  }
}
