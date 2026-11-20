// Derives the track graph (topology) from a station view's diagram. Pure and
// deterministic; rebuilt after every edit. Routing (Phase 5) and validation
// use only this graph and element ids, never drawing positions.
//
// Nodes are grid points where something happens: track ends, turnout ports,
// signals, virtual points, connectors, buffer stops. Track edges run between
// nodes along the drawn track; a turnout contributes one internal edge per
// passage (tip↔leg), labelled with the positions that open it.
//
// A node where the legs meet in straight, opposite pairs and nothing else
// (e.g. the middle of a scissors crossover drawn with four turnouts whose
// diverging legs meet) is a crossing without an element: trains only go
// straight across it (crossingNode).
import {allConnectors, partnerOf} from './connectors';
import {DiagramElement, StationConnector, Track, Turnout} from './elements';
import {
  Direction,
  directionBetween,
  expandPolyline,
  geometricLength,
  GridPoint,
  opposite,
  pointKey,
} from './geometry';
import {turnoutGeometry, turnoutPorts} from './ports';
import {Project, StationView} from './project';

export type NodeId = string;

export type TopologyNode = {
  id: NodeId;
  viewId: string;
  at: GridPoint;
  // Ids of signals, virtual points, connectors and buffer stops on this point.
  elementIds: string[];
};

export type TrackEdge = {
  kind: 'track';
  id: string;
  viewId: string;
  from: NodeId;
  to: NodeId;
  trackId: string;
  blockId?: string;
  areaId?: string;
  // Every grid point from `from` to `to`.
  points: GridPoint[];
  // Direction of travel when leaving `from` into the edge, and when leaving
  // `to` into the edge (i.e. travelling backwards).
  fromDirection: Direction;
  toDirection: Direction;
  length: number;
};

export type TurnoutEdge = {
  kind: 'turnout';
  id: string;
  viewId: string;
  from: NodeId;
  to: NodeId;
  turnoutId: string;
  fromPort: string;
  toPort: string;
  // Positions that open this passage; empty = always open (crossing).
  positions: string[];
  diverging: boolean;
  // Direction of travel when entering the turnout at `from` / at `to`.
  fromDirection: Direction;
  toDirection: Direction;
  length: number;
};

// Joins two paired station connectors (FULL-3): the line between them is
// not drawn, but routes run through it. Only in the project topology.
export type LinkEdge = {
  kind: 'link';
  id: string;
  viewId: string;
  from: NodeId;
  to: NodeId;
  connectorIds: [string, string];
  length: number;
};

export type TopologyEdge = TrackEdge | TurnoutEdge | LinkEdge;

export type Topology = {
  nodes: Map<NodeId, TopologyNode>;
  edges: TopologyEdge[];
  // Edge ids by node, in both directions.
  edgesAt: Map<NodeId, string[]>;
  edgeById: Map<string, TopologyEdge>;
};

export const nodeId = (viewId: string, point: GridPoint): NodeId =>
  `${viewId}:${pointKey(point)}`;

const POINT_ELEMENTS = new Set([
  'signal',
  'virtualPoint',
  'connector',
  'bufferStop',
]);

// Grid points at which track is split into separate edges.
const anchorPoints = (elements: DiagramElement[]): Set<string> => {
  const anchors = new Set<string>();
  for (const element of elements) {
    if (element.kind === 'track') {
      anchors.add(pointKey(element.points[0]));
      anchors.add(pointKey(element.points[element.points.length - 1]));
    } else if (element.kind === 'turnout') {
      turnoutPorts(element).forEach((port) => anchors.add(pointKey(port.at)));
    } else if (POINT_ELEMENTS.has(element.kind) && 'at' in element) {
      anchors.add(pointKey(element.at));
    }
  }
  return anchors;
};

export const buildViewTopology = (view: StationView): Topology => {
  const nodes = new Map<NodeId, TopologyNode>();
  const edges: TopologyEdge[] = [];
  const anchors = anchorPoints(view.elements);

  const nodeAt = (point: GridPoint): TopologyNode => {
    const id = nodeId(view.id, point);
    let node = nodes.get(id);
    if (!node) {
      node = {id, viewId: view.id, at: point, elementIds: []};
      nodes.set(id, node);
    }
    return node;
  };

  for (const element of view.elements) {
    switch (element.kind) {
      case 'track':
        edges.push(...trackEdges(view, element, anchors, nodeAt));
        break;
      case 'turnout':
        edges.push(...turnoutEdges(view, element, nodeAt));
        break;
      case 'signal':
      case 'virtualPoint':
      case 'connector':
      case 'bufferStop':
        nodeAt(element.at).elementIds.push(element.id);
        break;
      default:
        break;
    }
  }

  return indexTopology(nodes, edges);
};

const indexTopology = (
  nodes: Map<NodeId, TopologyNode>,
  edges: TopologyEdge[],
): Topology => {
  const edgesAt = new Map<NodeId, string[]>();
  const edgeById = new Map<string, TopologyEdge>();
  for (const edge of edges) {
    edgeById.set(edge.id, edge);
    for (const end of [edge.from, edge.to]) {
      const list = edgesAt.get(end) ?? [];
      list.push(edge.id);
      edgesAt.set(end, list);
    }
  }
  return {nodes, edges, edgesAt, edgeById};
};

// The whole layout as one graph (FULL-3): every view's topology, joined
// through paired station connectors. Node ids include the view, so views
// never share nodes by accident. A pairing that is not mutual is ignored
// (validation reports it).
export const buildProjectTopology = (project: Project): Topology => {
  const nodes = new Map<NodeId, TopologyNode>();
  const edges: TopologyEdge[] = [];
  for (const view of project.views) {
    const topology = buildViewTopology(view);
    topology.nodes.forEach((node, id) => nodes.set(id, node));
    edges.push(...topology.edges);
  }
  const linked = new Set<string>();
  for (const {viewId, connector} of allConnectors(project)) {
    const partner = partnerOf(project, connector);
    if (!partner || linked.has(connector.id)) {
      continue;
    }
    linked.add(connector.id);
    linked.add(partner.connector.id);
    edges.push({
      kind: 'link',
      id: `link:${connector.id}:${partner.connector.id}`,
      viewId,
      from: nodeId(viewId, connector.at),
      to: nodeId(partner.viewId, partner.connector.at),
      connectorIds: [connector.id, partner.connector.id],
      // Unknown length; counts like one track step.
      length: 1,
    });
  }
  return indexTopology(nodes, edges);
};

const trackEdges = (
  view: StationView,
  track: Track,
  anchors: Set<string>,
  nodeAt: (point: GridPoint) => TopologyNode,
): TrackEdge[] => {
  const points = expandPolyline(track.points);
  const result: TrackEdge[] = [];
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    if (i === points.length - 1 || anchors.has(pointKey(points[i]))) {
      const part = points.slice(start, i + 1);
      const from = nodeAt(part[0]);
      const to = nodeAt(part[part.length - 1]);
      let length = 0;
      for (let n = 1; n < part.length; n++) {
        length += geometricLength(part[n - 1], part[n]);
      }
      result.push({
        kind: 'track',
        id: `${track.id}#${result.length}`,
        viewId: view.id,
        from: from.id,
        to: to.id,
        trackId: track.id,
        blockId: track.blockId,
        areaId: track.areaId,
        points: part,
        fromDirection: directionBetween(part[0], part[1])!,
        toDirection: directionBetween(
          part[part.length - 1],
          part[part.length - 2],
        )!,
        length,
      });
      start = i;
    }
  }
  return result;
};

const turnoutEdges = (
  view: StationView,
  turnout: Turnout,
  nodeAt: (point: GridPoint) => TopologyNode,
): TurnoutEdge[] => {
  const geometry = turnoutGeometry(turnout.type, turnout.orientation);
  const ports = new Map(turnoutPorts(turnout).map((port) => [port.name, port]));
  // Every port is a node, connected or not (an open leg is a problem the
  // validation reports).
  ports.forEach((port) => nodeAt(port.at));
  return geometry.transitions.map((transition, index) => {
    const from = ports.get(transition.from)!;
    const to = ports.get(transition.to)!;
    return {
      kind: 'turnout',
      id: `${turnout.id}#${index}`,
      viewId: view.id,
      from: nodeAt(from.at).id,
      to: nodeAt(to.at).id,
      turnoutId: turnout.id,
      fromPort: transition.from,
      toPort: transition.to,
      positions: transition.positions,
      diverging: transition.diverging,
      fromDirection: opposite(from.direction),
      toDirection: opposite(to.direction),
      length:
        geometricLength(from.at, turnout.at) +
        geometricLength(turnout.at, to.at),
    };
  });
};

// --- queries -------------------------------------------------------------

// The diagram element an edge belongs to.
export const edgeElementId = (edge: TopologyEdge): string =>
  edge.kind === 'track'
    ? edge.trackId
    : edge.kind === 'turnout'
      ? edge.turnoutId
      : edge.connectorIds[0];

export const edgesAtNode = (topology: Topology, node: NodeId): TopologyEdge[] =>
  (topology.edgesAt.get(node) ?? []).map((id) => topology.edgeById.get(id)!);

// Directions in which track leaves a node (track edges only).
export const trackDirectionsAt = (
  topology: Topology,
  node: NodeId,
): Direction[] =>
  edgesAtNode(topology, node).flatMap((edge) => {
    if (edge.kind !== 'track') {
      return [];
    }
    const directions: Direction[] = [];
    if (edge.from === node) {
      directions.push(edge.fromDirection);
    }
    if (edge.to === node) {
      directions.push(edge.toDirection);
    }
    return directions;
  });

// Direction of travel when leaving `node` into `edge` (undefined for links,
// which have no direction).
export const leavingDirectionAt = (
  edge: TopologyEdge,
  node: NodeId,
): Direction | undefined =>
  edge.kind === 'link'
    ? undefined
    : edge.from === node
      ? edge.fromDirection
      : edge.to === node
        ? edge.toDirection
        : undefined;

// The legs at a node: one per track end, one per turnout (its passages all
// leave the node the same way), with the direction into each.
const legsAt = (
  topology: Topology,
  node: NodeId,
): (Direction | undefined)[] => {
  const legs: (Direction | undefined)[] = [];
  const turnouts = new Set<string>();
  for (const edge of edgesAtNode(topology, node)) {
    if (edge.kind === 'turnout') {
      if (!turnouts.has(edge.turnoutId)) {
        turnouts.add(edge.turnoutId);
        legs.push(leavingDirectionAt(edge, node));
      }
    } else if (edge.kind === 'track') {
      if (edge.from === node) legs.push(edge.fromDirection);
      if (edge.to === node) legs.push(edge.toDirection);
    } else {
      legs.push(undefined);
    }
  }
  return legs;
};

const crossingCache = new WeakMap<Topology, Map<NodeId, boolean>>();

// A crossing without an element: more than two legs, each leaving in its own
// direction, every one with a leg straight opposite.
export const crossingNode = (topology: Topology, node: NodeId): boolean => {
  let cache = crossingCache.get(topology);
  if (!cache) {
    cache = new Map();
    crossingCache.set(topology, cache);
  }
  const known = cache.get(node);
  if (known !== undefined) {
    return known;
  }
  const legs = legsAt(topology, node);
  const directions = new Set(legs);
  const result =
    legs.length > 2 &&
    directions.size === legs.length &&
    legs.every((d) => d !== undefined && directions.has(opposite(d)));
  cache.set(node, result);
  return result;
};

// Number of distinct connections at a node, counting a turnout once (its
// internal edges all meet the outside world at the same port).
export const connectionCount = (topology: Topology, node: NodeId): number => {
  const edges = edgesAtNode(topology, node);
  const trackEnds = edges.reduce(
    (count, edge) =>
      edge.kind === 'track'
        ? count + (edge.from === node ? 1 : 0) + (edge.to === node ? 1 : 0)
        : count,
    0,
  );
  const turnouts = new Set(
    edges.flatMap((edge) => (edge.kind === 'turnout' ? [edge.turnoutId] : [])),
  );
  return trackEnds + turnouts.size;
};

export const connectorsOf = (view: StationView): StationConnector[] =>
  view.elements.filter(
    (element): element is StationConnector => element.kind === 'connector',
  );
