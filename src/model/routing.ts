// Route finding (RTE-1, RTE-2, RTE-3; Level 2). PURE.
//
// The search runs over directed edges of the project topology (stations
// joined through paired exits), so a route can only pass a turnout leg to
// leg in valid directions, never reverses on the spot, and knows its
// direction of travel at every signal. The cost prefers the fewest
// turnouts, diverging movements and signals (ROUTE_WEIGHTS); every equally
// cheap route is returned, so the operator can choose on a tie.
import {areaOf} from './areas';
import {DiagramElement, Signal, Turnout} from './elements';
import {Direction, GridPoint, opposite, samePoint} from './geometry';
import {turnoutPorts} from './ports';
import {AutomationLevel, Project, StationView} from './project';
import {
  buildProjectTopology,
  crossingNode,
  leavingDirectionAt,
  NodeId,
  nodeId,
  Topology,
  TopologyEdge,
} from './topology';

// The weights of the route cost (RTE-2). Tune here; a route with a lower
// sum wins. The length only separates otherwise equal routes of clearly
// different length, and makes sure a route never runs in a circle.
export const ROUTE_WEIGHTS = {
  // Each turnout (also slips, and manual turnouts, RTE-2).
  turnout: 10,
  // Each diverging (non-straight) movement through a turnout, on top.
  diverging: 6,
  // Each signal passed between start and end, in either direction.
  signal: 2,
  // Per grid step of track.
  length: 0.01,
} as const;

// At most this many equally good routes are offered.
export const MAX_ALTERNATIVES = 6;
const EPSILON = 1e-6;

export type RouteTurnout = {
  turnoutId: string;
  viewId: string;
  position: string;
  // Not connected (ACC-5): thrown by hand and confirmed by the operator.
  manual: boolean;
};

export type RouteArea = {
  areaId: string;
  name: string;
  level: AutomationLevel;
};

// A signal passed by the route, in order: does it face the direction of
// travel, and is there a diverging movement before the next signal facing
// that way (for the reduced-speed aspect, RTE-5)?
export type PassedSignal = {
  signalId: string;
  facing: boolean;
  divergingAhead: boolean;
};

export type RoutePlan = {
  from: string;
  to: string;
  via: string[];
  steps: {edgeId: string; forward: boolean}[];
  turnouts: RouteTurnout[];
  // Signals passed (the start signal first), not the end signal.
  passedSignals: PassedSignal[];
  // A signal at the end, facing the route: the train stops in front of it.
  endSignalId?: string;
  // What to draw: one polyline per stretch in one view.
  segments: {viewId: string; points: GridPoint[]}[];
  areas: RouteArea[];
  blockIds: string[];
  cost: number;
  // Identifies the alternative (the turnout positions it needs).
  key: string;
};

export type RouteSearch =
  | {ok: true; routes: RoutePlan[]}
  | {
      ok: false;
      reason: 'notRoutePoint' | 'samePoint' | 'noPath';
      elementId?: string;
    };

export type Directed = {edge: TopologyEdge; forward: boolean};
type ElementInfo = {element: DiagramElement; view: StationView};

const stateKey = (d: Directed) => `${d.edge.id}|${d.forward ? 1 : 0}`;
export const fromNode = (d: Directed) => (d.forward ? d.edge.from : d.edge.to);
export const toNode = (d: Directed) => (d.forward ? d.edge.to : d.edge.from);

// Direction of travel when leaving the start of a directed edge (track).
export const leavingDirection = (d: Directed): Direction | undefined =>
  d.edge.kind === 'track'
    ? d.forward
      ? d.edge.fromDirection
      : d.edge.toDirection
    : undefined;

// Direction of travel when arriving at the end of a directed edge (track).
export const arrivingDirection = (d: Directed): Direction | undefined =>
  d.edge.kind === 'track'
    ? opposite(d.forward ? d.edge.toDirection : d.edge.fromDirection)
    : undefined;

const sameTurnout = (a: TopologyEdge, b: TopologyEdge) =>
  a.kind === 'turnout' && b.kind === 'turnout' && a.turnoutId === b.turnoutId;

// Where a route can go on after `d`: any other edge at its end, except
// another passage of the same turnout (that would reverse inside it). At a
// crossing without an element, only straight on.
export const successors = (topology: Topology, d: Directed): Directed[] => {
  const node = toNode(d);
  const result: Directed[] = [];
  const arriving = leavingDirectionAt(d.edge, node);
  const straightOn =
    crossingNode(topology, node) && arriving !== undefined
      ? opposite(arriving)
      : undefined;
  for (const id of topology.edgesAt.get(node) ?? []) {
    const edge = topology.edgeById.get(id)!;
    if (edge.id === d.edge.id || sameTurnout(edge, d.edge)) {
      continue;
    }
    if (straightOn && leavingDirectionAt(edge, node) !== straightOn) {
      continue;
    }
    if (edge.from === node) {
      result.push({edge, forward: true});
    }
    if (edge.to === node) {
      result.push({edge, forward: false});
    }
  }
  return result;
};

const elementIndex = (project: Project) => {
  const index = new Map<string, ElementInfo>();
  for (const view of project.views) {
    for (const element of view.elements) {
      index.set(element.id, {element, view});
    }
  }
  return index;
};

// Which elements can start or end a route (RTE-1).
const ROUTE_POINT_KINDS = new Set([
  'signal',
  'turnout',
  'virtualPoint',
  'connector',
]);

// Where a route may begin at an element, and in which direction.
const startStates = (topology: Topology, info: ElementInfo): Directed[] => {
  const {element, view} = info;
  const leavingFrom = (node: NodeId) =>
    (topology.edgesAt.get(node) ?? []).flatMap((id) => {
      const edge = topology.edgeById.get(id)!;
      const states: Directed[] = [];
      if (edge.from === node) states.push({edge, forward: true});
      if (edge.to === node) states.push({edge, forward: false});
      return states;
    });
  if (element.kind === 'turnout') {
    // From any leg, outwards.
    return turnoutPorts(element).flatMap((port) =>
      leavingFrom(nodeId(view.id, port.at)).filter(
        (d) => !(d.edge.kind === 'turnout' && d.edge.turnoutId === element.id),
      ),
    );
  }
  if (!('at' in element)) {
    return [];
  }
  const states = leavingFrom(nodeId(view.id, element.at));
  // A signal is left in the direction it faces (RTE-2).
  if (element.kind === 'signal') {
    return states.filter((d) => {
      const direction = leavingDirection(d);
      return direction === undefined || direction === element.facing;
    });
  }
  return states;
};

// Whether arriving by `d` ends the route at the element.
const endsAt = (topology: Topology, info: ElementInfo, d: Directed) => {
  const {element, view} = info;
  if (element.kind === 'turnout') {
    if (d.edge.kind === 'turnout' && d.edge.turnoutId === element.id) {
      return false;
    }
    return turnoutPorts(element).some(
      (port) => toNode(d) === nodeId(view.id, port.at),
    );
  }
  if (!('at' in element) || toNode(d) !== nodeId(view.id, element.at)) {
    return false;
  }
  // A signal is approached in the direction it faces: the train stops in
  // front of it.
  if (element.kind === 'signal') {
    const direction = arrivingDirection(d);
    return direction === undefined || direction === element.facing;
  }
  return true;
};

const signalsAt = (
  topology: Topology,
  index: Map<string, ElementInfo>,
  node: NodeId,
): Signal[] =>
  (topology.nodes.get(node)?.elementIds ?? []).flatMap((id) => {
    const element = index.get(id)?.element;
    return element?.kind === 'signal' ? [element] : [];
  });

const stepCost = (
  topology: Topology,
  index: Map<string, ElementInfo>,
  d: Directed,
) => {
  const edge = d.edge;
  let cost = ROUTE_WEIGHTS.length * edge.length;
  if (edge.kind === 'turnout' && edge.positions.length > 0) {
    cost += ROUTE_WEIGHTS.turnout;
    if (edge.diverging) {
      cost += ROUTE_WEIGHTS.diverging;
    }
  }
  return (
    cost + ROUTE_WEIGHTS.signal * signalsAt(topology, index, toNode(d)).length
  );
};

// All cheapest paths from the start states to an end state: Dijkstra over
// directed edges, keeping every equally cheap predecessor, then walking
// back. Every step costs something (length), so there are no cycles.
const cheapestPaths = (
  topology: Topology,
  index: Map<string, ElementInfo>,
  starts: Directed[],
  isEnd: (d: Directed) => boolean,
): {paths: Directed[][]; cost: number} | undefined => {
  const cost = new Map<string, number>();
  const preds = new Map<string, string[]>();
  const states = new Map<string, Directed>();
  const queue: {key: string; cost: number}[] = [];
  const push = (d: Directed, c: number, pred?: string) => {
    const key = stateKey(d);
    const known = cost.get(key);
    if (known === undefined || c < known - EPSILON) {
      cost.set(key, c);
      preds.set(key, pred ? [pred] : []);
      states.set(key, d);
      queue.push({key, cost: c});
    } else if (Math.abs(c - known) <= EPSILON && pred) {
      preds.get(key)!.push(pred);
    }
  };
  for (const d of starts) {
    push(d, stepCost(topology, index, d));
  }
  const done = new Set<string>();
  const ends: string[] = [];
  let best = Infinity;
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const {key, cost: c} = queue.shift()!;
    if (done.has(key) || c > (cost.get(key) ?? Infinity) + EPSILON) {
      continue;
    }
    if (c > best + EPSILON) {
      break;
    }
    done.add(key);
    const d = states.get(key)!;
    if (isEnd(d)) {
      best = Math.min(best, c);
      ends.push(key);
      continue;
    }
    for (const next of successors(topology, d)) {
      if (!done.has(stateKey(next))) {
        push(next, c + stepCost(topology, index, next), key);
      }
    }
  }
  if (ends.length === 0) {
    return undefined;
  }
  const paths: Directed[][] = [];
  const walk = (key: string, tail: Directed[]) => {
    if (paths.length >= MAX_ALTERNATIVES * 4) {
      return;
    }
    const path = [states.get(key)!, ...tail];
    const before = preds.get(key) ?? [];
    if (before.length === 0) {
      paths.push(path);
      return;
    }
    before.forEach((pred) => walk(pred, path));
  };
  ends
    .filter((key) => Math.abs(cost.get(key)! - best) <= EPSILON)
    .forEach((key) => walk(key, []));
  return {paths, cost: best};
};

// The turnout positions a path needs; undefined if it needs one turnout in
// two positions (e.g. round a reversing loop and back through it).
const turnoutPositionsOf = (
  path: Directed[],
  index: Map<string, ElementInfo>,
): RouteTurnout[] | undefined => {
  const result = new Map<string, RouteTurnout>();
  for (const {edge} of path) {
    if (edge.kind !== 'turnout' || edge.positions.length === 0) {
      continue;
    }
    const position = edge.positions[0];
    const known = result.get(edge.turnoutId);
    if (known && known.position !== position) {
      return undefined;
    }
    const turnout = index.get(edge.turnoutId)?.element as Turnout | undefined;
    result.set(edge.turnoutId, {
      turnoutId: edge.turnoutId,
      viewId: edge.viewId,
      position,
      manual: turnout?.control.kind === 'manual',
    });
  }
  return [...result.values()];
};

const describePath = (
  project: Project,
  topology: Topology,
  index: Map<string, ElementInfo>,
  path: Directed[],
  turnouts: RouteTurnout[],
  endpoints: {from: string; to: string; via: string[]},
  cost: number,
): RoutePlan => {
  // Drawing: points of every step, joined per view.
  const segments: RoutePlan['segments'] = [];
  const addPoints = (viewId: string, points: GridPoint[]) => {
    const last = segments[segments.length - 1];
    if (
      last &&
      last.viewId === viewId &&
      samePoint(last.points[last.points.length - 1], points[0])
    ) {
      last.points.push(...points.slice(1));
    } else {
      segments.push({viewId, points: [...points]});
    }
  };
  const areas: RouteArea[] = [];
  const addArea = (info: ElementInfo | undefined) => {
    const area = info && areaOf(project, info.view, info.element);
    if (area && !areas.some((a) => a.areaId === area.id)) {
      areas.push({areaId: area.id, name: area.name, level: area.level});
    }
  };
  const blockIds: string[] = [];
  for (const d of path) {
    const edge = d.edge;
    if (edge.kind === 'track') {
      addPoints(
        edge.viewId,
        d.forward ? edge.points : [...edge.points].reverse(),
      );
      addArea(index.get(edge.trackId));
      if (edge.blockId && !blockIds.includes(edge.blockId)) {
        blockIds.push(edge.blockId);
      }
    } else if (edge.kind === 'turnout') {
      const info = index.get(edge.turnoutId);
      const turnout = info?.element as Turnout | undefined;
      if (turnout) {
        const ports = new Map(turnoutPorts(turnout).map((p) => [p.name, p]));
        const a = ports.get(d.forward ? edge.fromPort : edge.toPort)!;
        const b = ports.get(d.forward ? edge.toPort : edge.fromPort)!;
        addPoints(edge.viewId, [a.at, turnout.at, b.at]);
      }
      addArea(info);
    }
  }

  // Signals passed, in order, with the direction of travel there.
  const passed: {signal: Signal; facing: boolean; index: number}[] = [];
  path.forEach((d, i) => {
    const node = fromNode(d);
    const direction =
      leavingDirection(d) ??
      (i > 0 ? arrivingDirection(path[i - 1]) : undefined);
    for (const signal of signalsAt(topology, index, node)) {
      passed.push({
        signal,
        facing: direction === undefined || signal.facing === direction,
        index: i,
      });
    }
  });
  const lastStep = path[path.length - 1];
  const endDirection = arrivingDirection(lastStep);
  const endSignal = signalsAt(topology, index, toNode(lastStep)).find(
    (signal) => endDirection === undefined || signal.facing === endDirection,
  );
  const passedSignals: PassedSignal[] = passed.map((entry, n) => {
    // Up to the next signal facing the same way, or the end.
    const next = passed.slice(n + 1).find((other) => other.facing);
    const stop = next ? next.index : path.length;
    const divergingAhead = path
      .slice(entry.index, stop)
      .some(({edge}) => edge.kind === 'turnout' && edge.diverging);
    return {signalId: entry.signal.id, facing: entry.facing, divergingAhead};
  });

  return {
    ...endpoints,
    steps: path.map((d) => ({edgeId: d.edge.id, forward: d.forward})),
    turnouts,
    passedSignals,
    endSignalId: endSignal?.id,
    segments,
    areas,
    blockIds,
    cost,
    key: turnouts
      .map((t) => `${t.turnoutId}=${t.position}`)
      .sort()
      .join(','),
  };
};

// Finds the best route(s) from one route point to another, through the
// given via points in order (RTE-3). With via points, each stretch takes
// its first best path, so the result is one route.
export const findRoutes = (
  project: Project,
  from: string,
  to: string,
  via: string[] = [],
  topology: Topology = buildProjectTopology(project),
): RouteSearch => {
  const index = elementIndex(project);
  const points = [from, ...via, to];
  for (const id of points) {
    const info = index.get(id);
    if (!info || !ROUTE_POINT_KINDS.has(info.element.kind)) {
      return {ok: false, reason: 'notRoutePoint', elementId: id};
    }
  }
  if (from === to && via.length === 0) {
    return {ok: false, reason: 'samePoint'};
  }

  // Stretch by stretch; a stretch after a via point continues from the
  // previous one without reversing.
  let prefixes: {path: Directed[]; cost: number}[] = [{path: [], cost: 0}];
  for (let i = 1; i < points.length; i++) {
    const target = index.get(points[i])!;
    const extended: {path: Directed[]; cost: number}[] = [];
    for (const prefix of prefixes) {
      const starts =
        prefix.path.length === 0
          ? startStates(topology, index.get(points[0])!)
          : successors(topology, prefix.path[prefix.path.length - 1]);
      const result = cheapestPaths(topology, index, starts, (d) =>
        endsAt(topology, target, d),
      );
      if (!result) {
        continue;
      }
      // Without via points every tie is kept; with them, the first.
      const keep = via.length === 0 ? result.paths : result.paths.slice(0, 1);
      for (const path of keep) {
        extended.push({
          path: [...prefix.path, ...path],
          cost: prefix.cost + result.cost,
        });
      }
    }
    if (extended.length === 0) {
      return {ok: false, reason: 'noPath'};
    }
    prefixes = extended;
  }

  const routes: RoutePlan[] = [];
  for (const {path, cost} of prefixes) {
    const turnouts = turnoutPositionsOf(path, index);
    if (!turnouts) {
      continue;
    }
    const plan = describePath(
      project,
      topology,
      index,
      path,
      turnouts,
      {from, to, via},
      cost,
    );
    if (!routes.some((r) => r.key === plan.key)) {
      routes.push(plan);
    }
  }
  if (routes.length === 0) {
    return {ok: false, reason: 'noPath'};
  }
  return {ok: true, routes: routes.slice(0, MAX_ALTERNATIVES)};
};

// Elements that can be clicked as a route's start or end (RTE-1).
export const isRoutePoint = (element: DiagramElement): boolean =>
  ROUTE_POINT_KINDS.has(element.kind);

// Level 4: the best route for a train from its block to another block,
// leaving its block at one of `exitNodes` (its front, or its back when it
// reverses). The route ends where the train enters the destination block;
// `from` and `to` are the block ids. Undefined if there is none.
export const findRouteToBlock = (
  project: Project,
  topology: Topology,
  fromBlockId: string,
  exitNodes: readonly NodeId[],
  toBlockId: string,
): RoutePlan | undefined => {
  if (fromBlockId === toBlockId) {
    return undefined;
  }
  const index = elementIndex(project);
  const inBlock = (edge: TopologyEdge, block: string) =>
    edge.kind === 'track' && edge.blockId === block;
  const starts: Directed[] = [];
  for (const edge of topology.edges) {
    if (!inBlock(edge, fromBlockId)) {
      continue;
    }
    for (const forward of [true, false]) {
      const arriving: Directed = {edge, forward};
      if (!exitNodes.includes(toNode(arriving))) {
        continue;
      }
      for (const next of successors(topology, arriving)) {
        if (
          !inBlock(next.edge, fromBlockId) &&
          !starts.some(
            (s) => s.edge.id === next.edge.id && s.forward === next.forward,
          )
        ) {
          starts.push(next);
        }
      }
    }
  }
  const result = cheapestPaths(topology, index, starts, (d) =>
    inBlock(d.edge, toBlockId),
  );
  for (const path of result?.paths ?? []) {
    const turnouts = turnoutPositionsOf(path, index);
    if (turnouts) {
      return describePath(
        project,
        topology,
        index,
        path,
        turnouts,
        {from: fromBlockId, to: toBlockId, via: []},
        result!.cost,
      );
    }
  }
  return undefined;
};
