// Live state of the layout, as the engine reports it to windows (ARC-1).
// Keyed by element id (turnouts, signals, accessories) or block id.
import {z} from 'zod';
import {gridPointSchema} from '../model/geometry';
import {automationLevelSchema} from '../model/project';
import {detectedLocoSchema} from './feedback';

// How sure the displayed position or aspect is (ACC-2, ACC-3, MULTI-3):
// - unknown: nothing reported yet;
// - reported: from the start-up query only (a central unit may report a
//   remembered or default position, e.g. the z21 start reports output 1 for
//   turnouts never switched), not seen to switch;
// - confirmed: seen switching in this session (any client), or confirmed by
//   position feedback;
// - commanded / retrying: sent by this instance, waiting for the report;
// - failed: no matching report after a retry;
// - mismatch: position feedback disagrees with the reported position;
// - inconsistent: the reported outputs fit no position/aspect (MULTI-2);
// - manual: not connected; position recorded by the operator (ACC-5).
export const liveStatusSchema = z.enum([
  'unknown',
  'reported',
  'confirmed',
  'commanded',
  'retrying',
  'failed',
  'mismatch',
  'inconsistent',
  'manual',
]);
export type LiveStatus = z.infer<typeof liveStatusSchema>;

export const turnoutLiveSchema = z.object({
  position: z.string().optional(),
  status: liveStatusSchema,
  // Position this instance commanded and still waits for.
  commanded: z.string().optional(),
  // Position shown by position-feedback inputs (ACC-3).
  feedback: z.string().optional(),
});
export type TurnoutLive = z.infer<typeof turnoutLiveSchema>;

export const signalLiveSchema = z.object({
  aspect: z.string().optional(),
  status: liveStatusSchema,
  commanded: z.string().optional(),
});
export type SignalLive = z.infer<typeof signalLiveSchema>;

export const accessoryLiveSchema = z.object({
  on: z.boolean().optional(),
  status: liveStatusSchema,
});
export type AccessoryLive = z.infer<typeof accessoryLiveSchema>;

export const blockLiveSchema = z.object({
  // Shown as occupied (immediately on occupation; after the release delay
  // when freed, BLK-3).
  occupied: z.boolean(),
  // Inputs are free, release delay running.
  releasing: z.boolean(),
  // Train number or name set by the operator (BLK-4).
  label: z.string().optional(),
  // Locos reported by detectors (BLK-5).
  locos: z.array(detectedLocoSchema),
  hasFeedback: z.boolean(),
});
export type BlockLive = z.infer<typeof blockLiveSchema>;

// A route set by this instance (Level 2, RTE-4 – RTE-8). Other instances'
// routes are not known (MULTI-6).
export const routeLiveSchema = z.object({
  id: z.string(),
  // Set order (undo goes back from the newest).
  order: z.number().int(),
  from: z.string(),
  to: z.string(),
  via: z.array(z.string()),
  // setting: turnouts moving; awaitingManual: manual turnouts to throw by
  // hand and confirm; set: in place, signals set; failed: a turnout did not
  // move; broken: a turnout moved after it was set (signals to stop).
  state: z.enum(['setting', 'awaitingManual', 'set', 'failed', 'broken']),
  segments: z.array(
    z.object({viewId: z.string(), points: z.array(gridPointSchema)}),
  ),
  // The path (topology edges), for the conflict check in the preview.
  steps: z.array(z.object({edgeId: z.string(), forward: z.boolean()})),
  turnouts: z.array(
    z.object({
      turnoutId: z.string(),
      position: z.string(),
      manual: z.boolean(),
    }),
  ),
  // Manual turnouts not yet recorded in the route's position.
  manualToSet: z.array(z.string()),
  areas: z.array(
    z.object({
      areaId: z.string(),
      name: z.string(),
      level: automationLevelSchema,
    }),
  ),
  failedTurnoutId: z.string().optional(),
  brokenTurnoutId: z.string().optional(),
});
export type RouteLive = z.infer<typeof routeLiveSchema>;

export const layoutLiveSchema = z.object({
  turnouts: z.record(z.string(), turnoutLiveSchema),
  signals: z.record(z.string(), signalLiveSchema),
  accessories: z.record(z.string(), accessoryLiveSchema),
  blocks: z.record(z.string(), blockLiveSchema),
  // Always sent complete (routes come and go).
  routes: z.record(z.string(), routeLiveSchema),
});
export type LayoutLive = z.infer<typeof layoutLiveSchema>;

export const emptyLayoutLive = (): LayoutLive => ({
  turnouts: {},
  signals: {},
  accessories: {},
  blocks: {},
  routes: {},
});

// Changes only; the same shape, every part optional.
export const layoutLiveChangesSchema = layoutLiveSchema.partial();
export type LayoutLiveChanges = z.infer<typeof layoutLiveChangesSchema>;
