// The engine API (ARC-1): commands in, events out, as plain JSON-safe
// messages. Renderers use it over MessagePorts; the same messages can
// later be served over the network (Throttle integration, area ownership).
//
// Every message carries the API version `v`. Receivers validate messages
// with these schemas, because they cross a process boundary (STK-11).
import {z} from 'zod';
import {ENGINE_API_VERSION} from './apiVersion';
import {feedbackInputStateSchema, feedbackSourceSchema} from './feedback';
import {layoutLiveChangesSchema, layoutLiveSchema} from './liveState';

export {ENGINE_API_VERSION};

const version = z.literal(ENGINE_API_VERSION);
const fAdrSchema = z.number().int().min(0).max(2047);

// --- Commands (renderer → engine) -------------------------------------------

export const engineCommandSchema = z.discriminatedUnion('type', [
  // Global emergency stop (LAN_X_SET_STOP). Never queued (CON-6, LOAD-2).
  z.object({v: version, type: z.literal('emergencyStop')}),
  z.object({v: version, type: z.literal('setTrackPower'), on: z.boolean()}),
  z.object({
    v: version,
    type: z.literal('setProtocolLog'),
    enabled: z.boolean(),
  }),
  // Accessories, by function address (FAdr, spec §5). Converting the
  // project's displayed address and offset to FAdr is the model's job.
  // Queued (LOAD-2).
  z.object({
    v: version,
    type: z.literal('switchAccessory'),
    fAdr: fAdrSchema,
    output: z.union([z.literal(0), z.literal(1)]),
    pulseMs: z.number().int().positive().optional(),
    queued: z.boolean().optional(),
  }),
  z.object({v: version, type: z.literal('queryAccessory'), fAdr: fAdrSchema}),
  // Extended accessory (FW 1.40+). Refused when the firmware is known to be
  // older.
  z.object({
    v: version,
    type: z.literal('setExtAccessory'),
    rawAddress: z.number().int().min(4).max(2047),
    value: z.number().int().min(0).max(255),
  }),
  // Which feedback buses to subscribe to and query (LOAD-1, BLK-1).
  z.object({
    v: version,
    type: z.literal('setFeedbackSources'),
    sources: z.array(feedbackSourceSchema),
  }),
  // Operating the layout by element (Level 1+). The engine checks the
  // element's automation level, sends through the queue and confirms.
  z.object({
    v: version,
    type: z.literal('setTurnout'),
    elementId: z.string(),
    position: z.string(),
  }),
  z.object({
    v: version,
    type: z.literal('setSignal'),
    elementId: z.string(),
    aspectId: z.string(),
  }),
  z.object({
    v: version,
    type: z.literal('pressAccessory'),
    elementId: z.string(),
    on: z.boolean(),
  }),
  // The station view this window shows (null: none). The engine refreshes
  // the positions of what is on screen (positionRefreshMs).
  z.object({
    v: version,
    type: z.literal('showViews'),
    // Every station on screen in this window (several in the full view).
    viewIds: z.array(z.string()).max(500),
  }),
  // Train number label on a block with feedback (BLK-4); null clears it.
  z.object({
    v: version,
    type: z.literal('setTrainLabel'),
    blockId: z.string(),
    label: z.string().max(40).nullable(),
  }),
  // Routes (Level 2, RTE-1 – RTE-8). The engine finds the route itself
  // from the points; `key` picks one of several equally good routes (the
  // one the operator chose in the preview).
  z.object({
    v: version,
    type: z.literal('setRoute'),
    from: z.string(),
    to: z.string(),
    via: z.array(z.string()).max(20).default([]),
    key: z.string().max(10000).optional(),
    // The operator confirmed crossing another route in a crossing or slip.
    allowCrossing: z.boolean().default(false),
  }),
  z.object({v: version, type: z.literal('cancelRoute'), routeId: z.string()}),
  z.object({v: version, type: z.literal('releaseRoute'), routeId: z.string()}),
  z.object({v: version, type: z.literal('undoRoute')}),
]);
export type EngineCommand = z.infer<typeof engineCommandSchema>;

// Distributes Omit over a union, so each command keeps its own fields.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
// A command as callers write it; the version is added when sending.
export type EngineCommandInput = DistributiveOmit<EngineCommand, 'v'>;

// --- State and events (engine → renderer) ------------------------------------

export const connectionStateSchema = z.enum([
  'disconnected',
  'connecting',
  'connected',
  'reconnecting',
]);
export type ConnectionStateValue = z.infer<typeof connectionStateSchema>;

export const trackStatusSchema = z.enum([
  'unknown',
  'normal',
  'emergencyStop',
  'powerOff',
  'shortCircuit',
  'programming',
]);
export type TrackStatusValue = z.infer<typeof trackStatusSchema>;

export const deviceInfoSchema = z.object({
  hardwareType: z.number().optional(),
  firmwareVersion: z.string().optional(),
  serialNumber: z.number().optional(),
  lockCode: z.number().optional(),
});
export type DeviceInfoValue = z.infer<typeof deviceInfoSchema>;

export const protocolLogEntrySchema = z.object({
  time: z.number(),
  direction: z.enum(['out', 'in', 'info']),
  text: z.string(),
});
export type ProtocolLogEntryValue = z.infer<typeof protocolLogEntrySchema>;

export const accessoryStateSchema = z.object({
  fAdr: z.number().int(),
  reported: z.enum(['unknown', 'notSwitched', 'output1', 'output2', 'invalid']),
  commanded: z.union([z.literal(0), z.literal(1), z.null()]),
  updatedAt: z.number(),
});
export type AccessoryStateValue = z.infer<typeof accessoryStateSchema>;

export const extAccessoryStateSchema = z.object({
  rawAddress: z.number().int(),
  value: z.number().int().optional(),
  updatedAt: z.number(),
});
export type ExtAccessoryStateValue = z.infer<typeof extAccessoryStateSchema>;

// Things the operator should know that are not errors in Lever, e.g. a
// command the central unit cannot do. The renderer words them (strings.ts).
export const engineNoticeSchema = z.object({
  code: z.enum([
    'extAccessoryUnsupported',
    // An element command refused by its area's level.
    'refused',
    // Element not fully configured (e.g. no address).
    'incomplete',
    // No matching report after a retry.
    'failed',
    'labelNeedsFeedback',
    // Routes (Level 2).
    'routeRefused',
    'routeSet',
    'routeFailed',
    'routeBroken',
    // Released: asking the central unit showed a turnout of it moved.
    'routeReleasedMoved',
    // Cancelled because a new route conflicts with it.
    'routeCancelled',
    'routeUndone',
  ]),
  time: z.number(),
  elementId: z.string().optional(),
  blockId: z.string().optional(),
  reason: z.string().optional(),
  routeId: z.string().optional(),
  // routeCancelled: the cancelled route's end (`elementId`: its start).
  toElementId: z.string().optional(),
  // routeUndone: turnouts left alone (moved since), and manual turnouts to
  // put back by hand.
  skipped: z.array(z.string()).optional(),
  manualBack: z.array(z.string()).optional(),
  // routeSet: manual turnouts to throw by hand, with their positions.
  manualThrow: z
    .array(z.object({turnoutId: z.string(), position: z.string()}))
    .optional(),
});
export type EngineNotice = z.infer<typeof engineNoticeSchema>;

export const engineSnapshotSchema = z.object({
  connection: z.object({
    state: connectionStateSchema,
    host: z.string(),
    port: z.number(),
  }),
  trackStatus: trackStatusSchema,
  deviceInfo: deviceInfoSchema,
  protocolLog: z.boolean(),
  accessories: z.array(accessoryStateSchema),
  extAccessories: z.array(extAccessoryStateSchema),
  feedbackSources: z.array(feedbackSourceSchema),
  feedbackInputs: z.array(feedbackInputStateSchema),
  // Accessory commands waiting in the queue.
  accessoryQueueLength: z.number().int(),
  // Live state of the loaded layout's elements and blocks.
  layout: layoutLiveSchema,
});
export type EngineSnapshot = z.infer<typeof engineSnapshotSchema>;

export const engineEventSchema = z.discriminatedUnion('type', [
  // Full state; sent when a port is attached, so a new window starts in sync.
  z.object({
    v: version,
    type: z.literal('snapshot'),
    snapshot: engineSnapshotSchema,
  }),
  z.object({
    v: version,
    type: z.literal('connection'),
    state: connectionStateSchema,
    host: z.string(),
    port: z.number(),
  }),
  z.object({
    v: version,
    type: z.literal('trackStatus'),
    status: trackStatusSchema,
  }),
  z.object({
    v: version,
    type: z.literal('deviceInfo'),
    deviceInfo: deviceInfoSchema,
  }),
  z.object({
    v: version,
    type: z.literal('log'),
    entry: protocolLogEntrySchema,
  }),
  z.object({
    v: version,
    type: z.literal('accessory'),
    state: accessoryStateSchema,
  }),
  z.object({
    v: version,
    type: z.literal('extAccessory'),
    state: extAccessoryStateSchema,
  }),
  // Only inputs that changed.
  z.object({
    v: version,
    type: z.literal('feedback'),
    changes: z.array(feedbackInputStateSchema),
  }),
  z.object({
    v: version,
    type: z.literal('accessoryQueue'),
    length: z.number().int(),
  }),
  z.object({v: version, type: z.literal('notice'), notice: engineNoticeSchema}),
  // Changed elements and blocks only.
  z.object({
    v: version,
    type: z.literal('layout'),
    changes: layoutLiveChangesSchema,
  }),
]);
export type EngineEvent = z.infer<typeof engineEventSchema>;
export type EngineEventInput = DistributiveOmit<EngineEvent, 'v'>;

// --- Control messages (main process → engine, over parentPort) ---------------

export const engineControlSchema = z.discriminatedUnion('type', [
  // A renderer's MessagePort is attached with this message (in `ports`).
  z.object({type: z.literal('attachPort')}),
  z.object({
    type: z.literal('connect'),
    host: z.string(),
    port: z.number().int().min(1).max(65535),
  }),
  // Applied before connecting, so the log includes the connect sequence.
  z.object({type: z.literal('setProtocolLog'), enabled: z.boolean()}),
  // The open project (validated by the engine). Its central-unit profile
  // sets the accessory gap and feedback sources (LOAD-1, LOAD-2).
  z.object({type: z.literal('loadLayout'), project: z.unknown()}),
  // ACC-4: command these turnout positions (element id → position) once,
  // after the next connection (or now, if connected). Sent by main once per
  // opened project, when the project setting is on.
  z.object({
    type: z.literal('restoreTurnouts'),
    projectId: z.string(),
    positions: z.record(z.string(), z.string()),
  }),
  // Log off cleanly and exit.
  z.object({type: z.literal('shutdown')}),
]);
export type EngineControl = z.infer<typeof engineControlSchema>;

// --- Reports (engine → main process, over parentPort) ------------------------

export const engineReportSchema = z.discriminatedUnion('type', [
  // Turnout positions the central unit confirmed (seen switching), for the
  // last-known positions of ACC-4. Only changed turnouts are listed.
  z.object({
    type: z.literal('turnoutPositions'),
    projectId: z.string(),
    positions: z.record(z.string(), z.string()),
  }),
]);
export type EngineReport = z.infer<typeof engineReportSchema>;
