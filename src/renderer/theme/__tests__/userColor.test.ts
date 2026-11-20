import {describe, expect, it} from 'vitest';
import {darkColors, lightColors} from '../colors';
import {
  contrastRatio,
  diagramTextColor,
  hexToHsv,
  hsvToHex,
  MIN_TEXT_CONTRAST,
  normalizeHex,
  parseHex,
  readableOn,
} from '../userColor';

describe('user colours', () => {
  it('reads hex colours in the usual forms and stores them as #rrggbb', () => {
    expect(normalizeHex('#C62828')).toBe('#c62828');
    expect(normalizeHex('c62828')).toBe('#c62828');
    expect(normalizeHex(' #f00 ')).toBe('#ff0000');
    expect(normalizeHex('red')).toBeUndefined();
    expect(normalizeHex('#12345')).toBeUndefined();
  });

  it('converts between hex and HSV without drifting', () => {
    for (const hex of [
      '#c62828',
      '#237a30',
      '#1f4fa8',
      '#77777a',
      '#000000',
      '#ffffff',
    ]) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
    expect(hexToHsv('#ff0000')).toEqual({h: 0, s: 1, v: 1});
    expect(hexToHsv('#0000ff').h).toBeCloseTo(240);
  });

  it('keeps a colour that already reads on the background', () => {
    expect(readableOn('#1f4fa8', lightColors.diagramBackground)).toBe(
      '#1f4fa8',
    );
  });

  it('lightens a dark colour on a dark background, darkens a light one on a light background', () => {
    for (const [hex, background] of [
      ['#1f4fa8', darkColors.diagramBackground],
      ['#ffe14d', lightColors.diagramBackground],
    ]) {
      const shown = readableOn(hex, background);
      expect(shown).not.toBe(hex);
      expect(
        contrastRatio(parseHex(shown)!, parseHex(background)!),
      ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it('gives the diagram one shade per theme', () => {
    expect(diagramTextColor('#1f4fa8')).toMatch(
      /^light-dark\(#1f4fa8, #[0-9a-f]{6}\)$/,
    );
  });
});
