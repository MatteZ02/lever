// Preload (sandboxed, context-isolated). Holds this window's MessagePort to
// the engine and exposes a small typed API (STK-13). The renderer never gets
// the raw port or ipcRenderer.
import {contextBridge, ipcRenderer} from 'electron';
import {ENGINE_API_VERSION} from '../shared/apiVersion';
import type {EngineCommandInput} from '../shared/engineApi';
import type {ProjectState} from '../shared/projectApi';
import type {Settings, SettingsUpdate} from '../shared/settings';
import type {LeverApi} from './api';

// The DOM MessagePort (the preload project has no DOM lib).
type RendererPort = Electron.IpcRendererEvent['ports'][number];

let enginePort: RendererPort | null = null;
const engineListeners = new Set<(event: unknown) => void>();
// Engine events that arrived before the page subscribed (see below).
const earlyEngineEvents: unknown[] = [];

// The main process sends a port on request, and a new one if the engine was
// restarted.
ipcRenderer.on('engine-port', (event) => {
  const [port] = event.ports;
  if (!port) {
    return;
  }
  enginePort?.close();
  enginePort = port;
  port.onmessage = (message: {data: unknown}) => {
    // The engine sends its snapshot as soon as the port is attached, often
    // before the page has subscribed. Keep it (and anything else) until then:
    // a lost snapshot left the window showing "Not connected" for good.
    if (engineListeners.size === 0) {
      earlyEngineEvents.push(message.data);
      return;
    }
    for (const listener of engineListeners) {
      listener(message.data);
    }
  };
  port.start();
});
ipcRenderer.send('engine:request-port');

const api: LeverApi = {
  // Asked once, before the page's scripts run: strings.ts picks its table
  // from it when it loads.
  language: ipcRenderer.sendSync('settings:language') === 'fi' ? 'fi' : 'en',
  engine: {
    send(command: EngineCommandInput) {
      enginePort?.postMessage({...command, v: ENGINE_API_VERSION});
    },
    subscribe(listener) {
      engineListeners.add(listener);
      for (const event of earlyEngineEvents.splice(0)) {
        listener(event);
      }
      return () => {
        engineListeners.delete(listener);
      };
    },
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<Settings>,
    update: (update: SettingsUpdate) =>
      ipcRenderer.invoke('settings:update', update) as Promise<Settings>,
    onChange(listener) {
      const handler = (_event: unknown, settings: Settings) =>
        listener(settings);
      ipcRenderer.on('settings:changed', handler);
      return () => {
        ipcRenderer.off('settings:changed', handler);
      };
    },
  },
  app: {
    info: () => ipcRenderer.invoke('app:info') as Promise<{version: string}>,
  },
  window: {
    open: (target) => ipcRenderer.send('window:open', target),
    setTarget: (target) => ipcRenderer.send('window:target', target),
  },
  project: {
    get: () => ipcRenderer.invoke('project:get') as Promise<ProjectState>,
    update: (project, clientId) =>
      ipcRenderer.invoke('project:update', project, clientId) as Promise<
        {revision: number} | {error: string}
      >,
    action: (action) =>
      ipcRenderer.invoke('project:action', action) as Promise<void>,
    onChange(listener) {
      const handler = (_event: unknown, state: ProjectState) => listener(state);
      ipcRenderer.on('project:changed', handler);
      return () => {
        ipcRenderer.off('project:changed', handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld('lever', api);
