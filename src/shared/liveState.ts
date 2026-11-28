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
  // setting: turnouts moving; set: in place, signals set; failed: a turnout
  // did not move; unconfirmed: was set, but its turnouts cannot be confirmed
  // right now (connection interrupted or lost; waits for the reports). A
  // turnout that moves after the route was set releases the route.
  state: z.enum(['setting', 'set', 'failed', 'unconfirmed']),
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
  // Manual turnouts the route recorded in a new position: to throw by hand.
  manualToSet: z.array(z.string()),
  areas: z.array(
    z.object({
      areaId: z.string(),
      name: z.string(),
      level: automationLevelSchema,
    }),
  ),
  failedTurnoutId: z.string().optional(),
});
export type RouteLive = z.infer<typeof routeLiveSchema>;

// A train (trains.ts): a train number on blocks, following its train;
// Levels 3 and 4 add a loco, protection and automatic driving.
export const trainLiveSchema = z.object({
  id: z.string(),
  name: z.string(),
  locoId: z.string().optional(),
  // Front first.
  blockIds: z.array(z.string()),
  // Lever knows which way it runs (it has moved block to block).
  directionKnown: z.boolean(),
  // Which DCC direction of its loco runs it that way (Level 4 needs it).
  aheadIsForward: z.boolean().optional(),
  // Its loco's speed (km/h) and DCC direction, as driven or reported.
  speedKmh: z.number().optional(),
  forward: z.boolean().optional(),
  // Level 3: held (braked to 0) and why (protection.ts HoldReason).
  hold: z.string().optional(),
  // Level 4: driven automatically (automatic.ts).
  auto: z
    .object({
      state: z.string(),
      reason: z.string().optional(),
      destinationBlockId: z.string().optional(),
      scheduleId: z.string().optional(),
      stopIndex: z.number().int(),
    })
    .optional(),
  // Lever drives its loco now (a hold or an automatic run).
  controlled: z.boolean(),
});
export type TrainLive = z.infer<typeof trainLiveSchema>;

export const layoutLiveSchema = z.object({
  turnouts: z.record(z.string(), turnoutLiveSchema),
  signals: z.record(z.string(), signalLiveSchema),
  accessories: z.record(z.string(), accessoryLiveSchema),
  blocks: z.record(z.string(), blockLiveSchema),
  // Always sent complete (routes come and go).
  routes: z.record(z.string(), routeLiveSchema),
  // Always sent complete, like routes.
  trains: z.record(z.string(), trainLiveSchema),
  // Level 4: automatic trains stand (Pause automation, STOP, power off).
  automationPaused: z.boolean(),
});
export type LayoutLive = z.infer<typeof layoutLiveSchema>;

export const emptyLayoutLive = (): LayoutLive => ({
  turnouts: {},
  signals: {},
  accessories: {},
  blocks: {},
  routes: {},
  trains: {},
  automationPaused: false,
});

// Changes only; the same shape, every part optional.
export const layoutLiveChangesSchema = layoutLiveSchema.partial();
export type LayoutLiveChanges = z.infer<typeof layoutLiveChangesSchema>;
