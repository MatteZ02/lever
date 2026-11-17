import react from '@vitejs/plugin-react';
import {defineConfig} from 'electron-vite';
import type {Plugin} from 'vite';

// Content-Security-Policy for the renderer (STK-14). Strict in builds; the dev
// server additionally needs inline scripts/styles and a WebSocket for hot
// reload.
const PRODUCTION_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-src 'none'",
].join('; ');

const DEVELOPMENT_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' ws://localhost:*",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-src 'none'",
].join('; ');

const contentSecurityPolicy = (): Plugin => {
  let csp = PRODUCTION_CSP;
  return {
    name: 'lever-csp',
    configResolved(config) {
      csp = config.command === 'serve' ? DEVELOPMENT_CSP : PRODUCTION_CSP;
    },
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: {'http-equiv': 'Content-Security-Policy', content: csp},
        injectTo: 'head-prepend',
      },
    ],
  };
};

export default defineConfig({
  main: {
    // Builds src/main/index.ts; the engine utility process is bundled
    // through its `?modulePath` import in src/main/engineHost.ts.
    build: {externalizeDeps: true},
  },
  preload: {
    // The sandboxed preload cannot require packages: bundle everything.
    build: {externalizeDeps: false},
  },
  renderer: {
    plugins: [react(), contentSecurityPolicy()],
  },
});
