// App settings, stored separately from layout projects (STK-7) in the user
// data folder. Several instances on one PC share the file read-mostly: it is
// read at start-up and written only when the user changes a setting
// (MULTI-5).
import {z} from 'zod';

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
  // with it (decided by the user, 2026-11-17).
  shortcuts: z
    .object({
      stop: z.string().min(1).default('Escape'),
      // No default (CARRY-2).
      trackPowerOff: z.string().min(1).nullable().default(null),
    })
    .prefault({}),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  protocolLog: z.boolean().default(false),
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
    })
    .optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  protocolLog: z.boolean().optional(),
});
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
