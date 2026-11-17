import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {createProject} from '../../../model/project';
import {backupDir, createBackup, listBackups, MAX_BACKUPS} from '../backups';
import {acquireLock, isStale, lockPath, STALE_AFTER_MS} from '../lockFile';
import {readProjectFile, writeProjectFile} from '../projectFile';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lever-test-'));
  file = join(dir, 'Club.lever');
});

afterEach(async () => {
  await rm(dir, {recursive: true, force: true});
});

describe('project files', () => {
  it('writes atomically and reads back', async () => {
    const project = createProject('Club');
    await writeProjectFile(file, project);
    expect(await readProjectFile(file)).toEqual({ok: true, project});
    expect(await readdir(dir)).toEqual(['Club.lever']);
  });
});

describe('backups (PRJ-3)', () => {
  it('keeps the newest automatic backups and every pre-migration backup', async () => {
    await writeFile(file, '{}');
    await createBackup(file, 'before-migration', Date.UTC(2026, 0, 1));
    for (let i = 0; i < MAX_BACKUPS + 3; i++) {
      await createBackup(file, 'auto', Date.UTC(2026, 0, 2, 0, i));
    }
    const names = await readdir(backupDir(file));
    expect(names.filter((name) => name.includes('_auto.'))).toHaveLength(
      MAX_BACKUPS,
    );
    expect(
      names.filter((name) => name.includes('before-migration')),
    ).toHaveLength(1);
    // The oldest automatic ones went.
    expect(names.some((name) => name.startsWith('2026-01-02T00-00-'))).toBe(
      false,
    );
    const backups = await listBackups(file);
    expect(backups[0].reason).toMatch(/auto|before-migration/);
  });
});

describe('lock files (MULTI-5)', () => {
  it('lets one instance edit; the other is refused', async () => {
    await writeFile(file, '{}');
    const first = await acquireLock(file, 'instance-a');
    expect(first.ok).toBe(true);
    const second = await acquireLock(file, 'instance-b');
    expect(second).toMatchObject({
      ok: false,
      owner: {instanceId: 'instance-a'},
    });

    if (first.ok) {
      await first.lock.release();
    }
    const third = await acquireLock(file, 'instance-b');
    expect(third.ok).toBe(true);
    if (third.ok) {
      await third.lock.release();
    }
  });

  it('takes over a stale lock', async () => {
    await writeFile(
      lockPath(file),
      JSON.stringify({
        instanceId: 'old',
        pid: 1,
        hostname: 'elsewhere',
        updatedAt: 0,
      }),
    );
    const result = await acquireLock(file, 'new', STALE_AFTER_MS + 1000);
    expect(result.ok).toBe(true);
    expect(JSON.parse(await readFile(lockPath(file), 'utf8'))).toMatchObject({
      instanceId: 'new',
    });
    if (result.ok) {
      await result.lock.release();
    }
  });

  it('treats a lock of a dead process on this PC as stale', () => {
    expect(
      isStale(
        {instanceId: 'x', pid: 999999, hostname: 'pc', updatedAt: 1000},
        1000,
        'pc',
      ),
    ).toBe(true);
    expect(
      isStale(
        {instanceId: 'x', pid: process.pid, hostname: 'pc', updatedAt: 1000},
        1000,
        'pc',
      ),
    ).toBe(false);
  });
});
