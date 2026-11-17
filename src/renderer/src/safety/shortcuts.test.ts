import {describe, expect, it} from 'vitest';
import {isTypingTarget, shortcutAction} from './shortcuts';

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
});
