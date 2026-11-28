// Level 3, train protection (section 9): pure decisions, used by the
// interlocking.
//
// Automatic train stop. A train in, or about to enter, a Level 3+ area is
// held (Lever brakes its loco to 0 at its braking rate, never an emergency
// stop) while what lies ahead of its front block is not clear:
// - the signal at the end of its block shows stop;
// - fewer than `clearAhead` blocks ahead are free (block aspect signalling:
//   per block, else the project default; 0 lets it run into an occupied
//   block, and it is stopped there once it has, see trains.ts);
// - the track ends, or a turnout ahead lies another way or is not known.
// Blocks in areas below Level 3 are not checked (MIX-5: protection applies
// to trains in or entering a protected area, not after they leave it).
// Only a train whose direction is known can be protected, and only while
// its loco is set to run ahead: a driver reversing out is not held.
//
// Route checks before setting (and the override the operator may confirm)
// are in model/routeChecks.ts (the route preview uses them too).
import {BlockGraph, NextBlock, nextBlock} from '../model/blockGraph';
import {AutomationLevel} from '../model/project';
import {Train} from './trains';

export type HoldReason =
  | 'signalAtStop'
  | 'occupiedAhead'
  | 'enteredOccupied'
  | 'endOfTrack'
  | 'turnoutAgainst'
  | 'turnoutUnknown';

export type ProtectionContext = {
  graph: BlockGraph;
  position: (turnoutId: string) => string | undefined;
  // Occupied by anything (a train, or unlabelled occupancy).
  occupied: (blockId: string) => boolean;
  levelOfBlock: (blockId: string) => AutomationLevel;
  clearAhead: (blockId: string) => number;
  // A signal showing its stop aspect (known; signals without a reported
  // aspect do not stop trains).
  signalAtStop: (signalId: string) => boolean;
  // The DCC direction the train's loco is set to, if known.
  locoForward: (locoId: string) => boolean | undefined;
};

// Why the train must be held now, or undefined when it may run.
export const holdReason = (
  train: Train,
  context: ProtectionContext,
): HoldReason | undefined => {
  const front = train.blocks[0];
  if (!front || front.entryNode === undefined || !train.locoId) {
    return undefined;
  }
  const forward = context.locoForward(train.locoId);
  if (
    forward !== undefined &&
    train.aheadIsForward !== undefined &&
    forward !== train.aheadIsForward
  ) {
    return undefined; // set to run backwards: not held
  }
  const first = nextBlock(
    context.graph,
    front.blockId,
    front.entryNode,
    context.position,
  );
  const protectedHere = context.levelOfBlock(front.blockId) >= 3;
  const protectedAhead =
    first.kind === 'block' &&
    first.exit.to !== null &&
    context.levelOfBlock(first.exit.to) >= 3;
  if (!protectedHere && !protectedAhead) {
    return undefined;
  }
  if (train.enteredOccupied && protectedHere) {
    return 'enteredOccupied';
  }
  if (first.kind === 'unknown') {
    return 'turnoutUnknown';
  }
  if (first.kind === 'blocked') {
    return 'turnoutAgainst';
  }
  if (first.exit.signals.some(context.signalAtStop)) {
    return 'signalAtStop';
  }
  const needed = context.clearAhead(front.blockId);
  if (needed === 0) {
    return undefined;
  }
  if (first.kind === 'end') {
    return 'endOfTrack';
  }
  // `needed` blocks ahead must be free, as far as they lie in protected
  // areas.
  let step: NextBlock = first;
  for (let n = 1; n <= needed; n++) {
    if (step.kind === 'end') {
      return n === 1 ? 'endOfTrack' : undefined;
    }
    if (step.kind !== 'block' || step.exit.to === null) {
      return step.kind === 'blocked' ? 'turnoutAgainst' : 'turnoutUnknown';
    }
    const block = step.exit.to;
    if (context.levelOfBlock(block) < 3) {
      return undefined;
    }
    if (context.occupied(block)) {
      return 'occupiedAhead';
    }
    if (n === needed) {
      break;
    }
    step = nextBlock(
      context.graph,
      block,
      step.exit.entryNode,
      context.position,
    );
  }
  return undefined;
};
