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
import {OpenResult, ProjectDocument, unsavedRisk} from './ProjectDocument';

// Functions, so they follow a change of language.
const projectFilters = () => [
  {name: strings.project.fileType, extensions: [PROJECT_FILE_EXTENSION]},
];

const z21Filters = () => [
  {name: strings.project.z21FileType, extensions: ['z21']},
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
    // These replace the open layout: never lose unsaved work silently.
    if (
      (action === 'new' ||
        action === 'open' ||
        action === 'import' ||
        action === 'importZ21') &&
      !(await this.confirmClose('replace', window))
    ) {
      return;
    }
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
          z21Filters(),
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

  // Before quitting: write pending changes, ask where work would be lost.
  // Returns false if the user cancels.
  async beforeQuit(): Promise<boolean> {
    if (!(await this.confirmClose('quit'))) {
      return false;
    }
    await this.document.close();
    return true;
  }

  // Before the open layout is closed or replaced. Commits what is being typed
  // in a field, writes a pending autosave, then asks if anything would still
  // be lost. Returns false if the user cancels (nothing changes).
  async confirmClose(
    reason: 'quit' | 'replace',
    window?: BrowserWindow,
  ): Promise<boolean> {
    await commitTyping();
    await this.document.flush();
    // On top of Lever's window, also when quitting (no window passed).
    const parent =
      window ??
      BrowserWindow.getFocusedWindow() ??
      BrowserWindow.getAllWindows()[0];
    const ask = (options: Electron.MessageBoxOptions) =>
      parent
        ? dialog.showMessageBox(parent, options)
        : dialog.showMessageBox(options);

    switch (unsavedRisk(this.document.get())) {
      case 'none':
        return true;
      case 'untitled': {
        const {response} = await ask({
          type: 'question',
          message:
            reason === 'quit'
              ? strings.project.saveBeforeQuit
              : strings.project.saveBeforeReplace,
          detail: strings.project.unsavedDetail,
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
          await this.run('saveAs', window);
          return this.document.get().path !== null;
        }
        return true;
      }
      case 'saveFailed': {
        const {response} = await ask({
          type: 'warning',
          message: strings.project.saveFailedClose,
          detail: strings.project.saveFailedCloseDetail,
          buttons: [
            strings.project.tryAgain,
            strings.project.discardChanges,
            strings.project.cancel,
          ],
          defaultId: 0,
          cancelId: 2,
        });
        if (response === 2) {
          return false;
        }
        if (response === 0) {
          await this.document.save();
          return unsavedRisk(this.document.get()) === 'none';
        }
        return true;
      }
    }
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
    filters: Electron.FileFilter[] = projectFilters(),
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
      filters: projectFilters(),
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

// A property field commits on Enter or when it loses focus; closing the window
// does neither. Take the focus away first so the typed value is kept, and
// give its edit a moment to arrive.
const commitTyping = async (): Promise<void> => {
  const windows = BrowserWindow.getAllWindows().filter(
    (window) => !window.isDestroyed(),
  );
  await Promise.all(
    windows.map((window) =>
      window.webContents
        .executeJavaScript(
          'document.activeElement instanceof HTMLElement && document.activeElement.blur(); true',
        )
        .catch(() => undefined),
    ),
  );
  if (windows.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};
