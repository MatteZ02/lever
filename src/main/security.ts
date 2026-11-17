// Electron hardening (STK-12–STK-14): no remote content, no navigation, no
// new windows, no permissions. The Content-Security-Policy itself is in the
// renderer's index.html (see electron.vite.config.ts).
import {app, session} from 'electron';

export const applySecurityPolicy = (): void => {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event) => event.preventDefault());
    contents.on('will-redirect', (event) => event.preventDefault());
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({action: 'deny'}));
  });

  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  // Lever talks only to the central unit (UDP, from the engine process). The
  // renderer may load nothing from the network; only the local dev server
  // during development.
  const devServer = process.env['ELECTRON_RENDERER_URL'];
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    const allowed =
      url.startsWith('file:') ||
      url.startsWith('devtools:') ||
      url.startsWith('data:') ||
      (devServer !== undefined &&
        (url.startsWith(devServer) || url.startsWith('ws://localhost')));
    callback({cancel: !allowed});
  });
};
