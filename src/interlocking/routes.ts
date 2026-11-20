// Set routes of this instance (Level 2, RTE-4 – RTE-8, MULTI-4, MULTI-6).
// PURE apart from its dependencies; driven by the Interlocking, which tells
// it every change of a turnout.
//
// A route is "setting" while its turnouts move (through the queue), waits
// for the operator to confirm manual turnouts thrown by hand, and is "set"
// once every turnout is where the route needs it; only then are its signals
// set (RTE-5). A turnout of a set route that moves for any reason makes it
// "broken": its signals go to stop at once (RTE-6c). Level 2 has no other
// protection: nothing is locked and occupancy is not checked (RTE-7).
// Level 3 will add checks and locks per area (MIX-4) around this module.
import {Project} from '../model/project';
import {
  routeSignalAspects,
  routeSignalsToStop,
  SignalSetting,
} from '../model/routeSignals';
import {RoutePlan} from '../model/routing';
import {RouteLive, TurnoutLive} from '../shared/liveState';

// Undo goes back at most this many routes (RTE-6b).
export const UNDO_HISTORY = 10;

export type RouteNotice =
  | {code: 'routeSet'; routeId: string}
  | {code: 'routeFailed'; routeId: string; elementId: string}
  | {code: 'routeBroken'; routeId: string; elementId: string}
  // Cancelled because a new route conflicts with it (`elementId`: its
  // start, `toElementId`: its end).
  | {
      code: 'routeCancelled';
      routeId: string;
      elementId: string;
      toElementId: string;
    }
  | {
      code: 'routeUndone';
      routeId: string;
      // Changed since by something else: left alone.
      skipped: string[];
      // Manual turnouts to put back by hand.
      manualBack: string[];
    };

export type RouteDeps = {
  project: () => Project | null;
  turnout: (id: string) => TurnoutLive | undefined;
  setTurnout: (id: string, position: string) => void;
  setSignal: (id: string, aspectId: string) => void;
  // A manual turnout thrown by hand, as confirmed by the operator.
  recordManual: (id: string, position: string) => void;
  notice: (notice: RouteNotice) => void;
  changed: () => void;
};

type Route = {
  id: string;
  order: number;
  plan: RoutePlan;
  state: RouteLive['state'];
  // Positions before the route was set, for undo (RTE-6b).
  before: Record<string, string | undefined>;
  // Signals the route set (returned to stop on release or break).
  signals: SignalSetting[];
  failedTurnoutId?: string;
  brokenTurnoutId?: string;
};

export class RouteManager {
  private readonly routes = new Map<string, Route>();
  private counter = 0;
  // Turnouts being thrown back by undo: their changes break nothing.
  private evaluating = false;

  constructor(private readonly deps: RouteDeps) {}

  live(): Record<string, RouteLive> {
    const result: Record<string, RouteLive> = {};
    for (const route of this.routes.values()) {
      result[route.id] = {
        id: route.id,
        order: route.order,
        from: route.plan.from,
        to: route.plan.to,
        via: route.plan.via,
        state: route.state,
        segments: route.plan.segments,
        steps: route.plan.steps,
        turnouts: route.plan.turnouts.map(({turnoutId, position, manual}) => ({
          turnoutId,
          position,
          manual,
        })),
        manualToSet: this.manualMissing(route),
        areas: route.plan.areas,
        ...(route.failedTurnoutId
          ? {failedTurnoutId: route.failedTurnoutId}
          : {}),
        ...(route.brokenTurnoutId
          ? {brokenTurnoutId: route.brokenTurnoutId}
          : {}),
      };
    }
    return result;
  }

  // RTE-4: throw what is not already in place, then wait for the reports.
  set(plan: RoutePlan): string {
    const id = `route-${++this.counter}`;
    const route: Route = {
      id,
      order: this.counter,
      plan,
      state: 'setting',
      before: Object.fromEntries(
        plan.turnouts.map((t) => [
          t.turnoutId,
          this.deps.turnout(t.turnoutId)?.position,
        ]),
      ),
      signals: [],
    };
    this.routes.set(id, route);
    for (const turnout of plan.turnouts) {
      if (turnout.manual) {
        continue;
      }
      const live = this.deps.turnout(turnout.turnoutId);
      if (live?.status !== 'confirmed' || live.position !== turnout.position) {
        this.deps.setTurnout(turnout.turnoutId, turnout.position);
      }
    }
    this.evaluate(route);
    this.deps.changed();
    return id;
  }

  // A turnout changed (any cause): routes using it are re-evaluated.
  turnoutChanged(turnoutId: string): void {
    if (this.evaluating) {
      return;
    }
    let changed = false;
    for (const route of this.routes.values()) {
      if (route.plan.turnouts.some((t) => t.turnoutId === turnoutId)) {
        changed = this.evaluate(route) || changed;
      }
    }
    if (changed) {
      this.deps.changed();
    }
  }

  // The operator has thrown the route's manual turnouts by hand (RTE-4).
  confirmManual(routeId: string): void {
    const route = this.routes.get(routeId);
    if (!route) {
      return;
    }
    this.evaluating = true;
    for (const turnout of route.plan.turnouts) {
      if (turnout.manual) {
        this.deps.recordManual(turnout.turnoutId, turnout.position);
      }
    }
    this.evaluating = false;
    this.evaluate(route);
    this.deps.changed();
  }

  // RTE-8: a route not yet set is dropped; its turnouts stay where they are.
  cancel(routeId: string): void {
    const route = this.routes.get(routeId);
    if (route && route.state !== 'set') {
      this.routes.delete(routeId);
      this.deps.changed();
    }
  }

  // The path of every route, for the conflict check of a new one.
  paths(): {id: string; steps: RoutePlan['steps']}[] {
    return [...this.routes.values()].map((route) => ({
      id: route.id,
      steps: route.plan.steps,
    }));
  }

  // A new route conflicts with this one: it is dropped at once, set or not,
  // its signals to stop first (before the new route moves any turnout).
  cancelForConflict(routeId: string): void {
    const route = this.routes.get(routeId);
    if (!route) {
      return;
    }
    this.signalsToStop(route);
    this.routes.delete(routeId);
    this.deps.notice({
      code: 'routeCancelled',
      routeId,
      elementId: route.plan.from,
      toElementId: route.plan.to,
    });
    this.deps.changed();
  }

  // RTE-6: the route's signals return to stop; turnouts stay.
  release(routeId: string): void {
    const route = this.routes.get(routeId);
    if (!route) {
      return;
    }
    this.signalsToStop(route);
    this.routes.delete(routeId);
    this.deps.changed();
  }

  // RTE-6b: the most recent route: signals to stop, turnouts back where they
  // were (unless something else has moved them since), released.
  undoLast(): void {
    const recent = [...this.routes.values()]
      .sort((a, b) => b.order - a.order)
      .filter((route) => route.order > this.counter - UNDO_HISTORY);
    const route = recent[0];
    if (!route) {
      return;
    }
    this.signalsToStop(route);
    const skipped: string[] = [];
    const manualBack: string[] = [];
    this.routes.delete(route.id);
    for (const turnout of route.plan.turnouts) {
      const before = route.before[turnout.turnoutId];
      if (before === undefined || before === turnout.position) {
        continue;
      }
      if (turnout.manual) {
        manualBack.push(turnout.turnoutId);
        continue;
      }
      const live = this.deps.turnout(turnout.turnoutId);
      const now = live?.commanded ?? live?.position;
      if (now !== turnout.position) {
        skipped.push(turnout.turnoutId);
        continue;
      }
      this.deps.setTurnout(turnout.turnoutId, before);
    }
    this.deps.notice({
      code: 'routeUndone',
      routeId: route.id,
      skipped,
      manualBack,
    });
    this.deps.changed();
  }

  // Elements no longer in the project break the routes that use them.
  layoutChanged(): void {
    let changed = false;
    for (const route of this.routes.values()) {
      changed = this.evaluate(route) || changed;
    }
    if (changed) {
      this.deps.changed();
    }
  }

  private manualMissing(route: Route): string[] {
    return route.plan.turnouts
      .filter(
        (t) =>
          t.manual && this.deps.turnout(t.turnoutId)?.position !== t.position,
      )
      .map((t) => t.turnoutId);
  }

  // Moves the route on; returns true if its state changed.
  private evaluate(route: Route): boolean {
    const before = route.state;
    const addressed = route.plan.turnouts.filter((t) => !t.manual);
    if (route.state === 'set') {
      const moved = route.plan.turnouts.find(
        (t) => this.deps.turnout(t.turnoutId)?.position !== t.position,
      );
      if (moved) {
        // RTE-6c / MULTI-4: signals to stop at once, then tell the operator.
        route.state = 'broken';
        route.brokenTurnoutId = moved.turnoutId;
        this.signalsToStop(route);
        this.deps.notice({
          code: 'routeBroken',
          routeId: route.id,
          elementId: moved.turnoutId,
        });
      }
      return route.state !== before;
    }
    if (route.state !== 'setting' && route.state !== 'awaitingManual') {
      return false;
    }
    const failed = addressed.find((t) => {
      const live = this.deps.turnout(t.turnoutId);
      return live?.status === 'failed' && live.position !== t.position;
    });
    if (failed) {
      route.state = 'failed';
      route.failedTurnoutId = failed.turnoutId;
      this.deps.notice({
        code: 'routeFailed',
        routeId: route.id,
        elementId: failed.turnoutId,
      });
      return true;
    }
    const inPlace = addressed.every((t) => {
      const live = this.deps.turnout(t.turnoutId);
      return (
        live?.position === t.position &&
        live.commanded === undefined &&
        live.status !== 'unknown'
      );
    });
    if (!inPlace) {
      return route.state !== before;
    }
    if (this.manualMissing(route).length > 0) {
      route.state = 'awaitingManual';
      return route.state !== before;
    }
    route.state = 'set';
    this.setSignals(route);
    this.deps.notice({code: 'routeSet', routeId: route.id});
    return true;
  }

  private setSignals(route: Route): void {
    const project = this.deps.project();
    if (!project?.settings.autoSignalsOnRoute) {
      return;
    }
    route.signals = routeSignalAspects(project, route.plan);
    route.signals.forEach(({signalId, aspectId}) =>
      this.deps.setSignal(signalId, aspectId),
    );
  }

  private signalsToStop(route: Route): void {
    const project = this.deps.project();
    if (!project) {
      return;
    }
    routeSignalsToStop(project, route.signals).forEach(({signalId, aspectId}) =>
      this.deps.setSignal(signalId, aspectId),
    );
    route.signals = [];
  }
}
