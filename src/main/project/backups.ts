// Rotating automatic backups (PRJ-3) and the backup before a migration
// (PRJ-5). Backups of `Layout.lever` live in `.lever-backups/Layout/` next to the
// file, so they move with the project folder.
import {copyFile, mkdir, readdir, stat, unlink} from 'node:fs/promises';
import {basename, dirname, extname, join} from 'node:path';

export const MAX_BACKUPS = 20;
// At most one automatic backup per this interval while editing.
export const BACKUP_INTERVAL_MS = 10 * 60 * 1000;

export type BackupReason = 'auto' | 'before-migration' | 'before-restore';

export type BackupInfo = {
  path: string;
  time: number;
  reason: BackupReason | 'unknown';
  size: number;
};

export const backupDir = (projectPath: string) =>
  join(
    dirname(projectPath),
    '.lever-backups',
    basename(projectPath, extname(projectPath)),
  );

const stamp = (time: number) =>
  new Date(time).toISOString().replace(/[:.]/g, '-');

// Copies the current file into the backup folder and removes the oldest
// automatic backups beyond MAX_BACKUPS. Backups made before a migration are
// never rotated away.
export const createBackup = async (
  projectPath: string,
  reason: BackupReason,
  now = Date.now(),
): Promise<string> => {
  const dir = backupDir(projectPath);
  await mkdir(dir, {recursive: true});
  const target = join(dir, `${stamp(now)}_${reason}${extname(projectPath)}`);
  await copyFile(projectPath, target);
  await rotate(dir);
  return target;
};

const parseReason = (name: string): BackupInfo['reason'] => {
  const match = /_(auto|before-migration|before-restore)\./.exec(name);
  return match ? (match[1] as BackupReason) : 'unknown';
};

export const listBackups = async (
  projectPath: string,
): Promise<BackupInfo[]> => {
  const dir = backupDir(projectPath);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const infos = await Promise.all(
    names.map(async (name) => {
      const path = join(dir, name);
      const info = await stat(path);
      return {
        path,
        time: info.mtimeMs,
        reason: parseReason(name),
        size: info.size,
      };
    }),
  );
  return infos.sort((a, b) => b.time - a.time);
};

const rotate = async (dir: string) => {
  const names = (await readdir(dir))
    .filter((name) => parseReason(name) !== 'before-migration')
    .sort()
    .reverse();
  for (const name of names.slice(MAX_BACKUPS)) {
    await unlink(join(dir, name)).catch(() => undefined);
  }
};
