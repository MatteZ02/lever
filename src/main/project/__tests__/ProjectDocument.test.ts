import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {serializeProject} from '../../../model/migrations';
import {createProject} from '../../../model/project';
import {ProjectState} from '../../../shared/projectApi';
import {backupDir} from '../backups';
import {
  AUTOSAVE_DELAY_MS,
  ProjectDocument,
  unsavedRisk,
} from '../ProjectDocument';

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
    const path = join(dir, 'Layout.lever');
    await document.saveAs(path);
    const project = {...document.get().project, name: 'Renamed'};
    document.update(project);
    expect(document.get().unsaved).toBe(true);

    await wait(AUTOSAVE_DELAY_MS + 200);
    expect(JSON.parse(await readFile(path, 'utf8')).name).toBe('Renamed');
    expect(document.get().unsaved).toBe(false);
  });

  it('opens a file read-only while another instance has it (MULTI-5)', async () => {
    const path = join(dir, 'Layout.lever');
    await writeFile(path, serializeProject(createProject('Layout')));
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
    const path = join(dir, 'Layout.lever');
    await document.saveAs(path);
    await document.exportCopy(join(dir, 'Copy.lever'));
    expect(document.get().path).toBe(path);
    expect(await readdir(dir)).toContain('Copy.lever');
  });

  it('backs up the current file before restoring a backup', async () => {
    const {document} = makeDocument();
    const path = join(dir, 'Layout.lever');
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

describe('what closing the layout would lose (unsavedRisk)', () => {
  const withTrack = () => {
    const project = createProject('Layout');
    project.views[0].elements.push({
      kind: 'track',
      id: 'track-1',
      name: '',
      points: [
        {x: 0, y: 0},
        {x: 2, y: 0},
      ],
    });
    return project;
  };
  const state = (changes: Partial<ProjectState>): ProjectState => ({
    revision: 1,
    path: null,
    project: createProject('Layout'),
    readOnly: false,
    unsaved: false,
    origin: 'file',
    ...changes,
  });

  it('given an empty new layout, nothing is lost', () => {
    expect(unsavedRisk(state({unsaved: true}))).toBe('none');
  });

  it('given a new or imported layout with content, it must be asked about', () => {
    expect(unsavedRisk(state({project: withTrack(), unsaved: true}))).toBe(
      'untitled',
    );
  });

  it('given a saved file, nothing is lost', () => {
    expect(unsavedRisk(state({path: 'C:/layout.lever', unsaved: false}))).toBe(
      'none',
    );
  });

  it('given a file whose last save failed, it must be asked about', () => {
    expect(unsavedRisk(state({path: 'C:/layout.lever', unsaved: true}))).toBe(
      'saveFailed',
    );
  });

  it('given a read-only copy, nothing can be lost', () => {
    expect(
      unsavedRisk(
        state({path: 'C:/layout.lever', readOnly: true, unsaved: true}),
      ),
    ).toBe('none');
  });

  it('given an edit to a file, after flush nothing is lost', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lever-risk-'));
    try {
      const path = join(dir, 'layout.lever');
      await writeFile(path, serializeProject(createProject('Layout')));
      const document = new ProjectDocument({
        instanceId: 'risk',
        recoveryDir: join(dir, 'recovery'),
        initial: createProject('Untitled'),
        onChange: () => undefined,
      });
      await document.open(path);
      document.update(withTrack());
      expect(unsavedRisk(document.get())).toBe('saveFailed');
      await document.flush();
      expect(unsavedRisk(document.get())).toBe('none');
      await document.close();
    } finally {
      await rm(dir, {recursive: true, force: true});
    }
  });
});
