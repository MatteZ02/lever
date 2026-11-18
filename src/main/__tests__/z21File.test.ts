// Reading a .z21 file: a ZIP (stored or deflated) holding Loco.sqlite with
// the control station tables, as the Z21 app writes it.
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {crc32, deflateRawSync} from 'node:zlib';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {readZ21File} from '../z21File';
import {readZipEntry, zipEntries} from '../zipReader';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lever-z21-test-'));
});

afterEach(async () => {
  await rm(dir, {recursive: true, force: true});
});

// A minimal ZIP writer for the test (the reader is what is tested).
const zip = (files: {name: string; data: Buffer; deflate: boolean}[]) => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const body = file.deflate ? deflateRawSync(file.data) : file.data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(file.deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc32(file.data), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(file.deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc32(file.data), 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
};

const makeDatabase = async (): Promise<Buffer> => {
  const path = join(dir, 'source.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE layout_data (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO layout_data VALUES (1, 'My Layout');
    CREATE TABLE control_station_pages (id INTEGER PRIMARY KEY, position INTEGER, name TEXT, thumb TEXT);
    INSERT INTO control_station_pages VALUES (5, 0, 'olten', NULL);
    CREATE TABLE control_station_controls (id INTEGER PRIMARY KEY, page_id INTEGER, x INTEGER, y INTEGER, angle REAL, type INTEGER, address1 INTEGER, address2 INTEGER, address3 INTEGER, button_type INTEGER DEFAULT 0, time REAL DEFAULT 0);
    INSERT INTO control_station_controls VALUES (1, 5, 10, 4, 90.0, 0, 0, 0, 0, 0, 0);
    INSERT INTO control_station_controls VALUES (2, 5, 11, 4, 90.0, 1, 13, 0, 0, 0, 0);
    CREATE TABLE control_station_control_states (id INTEGER PRIMARY KEY, control_id INTEGER, state INTEGER, address1_value INTEGER, address2_value INTEGER, address3_value INTEGER);
    INSERT INTO control_station_control_states VALUES (1, 2, 0, 1, -1, -1);
    INSERT INTO control_station_control_states VALUES (2, 2, 1, 0, -1, -1);
    CREATE TABLE control_station_notes (id INTEGER PRIMARY KEY, page_id INTEGER, x INTEGER, y INTEGER, text TEXT, font_size INTEGER, angle INTEGER DEFAULT 0, type INTEGER DEFAULT 1);
    INSERT INTO control_station_notes VALUES (1, 5, 3, 3, 'Nebenbahn', 30, 0, 1);
  `);
  db.close();
  return readFile(path);
};

describe('Z21 file', () => {
  it('reads stored and deflated ZIP entries', () => {
    const data = Buffer.from('hello hello hello hello');
    const archive = zip([
      {name: 'a.txt', data, deflate: false},
      {name: 'dir/b.txt', data, deflate: true},
    ]);
    const entries = zipEntries(archive);
    expect(entries.map((e) => e.name)).toEqual(['a.txt', 'dir/b.txt']);
    for (const entry of entries) {
      expect(readZipEntry(archive, entry).toString()).toBe(data.toString());
    }
  });

  it('reads the control station rows from the export', async () => {
    const path = join(dir, 'layout.z21');
    await writeFile(
      path,
      zip([
        {name: 'export/ABC/1.png', data: Buffer.from('png'), deflate: false},
        {
          name: 'export/ABC/Loco.sqlite',
          data: await makeDatabase(),
          deflate: true,
        },
      ]),
    );
    const data = await readZ21File(path);
    expect(data.layoutName).toBe('My Layout');
    expect(data.pages).toEqual([{id: 5, position: 0, name: 'olten'}]);
    expect(data.controls[1]).toEqual({
      id: 2,
      pageId: 5,
      x: 11,
      y: 4,
      angle: 90,
      type: 1,
      address1: 13,
      address2: 0,
      address3: 0,
    });
    expect(data.states).toContainEqual({
      controlId: 2,
      state: 0,
      address1Value: 1,
    });
    expect(data.notes[0]).toMatchObject({text: 'Nebenbahn', type: 1});
    // An old export without route tables still reads.
    expect(data.routes).toEqual([]);
  });

  it('says so when the file is not a Z21 export', async () => {
    const path = join(dir, 'other.z21');
    await writeFile(
      path,
      zip([{name: 'x.txt', data: Buffer.from('x'), deflate: false}]),
    );
    await expect(readZ21File(path)).rejects.toThrow(/Loco\.sqlite/);
    await writeFile(path, 'not a zip');
    await expect(readZ21File(path)).rejects.toThrow(/ZIP/);
  });
});
