// Loading project files: format check, migration of older schema versions,
// validation (PRJ-5). The original file is backed up by the caller before a
// migrated project is saved over it.
import {FrameTransform, transformBounds} from './arrangement';
import {
  newId,
  PROJECT_FORMAT,
  PROJECT_SCHEMA_VERSION,
  Project,
  projectSchema,
  StationView,
  stationViewSchema,
} from './project';

// A migration turns a version-N object into a version-N+1 object. Plain
// objects in, plain objects out; validation happens after the last step.
export type Migration = (
  data: Record<string, unknown>,
) => Record<string, unknown>;

// Key = the version migrated FROM. Add one entry per schema change, with a
// test using a real file of the old version.
export const MIGRATIONS: Record<number, Migration> = {
  1: (data) => ({...data, arrangements: migrateArrangementsV1(data)}),
};

type ArrangementV1 = {
  id: string;
  name: string;
  panels?: (FrameTransform & {viewId: string})[];
  showConnectorLines?: boolean;
};

// v1 → v2: a full-layout arrangement placed every station
// with a scale, and could draw lines between linked exits. Now a view holds
// frames and drawn lines: each panel becomes a frame around exactly what it
// showed (so it looks the same), and each automatic line becomes a drawn
// one between the two exits.
const migrateArrangementsV1 = (data: Record<string, unknown>): unknown => {
  const arrangements = data['arrangements'];
  if (!Array.isArray(arrangements)) {
    return arrangements;
  }
  const views = new Map<string, StationView>();
  for (const raw of Array.isArray(data['views']) ? data['views'] : []) {
    const parsed = stationViewSchema.safeParse(raw);
    if (parsed.success) {
      views.set(parsed.data.id, parsed.data);
    }
  }
  return (arrangements as ArrangementV1[]).map((old) => {
    const frameOfView = new Map<string, string>();
    const frames = (old.panels ?? []).flatMap((panel) => {
      const view = views.get(panel.viewId);
      if (!view || frameOfView.has(panel.viewId)) {
        return [];
      }
      const id = newId('frame');
      frameOfView.set(panel.viewId, id);
      const rect = transformBounds(
        {...panel, rotation: panel.rotation ?? 0},
        view,
      );
      return [
        {id, viewId: panel.viewId, rotation: panel.rotation ?? 0, ...rect},
      ];
    });
    const lines: unknown[] = [];
    if (old.showConnectorLines !== false) {
      const drawn = new Set<string>();
      for (const view of views.values()) {
        for (const element of view.elements) {
          const partner =
            element.kind === 'connector' ? element.pairedWith : undefined;
          const from = frameOfView.get(view.id);
          const to = partner && frameOfView.get(partner.viewId);
          if (!partner || !from || !to || drawn.has(element.id)) {
            continue;
          }
          drawn.add(partner.connectorId);
          lines.push({
            id: newId('line'),
            points: [
              {frameId: from, connectorId: element.id},
              {frameId: to, connectorId: partner.connectorId},
            ],
          });
        }
      }
    }
    return {id: old.id, name: old.name, frames, lines};
  });
};

export type LoadResult =
  | {ok: true; project: Project; migratedFrom?: number}
  | {ok: false; error: LoadError};

export type LoadError =
  | {code: 'notJson'}
  | {code: 'notAProject'}
  | {code: 'newerVersion'; version: number}
  | {code: 'missingMigration'; version: number}
  | {code: 'invalid'; details: string};

export const loadProject = (
  text: string,
  migrations: Record<number, Migration> = MIGRATIONS,
  currentVersion: number = PROJECT_SCHEMA_VERSION,
): LoadResult => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {ok: false, error: {code: 'notJson'}};
  }
  if (
    typeof data !== 'object' ||
    data === null ||
    (data as {format?: unknown}).format !== PROJECT_FORMAT
  ) {
    return {ok: false, error: {code: 'notAProject'}};
  }
  let current = data as Record<string, unknown>;
  const version = Number(current['schemaVersion']);
  if (!Number.isInteger(version) || version < 1) {
    return {ok: false, error: {code: 'notAProject'}};
  }
  if (version > currentVersion) {
    return {ok: false, error: {code: 'newerVersion', version}};
  }
  for (let from = version; from < currentVersion; from++) {
    const migrate = migrations[from];
    if (!migrate) {
      return {ok: false, error: {code: 'missingMigration', version: from}};
    }
    current = {...migrate(current), schemaVersion: from + 1};
  }
  const parsed = projectSchema.safeParse(current);
  if (!parsed.success) {
    return {
      ok: false,
      error: {code: 'invalid', details: parsed.error.message.slice(0, 2000)},
    };
  }
  return version < currentVersion
    ? {ok: true, project: parsed.data, migratedFrom: version}
    : {ok: true, project: parsed.data};
};

// Pretty-printed with a trailing newline: readable and diffable (STK-3).
export const serializeProject = (project: Project): string =>
  `${JSON.stringify(project, null, 2)}\n`;
