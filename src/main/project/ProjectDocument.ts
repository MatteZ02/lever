// The open project of this Lever instance (PRJ-1–PRJ-5, MULTI-5). Owns the
// file, the lock, autosave and backups. No Electron imports, so it can be
// tested with temporary folders; dialogs are in projectMenu.ts.
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {LoadError} from '../../model/migrations';
import {Project, projectSchema} from '../../model/project';
import {ProjectState} from '../../shared/projectApi';
import {
  BACKUP_INTERVAL_MS,
  BackupInfo,
  createBackup,
  listBackups,
} from './backups';
import {acquireLock, ProjectLock} from './lockFile';
import {readProjectFile, writeProjectFile} from './projectFile';

// Autosave this long after the last change (PRJ-3).
export const AUTOSAVE_DELAY_MS = 1500;

export type OpenResult =
  | {ok: true}
  | {ok: false; error: LoadError | {code: 'unreadable'; message: string}};

export type ProjectDocumentOptions = {
  instanceId: string;
  // Where untitled projects are autosaved (recovery).
  recoveryDir: string;
  initial: Project;
  onChange: (state: ProjectState) => void;
  onError?: (message: string) => void;
};

export class ProjectDocument {
  private state: ProjectState;
  private lock: ProjectLock | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBackupAt = 0;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly options: ProjectDocumentOptions) {
    this.state = {
      revision: 1,
      path: null,
      project: options.initial,
      readOnly: false,
      unsaved: false,
    };
  }

  get(): ProjectState {
    return this.state;
  }

  async newProject(project: Project): Promise<void> {
    await this.close();
    this.replace({
      path: null,
      project,
      readOnly: false,
      lockedBy: undefined,
      migratedFrom: undefined,
      unsaved: true,
      lastSavedAt: undefined,
    });
    this.scheduleAutosave();
  }

  async open(path: string): Promise<OpenResult> {
    let result;
    try {
      result = await readProjectFile(path);
    } catch (error) {
      return {ok: false, error: {code: 'unreadable', message: String(error)}};
    }
    if (!result.ok) {
      return {ok: false, error: result.error};
    }
    await this.close();
    const locked = await acquireLock(path, this.options.instanceId);
    this.lock = locked.ok ? locked.lock : null;
    this.lastBackupAt = 0;
    this.replace({
      path,
      project: result.project,
      readOnly: !locked.ok,
      lockedBy: locked.ok
        ? undefined
        : {hostname: locked.owner.hostname, pid: locked.owner.pid},
      migratedFrom: result.migratedFrom,
      unsaved: false,
      lastSavedAt: undefined,
    });
    // A migrated file is backed up as it was, then saved in the new format
    // (PRJ-5). Read-only copies are left alone.
    if (result.migratedFrom !== undefined && locked.ok) {
      await createBackup(path, 'before-migration');
      await this.writeNow();
    }
    return {ok: true};
  }

  // Opens a project file as a new, untitled copy (import, PRJ-2).
  async importCopy(path: string): Promise<OpenResult> {
    const result = await readProjectFile(path).catch((error: unknown) => ({
      ok: false as const,
      error: {code: 'unreadable' as const, message: String(error)},
    }));
    if (!result.ok) {
      return {ok: false, error: result.error};
    }
    await this.newProject(result.project);
    return {ok: true};
  }

  // A change from the editor. Validated again here: it crossed a process
  // boundary.
  update(project: unknown): number {
    if (this.state.readOnly) {
      throw new Error('Project is read-only');
    }
    const parsed = projectSchema.parse(project);
    this.replace({project: parsed, unsaved: true});
    this.scheduleAutosave();
    return this.state.revision;
  }

  // Saves to the current file. False if it has none yet (use saveAs).
  async save(): Promise<boolean> {
    if (this.state.path === null) {
      return false;
    }
    await this.writeNow();
    return true;
  }

  async saveAs(path: string): Promise<void> {
    const project = this.state.project;
    await this.close();
    const locked = await acquireLock(path, this.options.instanceId);
    if (!locked.ok) {
      throw new Error(`Locked by ${locked.owner.hostname}`);
    }
    this.lock = locked.lock;
    this.lastBackupAt = Date.now();
    this.replace({
      path,
      project,
      readOnly: false,
      lockedBy: undefined,
      migratedFrom: undefined,
    });
    await this.writeNow();
  }

  // Writes a copy elsewhere; the open file stays the same (export, PRJ-2).
  async exportCopy(path: string): Promise<void> {
    await writeProjectFile(path, this.state.project);
  }

  async backups(): Promise<BackupInfo[]> {
    return this.state.path ? listBackups(this.state.path) : [];
  }

  // Replaces the project with a backup; the current file is backed up first.
  async restoreBackup(backupPath: string): Promise<OpenResult> {
    if (this.state.path === null || this.state.readOnly) {
      return {
        ok: false,
        error: {code: 'unreadable', message: 'No editable file'},
      };
    }
    const result = await readProjectFile(backupPath).catch(
      (error: unknown) => ({
        ok: false as const,
        error: {code: 'unreadable' as const, message: String(error)},
      }),
    );
    if (!result.ok) {
      return {ok: false, error: result.error};
    }
    await this.flush();
    await createBackup(this.state.path, 'before-restore');
    this.replace({project: result.project, unsaved: true});
    await this.writeNow();
    return {ok: true};
  }

  // Writes a pending autosave now (before quitting or switching files).
  async flush(): Promise<void> {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
      await this.writeNow();
    }
    await this.writing;
  }

  async close(): Promise<void> {
    await this.flush();
    await this.lock?.release();
    this.lock = null;
  }

  private replace(changes: Partial<ProjectState>): void {
    this.state = {...this.state, ...changes, revision: this.state.revision + 1};
    this.options.onChange(this.state);
  }

  private scheduleAutosave(): void {
    if (this.state.readOnly) {
      return;
    }
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
    }
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.writeNow();
    }, AUTOSAVE_DELAY_MS);
  }

  private writeNow(): Promise<void> {
    const {path, project, readOnly} = this.state;
    if (readOnly) {
      return this.writing;
    }
    // Serialise writes; each one writes the newest project.
    this.writing = this.writing
      .then(async () => {
        if (path === null) {
          await mkdir(this.options.recoveryDir, {recursive: true});
          await writeProjectFile(
            join(
              this.options.recoveryDir,
              `untitled-${this.options.instanceId}.lever`,
            ),
            project,
          );
          return;
        }
        const now = Date.now();
        if (now - this.lastBackupAt >= BACKUP_INTERVAL_MS) {
          await createBackup(path, 'auto').catch(() => undefined);
          this.lastBackupAt = now;
        }
        await writeProjectFile(path, project);
        if (this.state.project === project) {
          this.replace({unsaved: false, lastSavedAt: now});
        }
      })
      .catch((error: unknown) => {
        this.options.onError?.(String(error));
      });
    return this.writing;
  }
}
