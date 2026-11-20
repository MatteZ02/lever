// App settings, stored separately from layout projects (STK-7) in the user
// data folder. Several instances on one PC share the file read-mostly: it is
// read at start-up and written only when the user changes a setting
// (MULTI-5).
import {z} from 'zod';
import {LANGUAGES} from './language';
import {windowTargetTextSchema} from './windowTarget';

export const SETTINGS_VERSION = 1;

export const DEFAULT_CENTRAL_UNIT_HOST = '192.168.0.111';
export const DEFAULT_CENTRAL_UNIT_PORT = 21105;

export const settingsSchema = z.object({
  version: z.literal(SETTINGS_VERSION).default(SETTINGS_VERSION),
  centralUnit: z
    .object({
      host: z.string().min(1).default(DEFAULT_CENTRAL_UNIT_HOST),
      port: z
        .number()
        .int()
        .min(1)
        .max(65535)
        .default(DEFAULT_CENTRAL_UNIT_PORT),
    })
    .prefault({}),
  // KeyboardEvent.key values. STOP works in every view except while typing
  // in a text field (CARRY-2). Esc always means STOP; dialogs do not close
  // with it.
  shortcuts: z
    .object({
      stop: z.string().min(1).default('Escape'),
      // No default (CARRY-2).
      trackPowerOff: z.string().min(1).nullable().default(null),
      // Undo the last route (RTE-6b). Never Ctrl+Z alone in operating
      // mode; no default.
      undoRoute: z.string().min(1).nullable().default(null),
    })
    .prefault({}),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  // Language of the user interface (strings.ts, strings.fi.ts).
  language: z.enum(LANGUAGES).default('en'),
  protocolLog: z.boolean().default(false),
  // Developer tools in the main bar: feedback monitor, accessory test and
  // protocol log. Off: the bar shows only what operators need.
  devTools: z.boolean().default(false),
  // Reopened at start-up (PRJ-4). Set by the main process only.
  lastProjectPath: z.string().nullable().default(null),
  // The windows open when Lever last closed (VIEW-2), reopened at start-up
  // where they were, e.g. one per monitor. Set by the main process only.
  windows: z
    .array(
      z.object({
        target: windowTargetTextSchema,
        bounds: z.object({
          x: z.number().int(),
          y: z.number().int(),
          width: z.number().int().min(100),
          height: z.number().int().min(100),
        }),
        maximized: z.boolean().default(false),
        // A plain station window (see windowTarget.ts).
        plain: z.boolean().default(false),
      }),
    )
    .max(16)
    .default([]),
});

export type Settings = z.infer<typeof settingsSchema>;

export const defaultSettings = (): Settings => settingsSchema.parse({});

// Partial update sent from a renderer; validated by the main process.
export const settingsUpdateSchema = z.object({
  centralUnit: z
    .object({
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535),
    })
    .optional(),
  shortcuts: z
    .object({
      stop: z.string().min(1),
      trackPowerOff: z.string().min(1).nullable(),
      undoRoute: z.string().min(1).nullable().optional(),
    })
    .optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  language: z.enum(LANGUAGES).optional(),
  protocolLog: z.boolean().optional(),
  devTools: z.boolean().optional(),
});
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
