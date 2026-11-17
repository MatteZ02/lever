// Theme entry point. Colours reach the UI as CSS custom properties, so a
// theme switch needs no re-render and stylesheets can use them too:
//   style={{color: color.text}}      // → 'var(--color-text)'
//   .panel { background: var(--color-surface); }
import {ColorTokens, darkColors, lightColors} from './colors';
import {fontSizes, minTarget, radii, spacing, stopButtonSize} from './tokens';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = 'system' | ThemeMode;

export {
  diagramDash,
  diagramStroke,
  ROUTE_SETTING_ANIMATION_MS,
} from './diagram';
export {fontSizes, minTarget, radii, spacing, stopButtonSize};
export type {ColorTokens};

const cssName = (token: string) => `--color-${token}`;

// Token name → `var(--color-…)`, for inline styles and SVG.
export const color = Object.fromEntries(
  Object.keys(lightColors).map((token) => [token, `var(${cssName(token)})`]),
) as {[K in keyof ColorTokens]: string};

export const resolveThemeMode = (
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ThemeMode =>
  preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;

// Writes the tokens of the given mode to the document root.
export const applyTheme = (mode: ThemeMode, root: HTMLElement): void => {
  const colors = mode === 'dark' ? darkColors : lightColors;
  for (const [token, value] of Object.entries(colors)) {
    root.style.setProperty(cssName(token), value);
  }
  root.style.setProperty('color-scheme', mode);
  root.dataset['theme'] = mode;
};
