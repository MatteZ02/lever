// Raw colour values. Only colors.ts refers to these; components use the
// semantic tokens (see docs/development.md, "Changing colours").
export const palette = {
  white: '#FFFFFF',
  black: '#000000',

  grey50: '#F6F6F4',
  grey100: '#ECECE8',
  grey200: '#D9D9D4',
  grey300: '#BDBDB8',
  grey400: '#9A9A96',
  grey500: '#77777A',
  grey600: '#58585C',
  grey700: '#3E3E42',
  grey800: '#2A2A2D',
  grey850: '#1F1F22',
  grey900: '#161618',
  grey950: '#0F0F10',

  red300: '#FF8A80',
  red500: '#E53935',
  red600: '#D32F2F',
  red700: '#C62828',
  red800: '#A31515',

  green300: '#7EE08A',
  green400: '#4CC95B',
  green600: '#2E9E3E',
  green700: '#237A30',

  amber300: '#FFD54F',
  amber500: '#FFB300',
  amber700: '#C77C00',

  blue300: '#82B1FF',
  blue500: '#3D7BE0',
  blue700: '#1F4FA8',

  violet300: '#C3A6FF',
  violet600: '#7046C4',

  cyan300: '#7FDBEA',
  cyan700: '#00838F',

  lunar: '#E8EEF5',
} as const;
