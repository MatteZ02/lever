// Keyboard shortcuts for STOP and track power off (CARRY-2). They work in
// every view, but not while typing in a text field. Esc always means STOP:
// dialogs never close with it (decided by the user, 2026-11-17).

export type SafetyShortcuts = {
  stop: string;
  trackPowerOff: string | null;
};

export type ShortcutAction = 'stop' | 'trackPowerOff';

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
  if (event.key === shortcuts.stop) {
    // A held key repeats STOP; harmless, and it never turns into anything
    // else.
    return 'stop';
  }
  if (
    shortcuts.trackPowerOff !== null &&
    event.key === shortcuts.trackPowerOff &&
    !event.repeat
  ) {
    return 'trackPowerOff';
  }
  return undefined;
};
