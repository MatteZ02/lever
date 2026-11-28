// Blocks as a graph, for following trains and protecting them (Levels 3 and
// 4): from each end of a block, which block comes next, through which turnout
// passages, and past which signals facing that way. Built from the project
// topology, following the same rules as routes (no reversing inside a
// turnout, straight on at a crossing without an element). Pure.
import {Project} from './project';
import {
  arrivingDirection,
  Directed,
  fromNode,
  leavingDirection,
  successors,
  toNode,
} from './routing';
import {NodeId, Topology, TopologyEdge} from './topology';

export type TurnoutPassage = {turnoutId: string; positions: string[]};

// Leaving block `from` at `exitNode`: the next block (entered at
// `entryNode`), or null when the track ends first (buffer stop, open end).
export type BlockExit = {
  from: string;
  exitNode: NodeId;
  to: string | null;
  entryNode?: NodeId;
  turnouts: TurnoutPassage[];
  // Signals facing the direction of travel, from the exit up to and
  // including the entry of the next block.
  signals: string[];
};

export type BlockGraph = {
  exits: Map<string, BlockExit[]>;
  // The nodes where a block meets other track or ends.
  ends: Map<string, NodeId[]>;
};

const blockOf = (edge: TopologyEdge): string | undefined =>
  edge.kind === 'track' ? edge.blockId : undefined;

const stateKey = (d: Directed) => `${d.edge.id}|${d.forward ? 1 : 0}`;

// The longest path searched from a block end to the next block (edges);
// layouts have a few turnouts between blocks, not hundreds.
const MAX_STEPS = 200;

export const buildBlockGraph = (
  project: Project,
  topology: Topology,
): BlockGraph => {
  const signalFacing = new Map<string, string>();
  for (const view of project.views) {
    for (const element of view.elements) {
      if (element.kind === 'signal') {
        signalFacing.set(element.id, element.facing);
      }
    }
  }
  const signalsAt = (node: NodeId, direction: string | undefined) =>
    (topology.nodes.get(node)?.elementIds ?? []).filter((id) => {
      const facing = signalFacing.get(id);
      return (
        facing !== undefined &&
        (direction === undefined || facing === direction)
      );
    });

  const edgesOf = new Map<string, TopologyEdge[]>();
  for (const edge of topology.edges) {
    const block = blockOf(edge);
    if (block) {
      edgesOf.set(block, [...(edgesOf.get(block) ?? []), edge]);
    }
  }

  const exits = new Map<string, BlockExit[]>();
  const ends = new Map<string, NodeId[]>();
  for (const [block, edges] of edgesOf) {
    const blockEnds: NodeId[] = [];
    const blockExits: BlockExit[] = [];
    // Each block edge, travelled towards each of its nodes: where it leaves
    // the block (or the track ends), follow on to the next block.
    for (const edge of edges) {
      for (const forward of [true, false]) {
        const arriving: Directed = {edge, forward};
        const node = toNode(arriving);
        const next = successors(topology, arriving);
        const outside = next.filter((d) => blockOf(d.edge) !== block);
        if (next.length > 0 && outside.length === 0) {
          continue; // the block goes on here
        }
        if (!blockEnds.includes(node)) {
          blockEnds.push(node);
        }
        if (next.length === 0) {
          blockExits.push({
            from: block,
            exitNode: node,
            to: null,
            turnouts: [],
            signals: signalsAt(node, arrivingDirection(arriving)),
          });
          continue;
        }
        for (const start of outside) {
          walk(start, block, node, [], [], new Set(), 0, blockExits);
        }
      }
    }
    ends.set(block, blockEnds);
    exits.set(block, dedupe(blockExits));
  }
  return {exits, ends};

  function walk(
    d: Directed,
    block: string,
    exitNode: NodeId,
    turnouts: TurnoutPassage[],
    signals: string[],
    seen: Set<string>,
    depth: number,
    out: BlockExit[],
  ): void {
    if (seen.has(stateKey(d)) || depth > MAX_STEPS) {
      return;
    }
    const here = signalsAt(fromNode(d), leavingDirection(d));
    const passedSignals = [
      ...signals,
      ...here.filter((s) => !signals.includes(s)),
    ];
    const target = blockOf(d.edge);
    if (target) {
      out.push({
        from: block,
        exitNode,
        to: target,
        entryNode: fromNode(d),
        turnouts,
        signals: passedSignals,
      });
      return;
    }
    const passages =
      d.edge.kind === 'turnout' && d.edge.positions.length > 0
        ? [
            ...turnouts,
            {turnoutId: d.edge.turnoutId, positions: d.edge.positions},
          ]
        : turnouts;
    const next = successors(topology, d);
    if (next.length === 0) {
      out.push({
        from: block,
        exitNode,
        to: null,
        turnouts: passages,
        signals: passedSignals,
      });
      return;
    }
    const nextSeen = new Set(seen).add(stateKey(d));
    for (const n of next) {
      walk(
        n,
        block,
        exitNode,
        passages,
        passedSignals,
        nextSeen,
        depth + 1,
        out,
      );
    }
  }
};

// The same exit reached twice (e.g. from both block edges at a node).
const dedupe = (exits: BlockExit[]): BlockExit[] => {
  const seen = new Set<string>();
  return exits.filter((exit) => {
    const key = `${exit.exitNode}>${exit.to}@${exit.entryNode}|${exit.turnouts
      .map((t) => `${t.turnoutId}=${t.positions.join('/')}`)
      .join(',')}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export type PassageState = 'open' | 'closed' | 'unknown';

// Whether the turnouts let a train through an exit: closed if one is known
// to lie another way, unknown if one's position is not known.
export const passageState = (
  exit: BlockExit,
  position: (turnoutId: string) => string | undefined,
): PassageState => {
  let unknown = false;
  for (const passage of exit.turnouts) {
    const at = position(passage.turnoutId);
    if (at === undefined) {
      unknown = true;
    } else if (!passage.positions.includes(at)) {
      return 'closed';
    }
  }
  return unknown ? 'unknown' : 'open';
};

// The ways out of a block for a train that entered at `entryNode` (all
// ends but that one; every end when it is not known).
export const exitsAhead = (
  graph: BlockGraph,
  block: string,
  entryNode: NodeId | undefined,
): BlockExit[] =>
  (graph.exits.get(block) ?? []).filter(
    (exit) => entryNode === undefined || exit.exitNode !== entryNode,
  );

// What lies ahead of a train in `block` (entered at `entryNode`), with the
// turnouts as they are: the open exit, if exactly one. `blocked`: no way on
// (the track ends, or every turnout ahead lies another way); `unknown`: a
// turnout's position is not known, or the train's direction is not.
export type NextBlock =
  | {kind: 'block'; exit: BlockExit}
  | {kind: 'end'; exit: BlockExit}
  | {kind: 'blocked'}
  | {kind: 'unknown'};

export const nextBlock = (
  graph: BlockGraph,
  block: string,
  entryNode: NodeId | undefined,
  position: (turnoutId: string) => string | undefined,
): NextBlock => {
  if (entryNode === undefined) {
    return {kind: 'unknown'};
  }
  const ahead = exitsAhead(graph, block, entryNode);
  const states = ahead.map((exit) => ({
    exit,
    state: passageState(exit, position),
  }));
  const open = states.filter((s) => s.state === 'open');
  if (open.length === 1) {
    const {exit} = open[0];
    return exit.to === null ? {kind: 'end', exit} : {kind: 'block', exit};
  }
  if (open.length === 0 && states.every((s) => s.state === 'closed')) {
    return {kind: 'blocked'};
  }
  return {kind: 'unknown'};
};

// The exit from `from` that leads into `to` with the turnouts as they are
// (or any exit into it, when none is known open): how a train moved.
export const exitBetween = (
  graph: BlockGraph,
  from: string,
  to: string,
  position: (turnoutId: string) => string | undefined,
): BlockExit | undefined => {
  const candidates = (graph.exits.get(from) ?? []).filter(
    (exit) => exit.to === to,
  );
  return (
    candidates.find((exit) => passageState(exit, position) === 'open') ??
    candidates.find((exit) => passageState(exit, position) === 'unknown') ??
    candidates[0]
  );
};
