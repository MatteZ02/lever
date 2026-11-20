// Conflicts between routes of this instance (Level 2). PURE.
//
// Two routes conflict when they share track, or need one turnout in
// different positions, or run through the same passage of a turnout. Setting
// a new route cancels the routes it conflicts with (user, 2026-11-20).
//
// One exception: two routes that only cross each other inside a crossing
// or slip (double slip straight/straight or curve/curve, a diamond), using
// passages with no leg in common and the same position. Both can be set,
// but trains on them would meet in the crossing, so the operator confirms
// first ("crossing").
import {edgeElementId, Topology} from './topology';

export type RouteSteps = {edgeId: string; forward: boolean}[];

export type RouteConflictKind = 'conflict' | 'crossing';

export type RouteConflict = {
  kind: RouteConflictKind;
  // Where: shared track, turnouts, crossings (element ids, no repeats).
  elementIds: string[];
};

// Between two routes; undefined when they are independent. A real conflict
// anywhere wins over a crossing.
export const routeConflict = (
  topology: Topology,
  a: RouteSteps,
  b: RouteSteps,
): RouteConflict | undefined => {
  const conflicts = new Set<string>();
  const crossings = new Set<string>();
  const bEdges = new Set(b.map((step) => step.edgeId));
  for (const {edgeId} of a) {
    const edge = topology.edgeById.get(edgeId);
    if (edge && bEdges.has(edgeId)) {
      conflicts.add(edgeElementId(edge));
    }
  }
  const passages = (steps: RouteSteps) =>
    steps.flatMap(({edgeId}) => {
      const edge = topology.edgeById.get(edgeId);
      return edge?.kind === 'turnout' ? [edge] : [];
    });
  const bPassages = passages(b);
  for (const passage of passages(a)) {
    for (const other of bPassages) {
      if (other.turnoutId !== passage.turnoutId || other.id === passage.id) {
        continue;
      }
      const samePosition =
        passage.positions.length === 0 ||
        other.positions.length === 0 ||
        passage.positions.some((p) => other.positions.includes(p));
      const sharedLeg = [passage.fromPort, passage.toPort].some(
        (port) => port === other.fromPort || port === other.toPort,
      );
      if (samePosition && !sharedLeg) {
        crossings.add(passage.turnoutId);
      } else {
        conflicts.add(passage.turnoutId);
      }
    }
  }
  if (conflicts.size > 0) {
    return {kind: 'conflict', elementIds: [...conflicts]};
  }
  if (crossings.size > 0) {
    return {kind: 'crossing', elementIds: [...crossings]};
  }
  return undefined;
};

// A new route against the routes already set, by route id.
export const routeConflicts = (
  topology: Topology,
  steps: RouteSteps,
  existing: {id: string; steps: RouteSteps}[],
): ({routeId: string} & RouteConflict)[] =>
  existing.flatMap((route) => {
    const conflict = routeConflict(topology, steps, route.steps);
    return conflict ? [{routeId: route.id, ...conflict}] : [];
  });
