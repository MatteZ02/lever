// Diagram elements of a station view (EDT-2), as stored in project files.
// Topology (connections, routing) is derived from these by topology.ts; it
// never depends on drawing positions beyond grid points.
//
// To add an element type: add a schema variant here, a port table in
// ports.ts if it carries track, a drawing in the renderer's diagram
// components, and properties in the editor.
import {z} from 'zod';
import {feedbackInputRefSchema} from '../shared/feedback';
import {directionSchema, gridPointSchema} from './geometry';

export const idSchema = z.string().min(1).max(64);

// Turnout and accessory addresses are stored as the Roco app displays them
// (turnout #1 = FAdr 0); see accessoryCommands.ts and LOAD-5.
export const accessoryAddressSchema = z.number().int().min(1).max(2048);
// Extended accessory addresses as user interfaces display them (1 = raw 4).
export const extAccessoryAddressSchema = z.number().int().min(1).max(2044);

export const pulseMsSchema = z.number().int().min(20).max(5000);

const output = z.union([z.literal(1), z.literal(2)]);

// One output of one of the element's addresses: address index into the
// element's `addresses`, and output 1 or 2.
export const outputRefSchema = z.object({
  address: z.number().int().min(0).max(3),
  output,
});
export type OutputRef = z.infer<typeof outputRefSchema>;

// How an accessory is driven.
// - manual: not connected; drawn and routed, never commanded (ACC-5).
// - dcc: basic accessory commands (LAN_X_SET_TURNOUT) on `addresses`.
//   `outputMap` overrides the default mapping of positions/aspects to
//   outputs; `invert` swaps output 1 and 2 everywhere.
// - extended: one extended accessory address (FW 1.40+), value per aspect.
export const accessoryControlSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('manual')}),
  z.object({
    kind: z.literal('dcc'),
    addresses: z.array(accessoryAddressSchema).max(4),
    invert: z.boolean().default(false),
    pulseMs: pulseMsSchema.optional(),
    outputMap: z.record(z.string(), z.array(outputRefSchema)).optional(),
  }),
  z.object({
    kind: z.literal('extended'),
    address: extAccessoryAddressSchema,
    valueMap: z.record(z.string(), z.number().int().min(0).max(255)).optional(),
  }),
]);
export type AccessoryControl = z.infer<typeof accessoryControlSchema>;

const base = {
  id: idSchema,
  name: z.string().max(100).default(''),
  // Automation area (MIX-1). Unset: the view's default area.
  areaId: idSchema.optional(),
};

export const trackSchema = z.object({
  ...base,
  kind: z.literal('track'),
  // Corners only; every step horizontal, vertical or 45°.
  points: z.array(gridPointSchema).min(2),
  blockId: idSchema.optional(),
});

export const TURNOUT_TYPES = [
  'left',
  'right',
  'wye',
  'threeWay',
  'crossing',
  'singleSlip',
  'doubleSlip',
] as const;
export const turnoutTypeSchema = z.enum(TURNOUT_TYPES);
export type TurnoutType = z.infer<typeof turnoutTypeSchema>;

export const turnoutSchema = z.object({
  ...base,
  kind: z.literal('turnout'),
  type: turnoutTypeSchema,
  at: gridPointSchema,
  // From the tip towards the frog (for crossings and slips: the direction of
  // the first line, a1 → a2).
  orientation: directionSchema,
  control: accessoryControlSchema.default({kind: 'manual'}),
  // Optional position feedback per position (ACC-3).
  positionFeedback: z.record(z.string(), feedbackInputRefSchema).optional(),
});

export const signalSchema = z.object({
  ...base,
  kind: z.literal('signal'),
  at: gridPointSchema,
  // The direction of travel the signal applies to (SIG-2): always set.
  facing: directionSchema,
  side: z.enum(['left', 'right']).default('right'),
  signalTypeId: idSchema,
  control: accessoryControlSchema.default({kind: 'manual'}),
  // For distant signals: the main signal whose aspect it repeats (RTE-5).
  distantFor: idSchema.optional(),
});

export const bufferStopSchema = z.object({
  ...base,
  kind: z.literal('bufferStop'),
  at: gridPointSchema,
  // The direction from the stop into the track.
  direction: directionSchema,
});

export const virtualPointSchema = z.object({
  ...base,
  kind: z.literal('virtualPoint'),
  at: gridPointSchema,
});

// Where the drawn layout ends: an exit paired with an entry in another view,
// or unpaired where the unmapped line begins (FULL-3).
export const stationConnectorSchema = z.object({
  ...base,
  kind: z.literal('connector'),
  at: gridPointSchema,
  // The direction out of the view.
  direction: directionSchema,
  pairedWith: z.object({viewId: idSchema, connectorId: idSchema}).optional(),
});

// Generic accessory: uncoupler track, light, … (ACC-1). Momentary sends a
// pulse on output 2 (or 1 if inverted); toggle switches between outputs.
export const genericAccessorySchema = z.object({
  ...base,
  kind: z.literal('accessory'),
  at: gridPointSchema,
  role: z.enum(['uncoupler', 'light', 'other']).default('uncoupler'),
  buttonType: z.enum(['momentary', 'toggle']).default('momentary'),
  control: accessoryControlSchema.default({kind: 'manual'}),
});

export const labelSchema = z.object({
  ...base,
  kind: z.literal('label'),
  at: gridPointSchema,
  text: z.string().max(200),
  size: z.enum(['small', 'normal', 'large']).default('normal'),
});

// Decorative rectangle, e.g. a platform (EDT-2).
export const platformSchema = z.object({
  ...base,
  kind: z.literal('platform'),
  at: gridPointSchema,
  width: z.number().int().min(1).max(500),
  height: z.number().int().min(1).max(100),
});

export const diagramElementSchema = z.discriminatedUnion('kind', [
  trackSchema,
  turnoutSchema,
  signalSchema,
  bufferStopSchema,
  virtualPointSchema,
  stationConnectorSchema,
  genericAccessorySchema,
  labelSchema,
  platformSchema,
]);

export type DiagramElement = z.infer<typeof diagramElementSchema>;
export type ElementKind = DiagramElement['kind'];
export type Track = z.infer<typeof trackSchema>;
export type Turnout = z.infer<typeof turnoutSchema>;
export type Signal = z.infer<typeof signalSchema>;
export type BufferStop = z.infer<typeof bufferStopSchema>;
export type VirtualPoint = z.infer<typeof virtualPointSchema>;
export type StationConnector = z.infer<typeof stationConnectorSchema>;
export type GenericAccessory = z.infer<typeof genericAccessorySchema>;
export type Label = z.infer<typeof labelSchema>;
export type Platform = z.infer<typeof platformSchema>;

export type ElementOf<K extends ElementKind> = Extract<
  DiagramElement,
  {kind: K}
>;

// Elements that can be switched by DCC commands.
export type ControlledElement = Turnout | Signal | GenericAccessory;
export const isControlled = (
  element: DiagramElement,
): element is ControlledElement =>
  element.kind === 'turnout' ||
  element.kind === 'signal' ||
  element.kind === 'accessory';
