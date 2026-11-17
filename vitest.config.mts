import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    // The protocol tests are shared with Throttle (Jest) and use globals.
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
  },
});
