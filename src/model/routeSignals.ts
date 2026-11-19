// Signal aspects for a route (RTE-5). PURE; every rule is here, so it is
// easy to adjust:
//
// - The start signal and every signal passed that faces the direction of
//   travel shows proceed: main signals the reduced-speed aspect if they
//   have one and the route takes a diverging turnout before the next signal
//   facing that way; shunting signals their "shunting allowed" aspect.
// - Signals facing the other way show stop (stop aspect).
// - The signal at the end, facing the route, shows stop: the train stops
//   in front of it.
// - Distant signals repeat the main signal they belong to (distantFor):
//   "expect proceed" when it shows proceed or reduced speed, else "expect
//   stop". Distant signals passed by the route are only set this way.
//
// Releasing a route returns every signal it set to its stop aspect.
import {Signal} from './elements';
import {Project} from './project';
import {RoutePlan} from './routing';
import {findSignalType, SignalType} from './signalTypes';

export type SignalSetting = {signalId: string; aspectId: string};

const signalIndex = (project: Project) => {
  const index = new Map<string, {signal: Signal; type?: SignalType}>();
  for (const view of project.views) {
    for (const element of view.elements) {
      if (element.kind === 'signal') {
        index.set(element.id, {
          signal: element,
          type: findSignalType(project.signalTypes, element.signalTypeId),
        });
      }
    }
  }
  return index;
};

export const routeSignalAspects = (
  project: Project,
  plan: RoutePlan,
): SignalSetting[] => {
  const index = signalIndex(project);
  const aspects = new Map<string, string>();
  const set = (signalId: string, aspectId: string | undefined) => {
    if (aspectId && !aspects.has(signalId)) {
      aspects.set(signalId, aspectId);
    }
  };

  for (const passed of plan.passedSignals) {
    const entry = index.get(passed.signalId);
    if (!entry?.type || entry.type.category === 'distant') {
      continue;
    }
    const {type} = entry;
    if (!passed.facing) {
      set(passed.signalId, type.stopAspectId);
    } else if (type.category === 'main' && passed.divergingAhead) {
      set(passed.signalId, type.reducedAspectId ?? type.proceedAspectId);
    } else {
      set(passed.signalId, type.proceedAspectId);
    }
  }
  if (plan.endSignalId) {
    const end = index.get(plan.endSignalId);
    if (end?.type && end.type.category !== 'distant') {
      set(plan.endSignalId, end.type.stopAspectId);
    }
  }

  // Distant signals of the main signals set here.
  for (const {signal, type} of index.values()) {
    if (type?.category !== 'distant' || !signal.distantFor) {
      continue;
    }
    const main = index.get(signal.distantFor);
    const mainAspect = aspects.get(signal.distantFor);
    if (!main?.type || mainAspect === undefined) {
      continue;
    }
    set(
      signal.id,
      mainAspect === main.type.stopAspectId
        ? type.stopAspectId
        : type.proceedAspectId,
    );
  }
  return [...aspects].map(([signalId, aspectId]) => ({signalId, aspectId}));
};

// What releasing (or a broken route) sets: every signal the route set to
// something other than stop goes back to stop.
export const routeSignalsToStop = (
  project: Project,
  settings: SignalSetting[],
): SignalSetting[] => {
  const index = signalIndex(project);
  return settings.flatMap(({signalId, aspectId}) => {
    const type = index.get(signalId)?.type;
    return type && aspectId !== type.stopAspectId
      ? [{signalId, aspectId: type.stopAspectId}]
      : [];
  });
};
