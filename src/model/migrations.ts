// Loading project files: format check, migration of older schema versions,
// validation (PRJ-5). The original file is backed up by the caller before a
// migrated project is saved over it.
import {
  PROJECT_FORMAT,
  PROJECT_SCHEMA_VERSION,
  Project,
  projectSchema,
} from './project';

// A migration turns a version-N object into a version-N+1 object. Plain
// objects in, plain objects out; validation happens after the last step.
export type Migration = (
  data: Record<string, unknown>,
) => Record<string, unknown>;

// Key = the version migrated FROM. Add one entry per schema change, with a
// test using a real file of the old version.
export const MIGRATIONS: Record<number, Migration> = {};

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
