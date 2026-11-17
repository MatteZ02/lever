// What renderers know about the open project, and the file actions they can
// ask for. The main process owns the document (one copy per instance, shared
// by all windows); renderers edit and send whole projects back.
import type {Project} from '../model/project';

export type ProjectState = {
  // Increases with every change; lets windows ignore stale copies.
  revision: number;
  // null: not saved yet ("Untitled").
  path: string | null;
  project: Project;
  // Open in another Lever instance (MULTI-5), so not editable here.
  readOnly: boolean;
  lockedBy?: {hostname: string; pid: number};
  // Opened from an older schema version and migrated (PRJ-5).
  migratedFrom?: number;
  // Changes not yet written to disk (autosave pending, or never saved).
  unsaved: boolean;
  lastSavedAt?: number;
};

export type ProjectFileAction =
  | 'new'
  | 'open'
  | 'save'
  | 'saveAs'
  | 'exportCopy'
  | 'import'
  | 'restoreBackup';

export type BackupEntry = {
  path: string;
  time: number;
  reason: string;
};
