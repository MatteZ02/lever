// The engine API (ARC-1): commands in, events out, as plain JSON-safe
// messages. Renderers use it over MessagePorts today; the same messages can
// later be served over the network (Throttle integration, area ownership).
//
// Every message carries the API version `v`. Receivers validate messages
// with these schemas, because they cross a process boundary (STK-11).
import {z} from 'zod';
import {ENGINE_API_VERSION} from './apiVersion';

export {ENGINE_API_VERSION};

const version = z.literal(ENGINE_API_VERSION);

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

export const engineSnapshotSchema = z.object({
  connection: z.object({
    state: connectionStateSchema,
    host: z.string(),
    port: z.number(),
  }),
  trackStatus: trackStatusSchema,
  deviceInfo: deviceInfoSchema,
  protocolLog: z.boolean(),
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
  // Log off cleanly and exit.
  z.object({type: z.literal('shutdown')}),
]);
export type EngineControl = z.infer<typeof engineControlSchema>;
