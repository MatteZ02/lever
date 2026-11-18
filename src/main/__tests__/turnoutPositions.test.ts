import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {TurnoutPositionStore} from '../turnoutPositions';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lever-positions-'));
});

afterEach(async () => {
  await rm(dir, {recursive: true, force: true});
});

describe('last known turnout positions (ACC-4)', () => {
  it('merges reports per project and reads them back after a restart', async () => {
    const path = join(dir, 'turnout-positions.json');
    const store = new TurnoutPositionStore(path);
    await store.load();
    store.update('p', {W1: 'straight', W2: 'diverging'});
    store.update('p', {W1: 'diverging'});
    store.update('q', {X: 'left'});
    await store.flush();

    const reopened = new TurnoutPositionStore(path);
    await reopened.load();
    expect(reopened.get('p')).toEqual({W1: 'diverging', W2: 'diverging'});
    expect(reopened.get('q')).toEqual({X: 'left'});
    expect(reopened.get('unknown')).toEqual({});
  });

  it('ignores a broken file instead of failing', async () => {
    const path = join(dir, 'turnout-positions.json');
    await writeFile(path, '{not json', 'utf8');
    const store = new TurnoutPositionStore(path);
    await store.load();
    expect(store.get('p')).toEqual({});
  });

  it('does not write when nothing changed', async () => {
    const path = join(dir, 'turnout-positions.json');
    const store = new TurnoutPositionStore(path);
    await store.flush();
    await expect(readFile(path, 'utf8')).rejects.toThrow();
  });
});
