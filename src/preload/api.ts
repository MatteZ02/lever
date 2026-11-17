// The API the preload exposes to renderers as `window.lever` (STK-13). Types
// only; shared by the preload (node build) and the renderer (web build).
import type {EngineCommandInput, EngineEvent} from '../shared/engineApi';
import type {Settings, SettingsUpdate} from '../shared/settings';

export type LeverApi = {
  engine: {
    // Sends a command to the engine. Commands sent before the port is ready
    // are dropped; STOP is also sent at once when it becomes ready.
    send(command: EngineCommandInput): void;
    // Engine events (unvalidated; the renderer validates them). Returns an
    // unsubscribe function.
    subscribe(listener: (event: unknown) => void): () => void;
  };
  settings: {
    get(): Promise<Settings>;
    update(update: SettingsUpdate): Promise<Settings>;
    onChange(listener: (settings: Settings) => void): () => void;
  };
  app: {
    info(): Promise<{version: string}>;
  };
};

export type {EngineEvent};

declare global {
  interface Window {
    lever: LeverApi;
  }
}
