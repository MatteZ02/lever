// Automation levels as stacked modules (ARC-L1). Every command is checked
// against the modules up to the level of the area its element belongs to
// (9.1); a refusal carries a reason for the operator.
//
// Level 1 (manual) and Level 2 (manual routing) are built. Level 3 (train
// protection) and Level 4 (automatic routing and driving) will be added as
// further modules implementing LevelModule; nothing in Levels 1–2 needs to
// change for that:
//
// - Level3Module.check: refuse throwing a turnout locked in a set route,
//   refuse routes over occupied blocks or conflicting routes, with "override
//   allowed" reasons the operator can confirm.
// - Level3Module.onEvent: automatic train stop when a train would enter an
//   occupied block (per block aspect setting), re-assert stops.
// - Level4Module: schedules and automatic driving, only inside Level 4 areas
//   and up to their boundaries (MIX-7).
//
// Area ownership between instances (MULTI-7) will be one more check here:
// an area owned by another instance refuses local commands.
import {AutomationLevel} from '../model/project';

export type ElementCommand =
  | {type: 'setTurnout'; elementId: string; position: string}
  | {type: 'setSignal'; elementId: string; aspectId: string}
  | {type: 'pressAccessory'; elementId: string; on: boolean};

// Who asks: the operator directly, or a route of this instance (setting,
// releasing, breaking or undoing it).
export type CommandOrigin = 'operator' | 'route';

export type LevelContext = {
  level: AutomationLevel;
  origin: CommandOrigin;
};

export type Decision = {ok: true} | {ok: false; reason: RefusalReason};

export type RefusalReason = 'levelNotAvailable' | 'signalNeedsRoute';

export interface LevelModule {
  readonly level: AutomationLevel;
  check(command: ElementCommand, context: LevelContext): Decision;
}

// Level 1: no automation, no protection (section 9). Everything is allowed.
export const level1Module: LevelModule = {
  level: 1,
  check: () => ({ok: true}),
};

// Level 2: manual routing without protection (8.8). Signals are set by
// routes only, never by hand; turnouts stay freely
// switchable (a turnout change breaks a set route, RTE-6c, it is not
// refused).
export const level2Module: LevelModule = {
  level: 2,
  check: (command, context) =>
    command.type === 'setSignal' && context.origin === 'operator'
      ? {ok: false, reason: 'signalNeedsRoute'}
      : {ok: true},
};

export const BUILT_LEVELS: LevelModule[] = [level1Module, level2Module];

// Checks a command against every module up to `level`. Levels above the
// built ones are refused rather than silently treated as lower.
export const checkCommand = (
  command: ElementCommand,
  level: AutomationLevel,
  origin: CommandOrigin = 'operator',
  modules: LevelModule[] = BUILT_LEVELS,
): Decision => {
  const highest = Math.max(...modules.map((module) => module.level));
  if (level > highest) {
    return {ok: false, reason: 'levelNotAvailable'};
  }
  for (const module of modules.filter((m) => m.level <= level)) {
    const decision = module.check(command, {level, origin});
    if (!decision.ok) {
      return decision;
    }
  }
  return {ok: true};
};
