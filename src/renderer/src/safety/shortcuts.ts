// Keyboard shortcuts for STOP and track power off (CARRY-2). They work in
// every view, but not while typing in a text field. Esc always means STOP:
// dialogs never close with it.

export type SafetyShortcuts = {
  stop: string;
  trackPowerOff: string | null;
  // Track power on, which also resumes after STOP.
  resume?: string | null;
  // The rest are not safety actions, but follow the same rules (no
  // modifiers, not while typing).
  undoRoute?: string | null;
  newRoute?: string | null;
  fitView?: string | null;
};

export type ShortcutAction =
  'stop' | 'trackPowerOff' | 'resume' | 'undoRoute' | 'newRoute' | 'fitView';

// Checked in this order, so STOP always wins a shared key.
const ACTIONS: ShortcutAction[] = [
  'stop',
  'trackPowerOff',
  'resume',
  'undoRoute',
  'newRoute',
  'fitView',
];

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
]);

// True if the keyboard focus is somewhere the user types text.
export const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!target || typeof target !== 'object' || !('tagName' in target)) {
    return false;
  }
  const element = target as HTMLElement;
  if (element.isContentEditable) {
    return true;
  }
  switch (element.tagName) {
    case 'TEXTAREA':
      return true;
    case 'INPUT':
      return TEXT_INPUT_TYPES.has((element as HTMLInputElement).type);
    default:
      return false;
  }
};

// The safety action for a key press, if any. Modifier combinations never
// match, so e.g. Ctrl+Esc stays free for the system.
export const shortcutAction = (
  event: Pick<
    KeyboardEvent,
    'key' | 'target' | 'ctrlKey' | 'altKey' | 'metaKey' | 'repeat'
  >,
  shortcuts: SafetyShortcuts,
): ShortcutAction | undefined => {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return undefined;
  }
  if (isTypingTarget(event.target)) {
    return undefined;
  }
  for (const action of ACTIONS) {
    const configured = shortcuts[action];
    if (configured && keyMatches(event.key, configured)) {
      // A held key repeats STOP; harmless, and it never turns into anything
      // else. Other actions run once per press.
      return action === 'stop' || !event.repeat ? action : undefined;
    }
  }
  return undefined;
};

// Number keys 1–9 switch to the first nine tabs (views, then stations), left
// to right: the tab's index, or undefined. Not while typing or in a list.
export const tabNumberKey = (
  event: Pick<
    KeyboardEvent,
    'key' | 'target' | 'ctrlKey' | 'altKey' | 'metaKey' | 'repeat'
  >,
): number | undefined => {
  if (
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.repeat ||
    isTypingTarget(event.target) ||
    (event.target as {tagName?: string} | null)?.tagName === 'SELECT' ||
    !/^[1-9]$/.test(event.key)
  ) {
    return undefined;
  }
  return Number(event.key) - 1;
};

// A pressed key against a configured one; letters match in either case,
// so Shift or Caps Lock does not matter.
export const keyMatches = (pressed: string, configured: string): boolean =>
  pressed === configured ||
  (pressed.length === 1 &&
    configured.length === 1 &&
    pressed.toLowerCase() === configured.toLowerCase());

// Keys that only modify others; never a quick key on their own.
export const isModifierKey = (key: string): boolean =>
  ['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS'].includes(
    key,
  );

// How a key is shown (on the STOP button and in Settings).
export const keyLabel = (key: string): string =>
  key === 'Escape'
    ? 'Esc'
    : key === ' '
      ? 'Space'
      : key.length === 1
        ? key.toUpperCase()
        : key;
