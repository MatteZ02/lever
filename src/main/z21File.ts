// Reads a Roco Z21 app export (.z21: a ZIP with Loco.sqlite) into the rows
// the pure importer (src/model/z21Import.ts) needs. Read-only; the export
// itself is never changed.
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Z21Export} from '../model/z21Import';
import {readZipEntry, zipEntries} from './zipReader';

type Row = Record<string, unknown>;
const num = (value: unknown) => Number(value ?? 0);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

export const readZ21Database = (path: string): Z21Export => {
  const db = new DatabaseSync(path, {readOnly: true});
  try {
    const all = (sql: string) => db.prepare(sql).all() as Row[];
    const tables = new Set(
      all("select name from sqlite_master where type = 'table'").map((row) =>
        text(row.name),
      ),
    );
    if (!tables.has('control_station_pages')) {
      throw new Error('No control station in this Z21 file');
    }
    const optional = (table: string, sql: string) =>
      tables.has(table) ? all(sql) : [];
    const layout = optional('layout_data', 'select name from layout_data');
    return {
      layoutName: text(layout[0]?.name),
      pages: all('select id, position, name from control_station_pages').map(
        (row) => ({
          id: num(row.id),
          position: num(row.position),
          name: text(row.name).trim() || `Page ${num(row.id)}`,
        }),
      ),
      controls: all(
        'select id, page_id, x, y, angle, type, address1, address2, address3 from control_station_controls',
      ).map((row) => ({
        id: num(row.id),
        pageId: num(row.page_id),
        x: num(row.x),
        y: num(row.y),
        angle: num(row.angle),
        type: num(row.type),
        address1: num(row.address1),
        address2: num(row.address2),
        address3: num(row.address3),
      })),
      states: optional(
        'control_station_control_states',
        'select control_id, state, address1_value from control_station_control_states',
      ).map((row) => ({
        controlId: num(row.control_id),
        state: num(row.state),
        address1Value: num(row.address1_value),
      })),
      notes: optional(
        'control_station_notes',
        'select page_id, x, y, text, font_size, type from control_station_notes',
      ).map((row) => ({
        pageId: num(row.page_id),
        x: num(row.x),
        y: num(row.y),
        text: text(row.text),
        fontSize: num(row.font_size),
        type: num(row.type),
      })),
      routes: optional(
        'control_station_routes',
        'select id, page_id, x, y from control_station_routes',
      ).map((row) => ({
        id: num(row.id),
        pageId: num(row.page_id),
        x: num(row.x),
        y: num(row.y),
      })),
    };
  } finally {
    db.close();
  }
};

export const readZ21File = async (path: string): Promise<Z21Export> => {
  const zip = await readFile(path);
  const entry = zipEntries(zip).find((e) =>
    /(^|\/)Loco\.sqlite$/i.test(e.name),
  );
  if (!entry) {
    throw new Error('No Loco.sqlite in this Z21 file');
  }
  // SQLite opens files, not buffers: use a private temporary folder.
  const dir = await mkdtemp(join(tmpdir(), 'lever-z21-'));
  try {
    const dbPath = join(dir, 'Loco.sqlite');
    await writeFile(dbPath, readZipEntry(zip, entry));
    return readZ21Database(dbPath);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
};
