// The API the preload exposes to renderers as `window.lever` (STK-13). Types
// only; shared by the preload (node build) and the renderer (web build).
import type {Project} from '../model/project';
import type {EngineCommandInput, EngineEvent} from '../shared/engineApi';
import type {Language} from '../shared/language';
import type {ProjectFileAction, ProjectState} from '../shared/projectApi';
import type {Settings, SettingsUpdate} from '../shared/settings';

export type LeverApi = {
  // The user interface language, fixed while the page is loaded.
  language: Language;
  engine: {
    // Sends a command to the engine. Commands sent before the port is ready
    // (the first moments after the window opens) are dropped.
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
  // Windows (VIEW-2). Targets are formatted by shared/windowTarget.ts; a new
  // window gets its target in its URL hash.
  window: {
    open(target: string): void;
    // What this window shows now (reopened there next time).
    setTarget(target: string): void;
  };
  project: {
    get(): Promise<ProjectState>;
    // Sends the edited project; the main process validates and autosaves it.
    // `clientId` identifies the window, so it can recognise its own edits.
    // A refused update returns the reason: 'readOnly' or 'invalid'.
    update(
      project: Project,
      clientId: string,
    ): Promise<{revision: number} | {error: string}>;
    // File actions; the main process shows the dialogs.
    action(action: ProjectFileAction): Promise<void>;
    onChange(listener: (state: ProjectState) => void): () => void;
  };
};

export type {EngineEvent};

declare global {
  interface Window {
    lever: LeverApi;
  }
}
