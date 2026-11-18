// File actions with their dialogs (PRJ-2–PRJ-4), on top of ProjectDocument.
// One instance per Lever process; every window sees the same document.
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {app, BrowserWindow, dialog} from 'electron';
import {LoadError} from '../../model/migrations';
import {createProject, PROJECT_FILE_EXTENSION} from '../../model/project';
import {importZ21, Z21ImportIssue} from '../../model/z21Import';
import {ProjectFileAction, ProjectState} from '../../shared/projectApi';
import {strings} from '../../shared/strings';
import {readZ21File} from '../z21File';
import {backupDir} from './backups';
import {OpenResult, ProjectDocument} from './ProjectDocument';

const FILTERS = [
  {name: strings.project.fileType, extensions: [PROJECT_FILE_EXTENSION]},
];

const Z21_FILTERS = [{name: strings.project.z21FileType, extensions: ['z21']}];

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
      case 'importZ21': {
        const path = await this.chooseFile(
          window,
          strings.project.importZ21Title,
          undefined,
          Z21_FILTERS,
        );
        if (path) {
          await this.importZ21(path);
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

  // A Z21 app control station becomes a new, unsaved layout (the .z21 file
  // is only read).
  private async importZ21(path: string): Promise<void> {
    try {
      const {project, issues} = importZ21(await readZ21File(path));
      await this.document.newProject(project);
      this.options.rememberPath(null);
      void dialog.showMessageBox({
        type: 'info',
        message: strings.project.z21Imported(project.views.length),
        detail: issues.map(describeZ21Issue).join('\n'),
      });
    } catch (error) {
      void dialog.showMessageBox({
        type: 'error',
        message: strings.project.z21Failed,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
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
    filters: Electron.FileFilter[] = FILTERS,
  ): Promise<string | undefined> {
    const options = {
      title,
      defaultPath,
      filters,
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

const describeZ21Issue = (issue: Z21ImportIssue): string => {
  const text = strings.project.z21Issues;
  switch (issue.code) {
    case 'duplicatePage':
      return text.duplicatePage(issue.page, issue.of);
    case 'unknownControl':
      return text.unknownControl(issue.type, issue.count);
    case 'oddAngle':
      return text.oddAngle(issue.page, issue.count);
    case 'invalidAddress':
      return text.invalidAddress(issue.page, issue.address);
    case 'routesNotImported':
      return text.routesNotImported(issue.count);
    case 'signalsAssumed':
      return text.signalsAssumed(issue.count);
  }
};

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
