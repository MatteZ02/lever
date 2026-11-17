// Project lock files (MULTI-5): a project open for editing in one Lever
// instance opens read-only in any other. The lock is a small JSON file next to
// the project (`<file>.lock`), refreshed regularly. A lock is stale when it
// has not been refreshed for STALE_AFTER_MS, or when its owner process on this
// PC no longer exists (e.g. after a crash).
import {open, readFile, unlink, writeFile} from 'node:fs/promises';
import {hostname} from 'node:os';

export const LOCK_REFRESH_MS = 30000;
export const STALE_AFTER_MS = 120000;

export type LockOwner = {
  instanceId: string;
  pid: number;
  hostname: string;
  updatedAt: number;
};

export type LockResult =
  {ok: true; lock: ProjectLock} | {ok: false; owner: LockOwner};

export const lockPath = (projectPath: string) => `${projectPath}.lock`;

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

export const isStale = (owner: LockOwner, now: number, host = hostname()) =>
  now - owner.updatedAt > STALE_AFTER_MS ||
  (owner.hostname === host && !isProcessAlive(owner.pid));

const readOwner = async (path: string): Promise<LockOwner | undefined> => {
  try {
    const data = JSON.parse(await readFile(path, 'utf8')) as LockOwner;
    return typeof data.instanceId === 'string' ? data : undefined;
  } catch {
    return undefined;
  }
};

export class ProjectLock {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly path: string,
    private readonly owner: Omit<LockOwner, 'updatedAt'>,
  ) {}

  startRefreshing(): void {
    this.timer = setInterval(() => {
      void this.write().catch(() => undefined);
    }, LOCK_REFRESH_MS);
  }

  async write(): Promise<void> {
    await writeFile(
      this.path,
      JSON.stringify({...this.owner, updatedAt: Date.now()}),
      'utf8',
    );
  }

  async release(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const current = await readOwner(this.path);
    if (current?.instanceId === this.owner.instanceId) {
      await unlink(this.path).catch(() => undefined);
    }
  }
}

// Takes the lock if it is free or stale.
export const acquireLock = async (
  projectPath: string,
  instanceId: string,
  now = Date.now(),
): Promise<LockResult> => {
  const path = lockPath(projectPath);
  const me = {instanceId, pid: process.pid, hostname: hostname()};
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, 'wx');
      await handle.writeFile(JSON.stringify({...me, updatedAt: now}), 'utf8');
      await handle.close();
      const lock = new ProjectLock(path, me);
      lock.startRefreshing();
      return {ok: true, lock};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
    const owner = await readOwner(path);
    if (owner && owner.instanceId === instanceId) {
      const lock = new ProjectLock(path, me);
      lock.startRefreshing();
      return {ok: true, lock};
    }
    if (owner && !isStale(owner, now)) {
      return {ok: false, owner};
    }
    // Stale or unreadable: remove and try once more.
    await unlink(path).catch(() => undefined);
  }
  const owner = await readOwner(path);
  return owner
    ? {ok: false, owner}
    : {
        ok: false,
        owner: {instanceId: '?', pid: 0, hostname: '?', updatedAt: now},
      };
};
