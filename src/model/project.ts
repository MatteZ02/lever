// Layout project file (PRJ-1): versioned JSON, extension `.lever`. Validated
// with Zod on every load; older versions are migrated (migrations.ts).
import {z} from 'zod';
import {feedbackInputRefSchema} from '../shared/feedback';
import {centralUnitProfileSchema} from './centralUnitProfile';
import {diagramElementSchema, idSchema} from './elements';
import {locoSchema, scheduleSchema} from './locos';
import {signalTypeSchema} from './signalTypes';

export const PROJECT_FORMAT = 'lever-project';
export const PROJECT_SCHEMA_VERSION = 2;
export const PROJECT_FILE_EXTENSION = 'lever';

export const automationLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type AutomationLevel = z.infer<typeof automationLevelSchema>;

// A set of elements with one automation level (MIX-1). Every station view
// has a default area; elements may name another one.
export const automationAreaSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(100),
  level: automationLevelSchema,
});
export type AutomationArea = z.infer<typeof automationAreaSchema>;

// A track section with zero or more feedback inputs (BLK-1). Tracks refer to
// blocks with `blockId`.
export const blockSchema = z.object({
  id: idSchema,
  name: z.string().max(100).default(''),
  inputs: z.array(feedbackInputRefSchema).default([]),
  // undefined: project default (BLK-3).
  releaseDelayMs: z.number().int().min(0).max(60000).optional(),
  // Level 3+: free blocks a train needs ahead to keep running; undefined:
  // project default. 0 lets it run into an occupied block, where it is
  // stopped.
  clearAhead: z.number().int().min(0).max(5).optional(),
});
export type Block = z.infer<typeof blockSchema>;

export const stationViewSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(100),
  // The view's default automation area (MIX-1).
  areaId: idSchema,
  elements: z.array(diagramElementSchema).default([]),
});
export type StationView = z.infer<typeof stationViewSchema>;

// Layout views (FULL-1, FULL-2, FULL-5): canvases the user
// builds by drawing station frames and connecting lines. A view starts empty;
// several can be kept, e.g. one big station for one monitor and two smaller
// ones joined in another window (src/model/arrangement.ts). Units are the
// view's own grid units.
const canvasPointSchema = z.object({x: z.number(), y: z.number()});

// A rectangle on the view showing one station, fitted inside it (scaled,
// centred, optionally turned by quarter turns), so the station's own drawing
// never moves.
export const stationFrameSchema = z.object({
  id: idSchema,
  viewId: idSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .default(0),
});
export type StationFrame = z.infer<typeof stationFrameSchema>;

// A point of a connecting line: a place on the view, or a station exit shown
// in a frame (the line then follows the frame when it moves).
export const linePointSchema = z.union([
  canvasPointSchema,
  z.object({frameId: idSchema, connectorId: idSchema}),
]);
export type LinePoint = z.infer<typeof linePointSchema>;

// A line drawn between frames (e.g. the track between two stations). It is
// a drawing only: no occupancy or routes.
export const viewLineSchema = z.object({
  id: idSchema,
  points: z.array(linePointSchema).min(2).max(200),
});
export type ViewLine = z.infer<typeof viewLineSchema>;

export const arrangementSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(100),
  frames: z.array(stationFrameSchema).default([]),
  lines: z.array(viewLineSchema).default([]),
});
export type Arrangement = z.infer<typeof arrangementSchema>;

// Route endpoints and fixed via points are element ids (RTE-1, RTE-3).
export const savedRouteSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(100),
  from: idSchema,
  to: idSchema,
  via: z.array(idSchema).default([]),
});

// Optional edit password (EDT-1): PBKDF2-SHA-256, stored with the project so
// it travels with the file. Not a security boundary; it prevents accidental
// edits.
export const passwordHashSchema = z.object({
  salt: z.string().min(1),
  hash: z.string().min(1),
  iterations: z.number().int().min(1000),
});
export type PasswordHash = z.infer<typeof passwordHashSchema>;

export const projectSettingsSchema = z.object({
  defaultLevel: automationLevelSchema.default(1),
  centralUnit: centralUnitProfileSchema.prefault({}),
  blockReleaseDelayMs: z.number().int().min(0).max(60000).default(1000),
  // Set signals along a route automatically (RTE-5).
  autoSignalsOnRoute: z.boolean().default(true),
  // Command the last known turnout positions after the first connection
  // (ACC-4). Off by default.
  restoreTurnoutsOnStartup: z.boolean().default(false),
  // Level 3+: free blocks a train needs ahead (Block.clearAhead default).
  blocksClearAhead: z.number().int().min(0).max(5).default(1),
  editPassword: passwordHashSchema.optional(),
});
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

export const projectSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  id: idSchema,
  name: z.string().min(1).max(100),
  settings: projectSettingsSchema.prefault({}),
  views: z.array(stationViewSchema).default([]),
  arrangements: z.array(arrangementSchema).default([]),
  areas: z.array(automationAreaSchema).default([]),
  blocks: z.array(blockSchema).default([]),
  signalTypes: z.array(signalTypeSchema).default([]),
  routes: z.array(savedRouteSchema).default([]),
  // Levels 3 and 4 (locos.ts).
  locos: z.array(locoSchema).default([]),
  schedules: z.array(scheduleSchema).default([]),
});

export type Project = z.infer<typeof projectSchema>;
// What a project file may contain before defaults are applied.
export type ProjectInput = z.input<typeof projectSchema>;

// Short random ids: unique enough for one project, readable in JSON diffs.
export const newId = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export const createProject = (name: string): Project => {
  const viewArea = {id: newId('area'), name, level: 1 as const};
  return projectSchema.parse({
    format: PROJECT_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: newId('project'),
    name,
    views: [{id: newId('view'), name, areaId: viewArea.id, elements: []}],
    areas: [viewArea],
  });
};

export const createView = (
  project: Project,
  name: string,
): {project: Project; viewId: string} => {
  const area = {id: newId('area'), name, level: project.settings.defaultLevel};
  const view = {id: newId('view'), name, areaId: area.id, elements: []};
  return {
    project: {
      ...project,
      views: [...project.views, view],
      areas: [...project.areas, area],
    },
    viewId: view.id,
  };
};
