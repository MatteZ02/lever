// Level 4, automatic routing and driving (section 9, MIX-7): one train
// driven to a destination block, or along a schedule's stops. Pure: each
// call works out the next state, the loco's target speed and what the
// interlocking must do (set or release a route), from the situation given.
//
// waiting  → find the route from the train's front (or, for a train in one
//            block, from its back: it reverses), only through Level 4 areas;
//            check it as Level 3 does (no occupied blocks, no conflicting
//            routes); set it. Retried on every change until it can be set.
// routing  → the route's turnouts move; the train stands.
// running  → cruising speed; approach speed once the next block is the
//            destination.
// stopping → in the destination block: brake to 0 at the loco's braking
//            rate. Then the route is released, and the train waits its
//            dwell time before the next stop (dwelling), or is done.
// Level 3 protection still applies on top (a hold brakes to 0 whatever the
// state). Pausing automation brakes every automatic train and keeps its
// state; STOP and track power off pause it too.
import {BlockGraph, nextBlock} from '../model/blockGraph';
import {Loco, ScheduleStop} from '../model/locos';
import {AutomationLevel} from '../model/project';
import {RouteProblem} from '../model/routeChecks';
import {RoutePlan} from '../model/routing';
import {NodeId} from '../model/topology';
import {LocoTarget, Train} from './trains';

export type AutoState =
  'waiting' | 'routing' | 'running' | 'stopping' | 'dwelling' | 'done';

// Why an automatic train is waiting (shown to the operator).
export type AutoReason =
  | 'paused'
  | 'noLoco'
  | 'directionUnknown'
  | 'notLevel4'
  | 'noRoute'
  | 'occupied'
  | 'conflict'
  | 'routeFailed';

export type AutoRun = {
  trainId: string;
  stops: ScheduleStop[];
  repeat: boolean;
  scheduleId?: string;
  index: number;
  state: AutoState;
  reason?: AutoReason;
  routeId?: string;
  // The route leaves the train's back: it reverses.
  reverse?: boolean;
  // The front block when the route was set (reversing ends once the train
  // has moved into a new block).
  routeFrom?: string;
  // Dwelling until (ms, the interlocking's clock).
  dwellUntil?: number;
};

export type AutoContext = {
  graph: BlockGraph;
  position: (turnoutId: string) => string | undefined;
  levelOfBlock: (blockId: string) => AutomationLevel;
  loco: Loco | undefined;
  // The loco's speed now (km/h), as driven or reported.
  speedKmh: number | undefined;
  paused: boolean;
  now: number;
  routeState: (
    routeId: string,
  ) => 'setting' | 'set' | 'failed' | 'unconfirmed' | undefined;
  findRoute: (
    fromBlockId: string,
    exitNodes: NodeId[],
    toBlockId: string,
  ) => RoutePlan | undefined;
  routeProblems: (plan: RoutePlan) => RouteProblem[];
};

export type AutoStep = {
  run: AutoRun;
  // null: Lever does not drive the loco (the train cannot run).
  target: LocoTarget | null;
  setRoute?: RoutePlan;
  releaseRoute?: string;
};

const stand = (run: AutoRun, forward: boolean | undefined): LocoTarget => ({
  kmh: 0,
  ...(forward !== undefined ? {forward} : {}),
});

export const stepAuto = (
  input: AutoRun,
  train: Train,
  context: AutoContext,
): AutoStep => {
  const run: AutoRun = {...input};
  const front = train.blocks[0];
  const {loco} = context;
  if (!loco || !front) {
    return {run: {...run, state: 'waiting', reason: 'noLoco'}, target: null};
  }
  if (run.reverse && run.routeFrom && front.blockId !== run.routeFrom) {
    // Moved into a new block: "ahead" is its direction of travel now.
    run.reverse = false;
  }
  const ahead = train.aheadIsForward;
  const forward =
    ahead === undefined ? undefined : run.reverse ? !ahead : ahead;
  if (context.paused) {
    return {run: {...run, reason: 'paused'}, target: stand(run, forward)};
  }
  run.reason = run.reason === 'paused' ? undefined : run.reason;
  if (ahead === undefined || front.entryNode === undefined) {
    return {
      run: {...run, state: 'waiting', reason: 'directionUnknown'},
      target: stand(run, undefined),
    };
  }
  const stop = run.stops[run.index];
  if (!stop) {
    return {run: {...run, state: 'done'}, target: null};
  }
  // MIX-7: automatic driving only inside Level 4 areas.
  if (context.levelOfBlock(front.blockId) !== 4) {
    return {
      run: {...run, state: 'waiting', reason: 'notLevel4'},
      target: stand(run, forward),
    };
  }
  const speed = context.speedKmh ?? 0;

  // At the stop: brake, then release the route and dwell.
  if (front.blockId === stop.blockId) {
    if (run.state !== 'dwelling') {
      if (speed > 0) {
        return {run: {...run, state: 'stopping'}, target: stand(run, forward)};
      }
      const released = run.routeId;
      const last = run.index >= run.stops.length - 1;
      const next: AutoRun = {
        ...run,
        routeId: undefined,
        reverse: false,
        state: last && !run.repeat ? 'done' : 'dwelling',
        dwellUntil: context.now + stop.dwellS * 1000,
        reason: undefined,
      };
      return {
        run: next,
        target: next.state === 'done' ? null : stand(next, forward),
        ...(released ? {releaseRoute: released} : {}),
      };
    }
    if (run.dwellUntil !== undefined && context.now < run.dwellUntil) {
      return {run, target: stand(run, forward)};
    }
    const index = (run.index + 1) % run.stops.length;
    return stepAuto(
      {...run, index, state: 'waiting', dwellUntil: undefined},
      train,
      context,
    );
  }

  switch (run.state) {
    case 'dwelling':
    case 'done':
    case 'waiting':
    case 'stopping': {
      if (speed > 0 && run.state === 'stopping') {
        return {run, target: stand(run, forward)};
      }
      if (context.levelOfBlock(stop.blockId) !== 4) {
        return {
          run: {...run, state: 'waiting', reason: 'notLevel4'},
          target: stand(run, forward),
        };
      }
      // Ahead first; a train in one block may reverse.
      const exits: {nodes: NodeId[]; reverse: boolean}[] = [
        {
          nodes: (context.graph.ends.get(front.blockId) ?? []).filter(
            (node) => node !== front.entryNode,
          ),
          reverse: false,
        },
      ];
      if (train.blocks.length === 1) {
        exits.push({nodes: [front.entryNode], reverse: true});
      }
      let reason: AutoReason = 'noRoute';
      for (const exit of exits) {
        const plan = context.findRoute(front.blockId, exit.nodes, stop.blockId);
        if (!plan) {
          continue;
        }
        if (plan.areas.some((area) => area.level !== 4)) {
          reason = 'notLevel4';
          continue;
        }
        const problems = context.routeProblems(plan);
        if (problems.length > 0) {
          reason = problems[0].kind === 'occupied' ? 'occupied' : 'conflict';
          continue;
        }
        const next: AutoRun = {
          ...run,
          state: 'routing',
          reason: undefined,
          reverse: exit.reverse,
          routeFrom: front.blockId,
        };
        return {
          run: next,
          target: stand(next, exit.reverse ? !ahead : ahead),
          setRoute: plan,
        };
      }
      return {
        run: {...run, state: 'waiting', reason},
        target: stand(run, forward),
      };
    }
    case 'routing': {
      const state = run.routeId ? context.routeState(run.routeId) : undefined;
      if (state === 'set') {
        return stepAuto({...run, state: 'running'}, train, context);
      }
      if (state === 'setting' || state === 'unconfirmed') {
        return {run, target: stand(run, forward)};
      }
      // Failed, or released meanwhile: try again.
      return {
        run: {
          ...run,
          state: 'waiting',
          routeId: undefined,
          reason: 'routeFailed',
        },
        target: stand(run, forward),
        ...(run.routeId && state === 'failed'
          ? {releaseRoute: run.routeId}
          : {}),
      };
    }
    case 'running': {
      const state = run.routeId ? context.routeState(run.routeId) : undefined;
      if (state !== 'set' && state !== 'unconfirmed') {
        // The route was released (a turnout moved): stop, then find a new
        // one.
        return {
          run: {...run, state: 'stopping', routeId: undefined},
          target: stand(run, forward),
        };
      }
      const next = nextBlock(
        context.graph,
        front.blockId,
        front.entryNode,
        context.position,
      );
      const approaching =
        next.kind === 'block' && next.exit.to === stop.blockId;
      return {
        run,
        target: {
          kmh: approaching ? loco.approachKmh : loco.cruiseKmh,
          ...(forward !== undefined ? {forward} : {}),
        },
      };
    }
  }
};
