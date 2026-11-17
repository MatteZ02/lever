// Fails if a CSS file outside src/renderer/theme contains a colour value
// (CARRY-3). Stylesheets use the theme's CSS variables, e.g.
// `color: var(--color-text)`. Part of `npm run lint`.
import {readdirSync, readFileSync} from 'node:fs';
import {join, relative, sep} from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'src', 'renderer');
const THEME_DIR = join(ROOT, 'theme');
const COLOR =
  /#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\s*\(|\b(red|green|blue|black|white|gray|grey|yellow|orange)\b/;

const cssFiles = (dir) =>
  readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return path === THEME_DIR ? [] : cssFiles(path);
    }
    return entry.name.endsWith('.css') ? [path] : [];
  });

const problems = [];
for (const file of cssFiles(ROOT)) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      const code = line.replace(/\/\*.*?\*\//g, '');
      // Check property values only, so names like `white-space` pass.
      const colon = code.indexOf(':');
      const value = colon >= 0 ? code.slice(colon + 1) : code;
      if (COLOR.test(value)) {
        const name = relative(process.cwd(), file).split(sep).join('/');
        problems.push(`${name}:${index + 1}: ${line.trim()}`);
      }
    });
}

if (problems.length > 0) {
  console.error(
    'Hard-coded colours in CSS. Use a theme variable (see src/renderer/theme):',
  );
  problems.forEach((problem) => console.error(`  ${problem}`));
  process.exit(1);
}
