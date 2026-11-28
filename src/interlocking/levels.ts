// Automation levels as stacked modules (ARC-L1). Every command is checked
// against the modules up to the level of the area its element belongs to
// (9.1); a refusal carries a reason for the operator.
//
// - Level 1 (manual): everything allowed.
// - Level 2 (manual routing): signals are set by routes only.
// - Level 3 (train protection): a turnout locked in a route cannot be thrown
//   by hand. Route checks, automatic train stop and the override are in
//   protection.ts.
// - Level 4 (automatic routing and driving): as Level 3 for commands; the
//   driving itself is automatic.ts.
//
// Area ownership between instances (MULTI-7) would be one more check here:
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
  // The element is a turnout of a route set (or being set) here, in a
  // Level 3+ area.
  locked: boolean;
};

export type Decision = {ok: true} | {ok: false; reason: RefusalReason};

export type RefusalReason =
  'levelNotAvailable' | 'signalNeedsRoute' | 'turnoutLocked';

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

// Level 3: turnouts locked in a route stay as they are until the route is
// released (routes themselves may move them).
export const level3Module: LevelModule = {
  level: 3,
  check: (command, context) =>
    command.type === 'setTurnout' &&
    context.origin === 'operator' &&
    context.locked
      ? {ok: false, reason: 'turnoutLocked'}
      : {ok: true},
};

// Level 4 adds automatic driving, no command rules of its own.
export const level4Module: LevelModule = {
  level: 4,
  check: () => ({ok: true}),
};

export const BUILT_LEVELS: LevelModule[] = [
  level1Module,
  level2Module,
  level3Module,
  level4Module,
];

// Checks a command against every module up to `level`. Levels above the
// built ones are refused rather than silently treated as lower.
export const checkCommand = (
  command: ElementCommand,
  level: AutomationLevel,
  origin: CommandOrigin = 'operator',
  modules: LevelModule[] = BUILT_LEVELS,
  locked = false,
): Decision => {
  const highest = Math.max(...modules.map((module) => module.level));
  if (level > highest) {
    return {ok: false, reason: 'levelNotAvailable'};
  }
  for (const module of modules.filter((m) => m.level <= level)) {
    const decision = module.check(command, {level, origin, locked});
    if (!decision.ok) {
      return decision;
    }
  }
  return {ok: true};
};
