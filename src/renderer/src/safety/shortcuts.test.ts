import {describe, expect, it} from 'vitest';
import {
  isModifierKey,
  isTypingTarget,
  keyLabel,
  shortcutAction,
  tabNumberKey,
} from './shortcuts';

const element = (tagName: string, extra: Record<string, unknown> = {}) =>
  ({tagName, isContentEditable: false, ...extra}) as unknown as EventTarget;

const key = (
  name: string,
  target: EventTarget | null = element('BODY'),
  modifiers: Partial<Record<'ctrlKey' | 'altKey' | 'metaKey', boolean>> = {},
) => ({
  key: name,
  target,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  repeat: false,
  ...modifiers,
});

const defaults = {stop: 'Escape', trackPowerOff: null};

describe('safety shortcuts', () => {
  it('Esc means STOP by default, anywhere outside text fields', () => {
    expect(shortcutAction(key('Escape'), defaults)).toBe('stop');
    expect(shortcutAction(key('Escape', element('BUTTON')), defaults)).toBe(
      'stop',
    );
    expect(
      shortcutAction(
        key('Escape', element('INPUT', {type: 'checkbox'})),
        defaults,
      ),
    ).toBe('stop');
  });

  it('does nothing while typing in a text field', () => {
    expect(
      shortcutAction(key('Escape', element('INPUT', {type: 'text'})), defaults),
    ).toBeUndefined();
    expect(
      shortcutAction(key('Escape', element('TEXTAREA')), defaults),
    ).toBeUndefined();
    expect(
      shortcutAction(
        key('Escape', element('DIV', {isContentEditable: true})),
        defaults,
      ),
    ).toBeUndefined();
  });

  it('ignores modifier combinations', () => {
    expect(
      shortcutAction(key('Escape', undefined, {ctrlKey: true}), defaults),
    ).toBeUndefined();
  });

  it('has no track power off shortcut unless configured', () => {
    expect(shortcutAction(key('F12'), defaults)).toBeUndefined();
    expect(
      shortcutAction(key('F12'), {stop: 'Escape', trackPowerOff: 'F12'}),
    ).toBe('trackPowerOff');
  });

  it('uses a configured STOP key', () => {
    const shortcuts = {stop: ' ', trackPowerOff: null};
    expect(shortcutAction(key(' '), shortcuts)).toBe('stop');
    expect(shortcutAction(key('Escape'), shortcuts)).toBeUndefined();
  });

  it('recognises text inputs', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(element('INPUT', {type: 'number'}))).toBe(true);
    expect(isTypingTarget(element('INPUT', {type: 'radio'}))).toBe(false);
  });

  it('given quick keys, runs each once per press, and STOP wins a held key', () => {
    const shortcuts = {
      stop: 'Escape',
      trackPowerOff: null,
      resume: 'F2',
      undoRoute: 'F3',
      newRoute: 'F4',
      fitView: 'Home',
    };
    expect(shortcutAction(key('F2'), shortcuts)).toBe('resume');
    expect(shortcutAction(key('F3'), shortcuts)).toBe('undoRoute');
    expect(shortcutAction(key('F4'), shortcuts)).toBe('newRoute');
    expect(shortcutAction(key('Home'), shortcuts)).toBe('fitView');
    expect(
      shortcutAction({...key('F2'), repeat: true}, shortcuts),
    ).toBeUndefined();
    expect(shortcutAction({...key('Escape'), repeat: true}, shortcuts)).toBe(
      'stop',
    );
    expect(
      shortcutAction(key('F4', element('INPUT', {type: 'text'})), shortcuts),
    ).toBeUndefined();
  });
});

describe('number keys for tabs', () => {
  it('given 1–9, picks the tab from the left; nothing else does', () => {
    expect(tabNumberKey(key('1'))).toBe(0);
    expect(tabNumberKey(key('9'))).toBe(8);
    expect(tabNumberKey(key('0'))).toBeUndefined();
    expect(tabNumberKey(key('1', undefined, {ctrlKey: true}))).toBeUndefined();
    expect(
      tabNumberKey(key('2', element('INPUT', {type: 'number'}))),
    ).toBeUndefined();
    expect(tabNumberKey(key('2', element('SELECT')))).toBeUndefined();
    expect(tabNumberKey({...key('3'), repeat: true})).toBeUndefined();
  });
});

describe('any key as a quick key', () => {
  it('given a letter, matches it with or without Shift', () => {
    const shortcuts = {stop: 'Escape', trackPowerOff: null, fitView: 'f'};
    expect(shortcutAction(key('f'), shortcuts)).toBe('fitView');
    expect(shortcutAction(key('F'), shortcuts)).toBe('fitView');
    expect(shortcutAction(key('g'), shortcuts)).toBeUndefined();
    // F1 is not the letter F.
    expect(shortcutAction(key('F1'), shortcuts)).toBeUndefined();
  });

  it('shows keys readably and never takes a modifier alone', () => {
    expect(keyLabel('Escape')).toBe('Esc');
    expect(keyLabel(' ')).toBe('Space');
    expect(keyLabel('q')).toBe('Q');
    expect(keyLabel('PageDown')).toBe('PageDown');
    expect(isModifierKey('Shift')).toBe(true);
    expect(isModifierKey('a')).toBe(false);
  });
});
