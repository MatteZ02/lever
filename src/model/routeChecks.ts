// Level 3 route checks (section 9): what stands in the way of a route in
// its Level 3+ parts, and whether the operator may override it. Pure; used
// by the interlocking and by the route preview.
import {AutomationLevel} from './project';
import {routeConflicts, RouteSteps} from './routeConflicts';
import {Topology} from './topology';

export type RouteProblem =
  // Blocks of the route in Level 3+ areas that are occupied; the operator
  // may confirm setting it anyway (e.g. shunting onto an occupied track).
  | {kind: 'occupied'; blockIds: string[]}
  // Another route (set or being set) uses the same track in a Level 3+
  // area: refused, release that route first.
  // (Its turnouts are locked in that route.)
  | {kind: 'conflict'; routeIds: string[]};

export const overrideAllowed = (problems: readonly RouteProblem[]): boolean =>
  problems.every((problem) => problem.kind === 'occupied');

export type RouteCheckContext = {
  topology: Topology;
  // Routes of this instance (set or being set).
  routes: {id: string; steps: RouteSteps}[];
  occupied: (blockId: string) => boolean;
  levelOfBlock: (blockId: string) => AutomationLevel;
  levelOfElement: (elementId: string) => AutomationLevel;
  // Blocks of the train the route is for (Level 4): not in its way.
  ownBlocks?: ReadonlySet<string>;
};

// What stands in the way of a route in its Level 3+ parts (MIX-4: checks
// per segment, by the level of the area each part lies in). Crossing
// another route counts as a conflict there too. Empty: it may be set.
export const routeProblems = (
  plan: {steps: RouteSteps; blockIds: string[]},
  context: RouteCheckContext,
): RouteProblem[] => {
  const problems: RouteProblem[] = [];
  const occupied = plan.blockIds.filter(
    (block) =>
      context.levelOfBlock(block) >= 3 &&
      !context.ownBlocks?.has(block) &&
      context.occupied(block),
  );
  if (occupied.length > 0) {
    problems.push({kind: 'occupied', blockIds: occupied});
  }
  const conflicting = routeConflicts(
    context.topology,
    plan.steps,
    context.routes,
  )
    .filter((conflict) =>
      conflict.elementIds.some((id) => context.levelOfElement(id) >= 3),
    )
    .map((conflict) => conflict.routeId);
  if (conflicting.length > 0) {
    problems.push({kind: 'conflict', routeIds: [...new Set(conflicting)]});
  }
  return problems;
};
