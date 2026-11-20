// Colours chosen by the user (e.g. the text colour of a label) and the colour
// maths behind the colour picker. A chosen colour is stored as '#rrggbb'; the
// theme decides how it is drawn: if it would be hard to read on the diagram
// background of the current theme, it is lightened (dark theme) or darkened
// (light theme) just enough, keeping its hue.
import {darkColors, lightColors} from './colors';
import {palette} from './palette';

export type Rgb = {r: number; g: number; b: number}; // 0–255
export type Hsv = {h: number; s: number; v: number}; // h 0–360, s/v 0–1

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

// '#rgb' or '#rrggbb' (the '#' optional, any case) → RGB; undefined if not a
// colour.
export const parseHex = (text: string): Rgb | undefined => {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!match) {
    return undefined;
  }
  const digits =
    match[1].length === 3
      ? [...match[1]].map((digit) => digit + digit).join('')
      : match[1];
  const number = parseInt(digits, 16);
  return {r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255};
};

// RGB → '#rrggbb' (lower case).
export const toHex = ({r, g, b}: Rgb): string =>
  '#' +
  [r, g, b]
    .map((channel) =>
      Math.round(clamp(channel, 0, 255))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

// A typed colour in the stored form ('#rrggbb'), or undefined.
export const normalizeHex = (text: string): string | undefined => {
  const rgb = parseHex(text);
  return rgb && toHex(rgb);
};

export const rgbToHsv = ({r, g, b}: Rgb): Hsv => {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  let h = 0;
  if (delta > 0) {
    if (max === red) {
      h = ((green - blue) / delta) % 6;
    } else if (max === green) {
      h = (blue - red) / delta + 2;
    } else {
      h = (red - green) / delta + 4;
    }
  }
  return {h: (h * 60 + 360) % 360, s: max === 0 ? 0 : delta / max, v: max};
};

export const hsvToRgb = ({h, s, v}: Hsv): Rgb => {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * clamp(Math.min(k, 4 - k));
  };
  return {r: f(5) * 255, g: f(3) * 255, b: f(1) * 255};
};

export const hexToHsv = (hex: string): Hsv =>
  rgbToHsv(parseHex(hex) ?? {r: 0, g: 0, b: 0});
export const hsvToHex = (hsv: Hsv): string => toHex(hsvToRgb(hsv));

// WCAG relative luminance and contrast ratio.
const luminance = ({r, g, b}: Rgb) => {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};

// Small diagram text should reach the WCAG AA ratio for normal text.
export const MIN_TEXT_CONTRAST = 4.5;

// The colour, moved towards white or black (whichever the background is
// further from) in small steps until it reads on the background. Unchanged
// if it already does.
export const readableOn = (hex: string, background: string): string => {
  const colour = parseHex(hex);
  const back = parseHex(background);
  if (!colour || !back) {
    return hex;
  }
  const target: Rgb =
    luminance(back) < 0.5 ? {r: 255, g: 255, b: 255} : {r: 0, g: 0, b: 0};
  for (let step = 0; step <= 20; step++) {
    const t = step / 20;
    const mixed: Rgb = {
      r: colour.r + (target.r - colour.r) * t,
      g: colour.g + (target.g - colour.g) * t,
      b: colour.b + (target.b - colour.b) * t,
    };
    if (contrastRatio(mixed, back) >= MIN_TEXT_CONTRAST) {
      return toHex(mixed);
    }
  }
  return toHex(target);
};

// A CSS colour for a user-chosen text colour on the diagram: one shade per
// theme, picked by the document's color-scheme (set by applyTheme).
export const diagramTextColor = (hex: string): string =>
  `light-dark(${readableOn(hex, lightColors.diagramBackground)}, ${readableOn(
    hex,
    darkColors.diagramBackground,
  )})`;

// Colours offered as one-click choices next to the picker.
export const COLOR_PRESETS = [
  {name: 'red', color: palette.red700},
  {name: 'orange', color: palette.amber700},
  {name: 'yellow', color: palette.yellow700},
  {name: 'green', color: palette.green700},
  {name: 'blue', color: palette.blue700},
  {name: 'violet', color: palette.violet600},
  {name: 'grey', color: palette.grey500},
] as const;

// Backgrounds of the picker's saturation/brightness area and hue slider.
export const pickerAreaBackground = (hue: number): string =>
  `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${hsvToHex({h: hue, s: 1, v: 1})}`;
export const pickerHueBackground = `linear-gradient(to right, ${[
  0, 60, 120, 180, 240, 300, 360,
]
  .map((h) => hsvToHex({h, s: 1, v: 1}))
  .join(', ')})`;
// Where the picker starts when there is no colour yet.
export const pickerStartColor = palette.grey500;
// Outline of the picker's markers, visible on any colour.
export const pickerMarker = {inner: '#fff', outer: '#000'};
