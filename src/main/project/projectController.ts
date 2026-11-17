// File actions with their dialogs (PRJ-2–PRJ-4), on top of ProjectDocument.
// One instance per Lever process; every window sees the same document.
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {app, BrowserWindow, dialog} from 'electron';
import {LoadError} from '../../model/migrations';
import {createProject, PROJECT_FILE_EXTENSION} from '../../model/project';
import {ProjectFileAction, ProjectState} from '../../shared/projectApi';
import {strings} from '../../shared/strings';
import {backupDir} from './backups';
import {OpenResult, ProjectDocument} from './ProjectDocument';

const FILTERS = [
  {name: strings.project.fileType, extensions: [PROJECT_FILE_EXTENSION]},
];

export type ProjectControllerOptions = {
  onState: (state: ProjectState) => void;
  rememberPath: (path: string | null) => void;
};

export class ProjectController {
  readonly document: ProjectDocument;

  constructor(private readonly options: ProjectControllerOptions) {
    this.document = new ProjectDocument({
      instanceId: randomUUID(),
      recoveryDir: join(app.getPath('userData'), 'recovery'),
      initial: createProject(strings.project.untitled),
      onChange: options.onState,
      onError: (message) => {
        void dialog.showMessageBox({
          type: 'error',
          message: strings.project.saveFailed,
          detail: message,
        });
      },
    });
  }

  // Reopens the last project (PRJ-4); stays on an empty project if that fails.
  async reopen(path: string | null): Promise<void> {
    if (path && existsSync(path)) {
      const result = await this.document.open(path);
      if (!result.ok) {
        this.options.rememberPath(null);
      }
    }
  }

  async run(action: ProjectFileAction, window?: BrowserWindow): Promise<void> {
    switch (action) {
      case 'new':
        await this.document.newProject(createProject(strings.project.untitled));
        this.options.rememberPath(null);
        return;
      case 'open': {
        const path = await this.chooseFile(window, strings.project.openTitle);
        if (path) {
          await this.reportOpen(await this.document.open(path), path);
        }
        return;
      }
      case 'save':
        if (!(await this.document.save())) {
          await this.run('saveAs', window);
        }
        return;
      case 'saveAs': {
        const path = await this.chooseSaveFile(
          window,
          strings.project.saveAsTitle,
        );
        if (path) {
          await this.document.saveAs(path).catch((error: unknown) => {
            void dialog.showMessageBox({
              type: 'error',
              message: strings.project.saveFailed,
              detail: String(error),
            });
          });
          this.options.rememberPath(this.document.get().path);
        }
        return;
      }
      case 'exportCopy': {
        const path = await this.chooseSaveFile(
          window,
          strings.project.exportTitle,
        );
        if (path) {
          await this.document.exportCopy(path);
        }
        return;
      }
      case 'import': {
        const path = await this.chooseFile(window, strings.project.importTitle);
        if (path) {
          await this.reportOpen(await this.document.importCopy(path), path);
          this.options.rememberPath(null);
        }
        return;
      }
      case 'restoreBackup': {
        const current = this.document.get().path;
        if (!current || this.document.get().readOnly) {
          void dialog.showMessageBox({
            type: 'info',
            message: strings.project.noBackups,
          });
          return;
        }
        const path = await this.chooseFile(
          window,
          strings.project.restoreTitle,
          backupDir(current),
        );
        if (path) {
          await this.reportOpen(await this.document.restoreBackup(path), path);
        }
        return;
      }
    }
  }

  // Before quitting: write pending changes; ask about an untitled project
  // with content. Returns false if the user cancels.
  async beforeQuit(): Promise<boolean> {
    const state = this.document.get();
    const hasContent = state.project.views.some(
      (view) => view.elements.length > 0,
    );
    if (state.path === null && hasContent) {
      const {response} = await dialog.showMessageBox({
        type: 'question',
        message: strings.project.saveBeforeQuit,
        buttons: [
          strings.project.save,
          strings.project.dontSave,
          strings.project.cancel,
        ],
        defaultId: 0,
        cancelId: 2,
      });
      if (response === 2) {
        return false;
      }
      if (response === 0) {
        await this.run('saveAs');
        if (this.document.get().path === null) {
          return false;
        }
      }
    }
    await this.document.close();
    return true;
  }

  private async reportOpen(result: OpenResult, path: string): Promise<void> {
    if (result.ok) {
      const state = this.document.get();
      if (state.path) {
        this.options.rememberPath(state.path);
      }
      if (state.readOnly) {
        void dialog.showMessageBox({
          type: 'info',
          message: strings.project.openedReadOnly,
          detail: strings.project.lockedBy(state.lockedBy?.hostname ?? '?'),
        });
      }
      if (state.migratedFrom !== undefined) {
        void dialog.showMessageBox({
          type: 'info',
          message: strings.project.migrated(state.migratedFrom),
        });
      }
      return;
    }
    void dialog.showMessageBox({
      type: 'error',
      message: strings.project.openFailed(path),
      detail: describeError(result.error),
    });
  }

  private async chooseFile(
    window: BrowserWindow | undefined,
    title: string,
    defaultPath?: string,
  ): Promise<string | undefined> {
    const options = {
      title,
      defaultPath,
      filters: FILTERS,
      properties: ['openFile' as const],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? undefined : result.filePaths[0];
  }

  private async chooseSaveFile(
    window: BrowserWindow | undefined,
    title: string,
  ): Promise<string | undefined> {
    const name = this.document.get().project.name;
    const options = {
      title,
      defaultPath: `${name}.${PROJECT_FILE_EXTENSION}`,
      filters: FILTERS,
    };
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    return result.canceled ? undefined : result.filePath;
  }
}

const describeError = (
  error: LoadError | {code: 'unreadable'; message: string},
): string => {
  switch (error.code) {
    case 'notJson':
    case 'notAProject':
      return strings.project.errors.notAProject;
    case 'newerVersion':
      return strings.project.errors.newerVersion;
    case 'missingMigration':
      return strings.project.errors.missingMigration(error.version);
    case 'invalid':
      return strings.project.errors.invalid(error.details);
    case 'unreadable':
      return error.message;
  }
};
