import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {serializeProject} from '../../../model/migrations';
import {createProject} from '../../../model/project';
import {ProjectState} from '../../../shared/projectApi';
import {backupDir} from '../backups';
import {AUTOSAVE_DELAY_MS, ProjectDocument} from '../ProjectDocument';

let dir: string;
let documents: ProjectDocument[];

const makeDocument = (instanceId = 'a') => {
  const states: ProjectState[] = [];
  const document = new ProjectDocument({
    instanceId,
    recoveryDir: join(dir, 'recovery'),
    initial: createProject('Untitled'),
    onChange: (state) => states.push(state),
  });
  documents.push(document);
  return {document, states};
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lever-doc-'));
  documents = [];
});

afterEach(async () => {
  for (const document of documents) {
    await document.close();
  }
  await rm(dir, {recursive: true, force: true});
});

describe('ProjectDocument', () => {
  it('saves as, then autosaves changes to the same file', async () => {
    const {document} = makeDocument();
    const path = join(dir, 'Club.lever');
    await document.saveAs(path);
    const project = {...document.get().project, name: 'Renamed'};
    document.update(project);
    expect(document.get().unsaved).toBe(true);

    await wait(AUTOSAVE_DELAY_MS + 200);
    expect(JSON.parse(await readFile(path, 'utf8')).name).toBe('Renamed');
    expect(document.get().unsaved).toBe(false);
  });

  it('opens a file read-only while another instance has it (MULTI-5)', async () => {
    const path = join(dir, 'Club.lever');
    await writeFile(path, serializeProject(createProject('Club')));
    const first = makeDocument('a');
    const second = makeDocument('b');
    await first.document.open(path);
    await second.document.open(path);

    expect(first.document.get().readOnly).toBe(false);
    expect(second.document.get().readOnly).toBe(true);
    expect(() =>
      second.document.update(second.document.get().project),
    ).toThrow();

    // Once the first closes, the second can open it for editing.
    await first.document.close();
    await second.document.open(path);
    expect(second.document.get().readOnly).toBe(false);
  });

  it('refuses invalid projects from a renderer', () => {
    const {document} = makeDocument();
    expect(() => document.update({format: 'lever-project'})).toThrow();
  });

  it('reports files it cannot open, without closing the current one', async () => {
    const {document} = makeDocument();
    const path = join(dir, 'notes.lever');
    await writeFile(path, 'not json');
    expect(await document.open(path)).toEqual({
      ok: false,
      error: {code: 'notJson'},
    });
    expect(document.get().path).toBeNull();
  });

  it('exports a copy without changing the open file', async () => {
    const {document} = makeDocument();
    const path = join(dir, 'Club.lever');
    await document.saveAs(path);
    await document.exportCopy(join(dir, 'Copy.lever'));
    expect(document.get().path).toBe(path);
    expect(await readdir(dir)).toContain('Copy.lever');
  });

  it('backs up the current file before restoring a backup', async () => {
    const {document} = makeDocument();
    const path = join(dir, 'Club.lever');
    await document.saveAs(path);
    const older = join(dir, 'older.lever');
    await writeFile(older, serializeProject(createProject('Older')));

    expect(await document.restoreBackup(older)).toEqual({ok: true});
    expect(document.get().project.name).toBe('Older');
    const backups = await readdir(backupDir(path));
    expect(backups.some((name) => name.includes('before-restore'))).toBe(true);
  });

  it('autosaves untitled projects to the recovery folder', async () => {
    const {document} = makeDocument('xyz');
    await document.newProject(createProject('New'));
    await document.flush();
    expect(await readdir(join(dir, 'recovery'))).toEqual([
      'untitled-xyz.lever',
    ]);
  });
});
