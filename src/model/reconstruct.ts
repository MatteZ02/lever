// Working out a turnout's position or a signal's aspect from the accessory
// outputs the central unit reports (MULTI-2, ARC-2). Works for changes made
// by any client. Never guesses: if the outputs fit no state, or fit several,
// the result says so.
import {ResolvedOutput} from './accessoryCommands';

// What is known about one function address: the output last reported, or
// nothing yet.
export type OutputReport = 0 | 1 | 'unknown';

export type Reconstruction =
  | {kind: 'state'; state: string}
  // Some of the element's addresses have not been reported yet.
  | {kind: 'unknown'}
  // The reported outputs match no state, or more than one.
  | {kind: 'inconsistent'};

export const reconstructState = (
  states: Map<string, ResolvedOutput[]>,
  report: (fAdr: number) => OutputReport,
): Reconstruction => {
  if (states.size === 0) {
    return {kind: 'unknown'};
  }
  const matching: string[] = [];
  let missing = false;
  for (const [state, outputs] of states) {
    let fits = true;
    for (const {fAdr, output} of outputs) {
      const reported = report(fAdr);
      if (reported === 'unknown') {
        missing = true;
        fits = false;
        break;
      }
      if (reported !== output) {
        fits = false;
        break;
      }
    }
    if (fits) {
      matching.push(state);
    }
  }
  if (matching.length === 1) {
    return {kind: 'state', state: matching[0]};
  }
  if (matching.length > 1) {
    // Several states fit (e.g. a three-way turnout's "left" ignores motor B):
    // prefer the one that uses the most reported outputs, if unique.
    const sizes = matching.map((state) => states.get(state)!.length);
    const best = Math.max(...sizes);
    const winners = matching.filter((_, index) => sizes[index] === best);
    return winners.length === 1
      ? {kind: 'state', state: winners[0]}
      : {kind: 'inconsistent'};
  }
  return missing ? {kind: 'unknown'} : {kind: 'inconsistent'};
};
