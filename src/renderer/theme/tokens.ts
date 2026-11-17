// Spacing, sizes and type scale. Operating mode uses large targets that can be
// read and hit from a distance (CARRY-4).
export const spacing = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  s: 4,
  m: 8,
  l: 12,
} as const;

export const fontSizes = {
  small: 13,
  body: 15,
  large: 18,
  title: 22,
  status: 20,
} as const;

// Minimum click/touch target in operating mode, in CSS pixels.
export const minTarget = 44;
// The STOP button is larger than everything else.
export const stopButtonSize = {width: 140, height: 56} as const;
