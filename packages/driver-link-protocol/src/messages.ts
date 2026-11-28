// Message bodies (contract sections 5.2, 5.4, 6, 8, 9). Unknown fields are
// ignored (Zod strips them), so a minor-newer message still decodes.
//
// Values that may gain new members in a minor version follow one of two
// rules, so an older receiver never claims more than it was told:
// - with a value that claims less, an unknown member becomes that value
//   (`lenientEnum`: an unknown certainty is `unknown`, an unknown route state
//   `unconfirmed`, an unknown central-unit state `lost`);
// - codes and reasons the receiver words itself (notice and error codes,
//   hold reasons, what ends the look-ahead, automatic states) are open
//   strings. The known values are exported; a receiver shows unknown ones
//   generically.
import {z} from 'zod';
import {LINK_LIMITS} from './defaults.ts';

export const lenientEnum = <const T extends readonly [string, ...string[]]>(
  values: T,
  fallback: T[number],
) => z.enum(values).catch(fallback);

const text = (max: number) => z.string().max(max);
// Ids of Lever and Throttle objects (elements, lines, trains, devices).
export const refIdSchema = z.string().min(1).max(64);
export const nameSchema = text(100);
// DCC addresses as the central unit uses them (14-bit, long addresses).
export const dccAddressSchema = z.number().int().min(1).max(10239);
export const timeMsSchema = z.number().int().min(0);
export const seqSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const openCode = text(40).min(1);
const levelSchema = z.number().int().min(1).max(4);

export const speedStepsSchema = z.union([
  z.literal(14),
  z.literal(28),
  z.literal(128),
]);
export type SpeedSteps = z.infer<typeof speedStepsSchema>;
// The highest step in each mode (contract section 5.4).
export const MAX_STEP: Record<SpeedSteps, number> = {14: 14, 28: 28, 128: 126};

export const lineChoiceSchema = z.object({
  lineId: refIdSchema,
  directionId: refIdSchema.optional(),
});
export type LineChoice = z.infer<typeof lineChoiceSchema>;

// Known values of the open codes.
export const NOTICE_CODES = [
  'locoConflict',
  'conflictCleared',
  'automationStopped',
  'stripChangedByOperator',
  'stripEndedByOperator',
  'lineRemoved',
] as const;
export type NoticeCode = (typeof NOTICE_CODES)[number];

export const ERROR_CODES = [
  'versionMismatch',
  'notAllowed',
  'tooManyClients',
  'tooLarge',
  'rateLimited',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ENDS_BY = [
  'occupied',
  'signalAtStop',
  'endOfTrack',
  'turnoutAgainst',
  'turnoutUnknown',
  'unprotectedArea',
  'limit',
] as const;
export type EndsBy = (typeof ENDS_BY)[number];

export const HOLD_REASONS = [
  'signalAtStop',
  'occupiedAhead',
  'enteredOccupied',
  'endOfTrack',
  'turnoutAgainst',
  'turnoutUnknown',
] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

export const AUTO_STATES = [
  'waiting',
  'routing',
  'running',
  'stopping',
  'dwelling',
  'done',
] as const;
export type AutoState = (typeof AUTO_STATES)[number];

// Whether an open code is one this version knows.
export const isKnownCode = <T extends string>(
  known: readonly T[],
  code: string,
): code is T => (known as readonly string[]).includes(code);

export const CERTAINTIES = [
  'confirmed',
  'reported',
  'unknown',
  'manual',
  'moving',
] as const;
export const certaintySchema = lenientEnum(CERTAINTIES, 'unknown');
export type Certainty = z.infer<typeof certaintySchema>;

export const ASPECTS = [
  'stop',
  'proceed',
  'reduced',
  'expectStop',
  'expectProceed',
  'shunting',
  'unknown',
] as const;
export const aspectSchema = lenientEnum(ASPECTS, 'unknown');
export type Aspect = z.infer<typeof aspectSchema>;

export const ROUTE_STATES = [
  'setting',
  'set',
  'unconfirmed',
  'failed',
] as const;
export const routeStateSchema = lenientEnum(ROUTE_STATES, 'unconfirmed');
export type RouteState = z.infer<typeof routeStateSchema>;

export const CENTRAL_UNIT_STATES = [
  'connected',
  'interrupted',
  'lost',
] as const;
export const centralUnitStateSchema = lenientEnum(CENTRAL_UNIT_STATES, 'lost');

// ---------------------------------------------------------------------------
// Throttle → Lever

export const helloBodySchema = z.object({
  device: z.object({
    id: refIdSchema,
    driverName: text(60).optional(),
    app: text(40),
    appVersion: text(40),
  }),
  capabilities: z.array(text(40)).max(64),
  share: z.object({
    locoInfo: z.boolean(),
    locoState: z.boolean(),
    functions: z.boolean(),
  }),
  linesVersion: text(64).optional(),
  throttles: z
    .array(
      z.object({
        slot: z.number().int().min(0).max(31),
        // Lead first.
        addresses: z.array(dccAddressSchema).min(1).max(32),
        kind: lenientEnum(['loco', 'consist', 'address'], 'address'),
        line: lineChoiceSchema.optional(),
      }),
    )
    .max(16),
  // Opaque, compared only for equality.
  locosDigest: text(64).optional(),
});

export const locoFiguresSchema = z.object({
  address: dccAddressSchema,
  name: nameSchema,
  speedSteps: speedStepsSchema,
  maxSpeedKmh: z.number().positive().max(1000),
  // km/h per second, as in Throttle's loco library.
  acceleration: z.number().min(0).max(1000),
  braking: z.number().min(0).max(1000),
});
export type LocoFigures = z.infer<typeof locoFiguresSchema>;

export const consistSchema = z.object({
  lead: dccAddressSchema,
  members: z
    .array(z.object({address: dccAddressSchema, reversed: z.boolean()}))
    .min(1)
    .max(32),
});
export type Consist = z.infer<typeof consistSchema>;

// Only locos with real figures; plain addresses never appear here.
export const locosBodySchema = z.object({
  locos: z.array(locoFiguresSchema).max(128),
  consists: z.array(consistSchema).max(64).default([]),
});

export const locoStateSchema = z
  .object({
    address: dccAddressSchema,
    speedSteps: speedStepsSchema,
    // A plain number in the loco's mode, never the raw DCC encoding.
    step: z.number().int().min(0).max(126),
    eStop: z.boolean(),
    forward: z.boolean(),
    // The complete set the phone knows; a missing function is unknown.
    functions: z.record(z.string().regex(/^\d{1,2}$/), z.boolean()).optional(),
    // The whole state comes from LAN_X_LOCO_INFO.
    confirmed: z.boolean(),
  })
  .refine((state) => state.step <= MAX_STEP[state.speedSteps], {
    message: 'step beyond the speed-step mode',
  })
  .refine((state) => !state.eStop || state.step === 0, {
    message: 'emergency stop with a step',
  });
export type LocoState = z.infer<typeof locoStateSchema>;

export const locoStateBodySchema = z.object({
  states: z.array(locoStateSchema).min(1).max(32),
});

export const setLineBodySchema = z.object({
  address: dccAddressSchema,
  lineId: refIdSchema.nullable(),
  directionId: refIdSchema.optional(),
});

export const emptyBodySchema = z.object({});

// ---------------------------------------------------------------------------
// Both ways

export const ackBodySchema = z.object({seq: seqSchema});

// ---------------------------------------------------------------------------
// Lever → Throttle

export const welcomeBodySchema = z.object({
  lever: z.object({instanceId: refIdSchema, appVersion: text(40)}),
  project: z.object({id: refIdSchema, name: nameSchema}),
  capabilities: z.array(text(40)).max(64),
  linesVersion: text(64),
  locosDigestSeen: text(64).optional(),
  centralUnit: centralUnitStateSchema,
});

export const linkLineSchema = z.object({
  id: refIdSchema,
  name: nameSchema,
  shortName: text(12),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  loop: z.boolean(),
  directional: z.boolean(),
  directions: z
    .array(z.object({id: refIdSchema, name: nameSchema}))
    .max(8)
    .default([]),
  // The driver must pick a direction (directional lines only).
  directionRequired: z.boolean().default(false),
});
export type LinkLine = z.infer<typeof linkLineSchema>;

export const linesBodySchema = z.object({
  version: text(64),
  lines: z.array(linkLineSchema).max(64),
});

export const stripBodySchema = z.object({
  address: dccAddressSchema,
  addresses: z.array(dccAddressSchema).min(1).max(32),
  locoName: nameSchema.optional(),
  driverName: text(60).optional(),
  deviceId: refIdSchema.optional(),
  line: lineChoiceSchema.optional(),
  lineSetBy: lenientEnum(['driver', 'operator'], 'operator').optional(),
  lineSetAt: timeMsSchema.optional(),
  source: lenientEnum(['phone', 'manual'], 'manual'),
  // What Lever believes; the central unit's reports win over a phone's.
  state: z
    .object({
      speedSteps: speedStepsSchema,
      step: z.number().int().min(0).max(126),
      eStop: z.boolean(),
      forward: z.boolean(),
      confirmed: z.boolean(),
      from: lenientEnum(['centralUnit', 'phone'], 'phone'),
    })
    .optional(),
  lastHeardAt: timeMsSchema.optional(),
  phoneSilent: z.boolean(),
  conflict: z
    .object({
      fields: z.array(text(40)).max(16),
      automationStopped: z.boolean(),
    })
    .optional(),
  linkedTrainId: refIdSchema.optional(),
});

// Where the track leads from a station entry with the turnouts as they are
// (contract 9.1). An unknown kind from a newer Lever reads as `unknown`.
export const leadsToSchema = z
  .discriminatedUnion('kind', [
    z.object({kind: z.literal('exit'), exitId: refIdSchema, name: nameSchema}),
    z.object({kind: z.literal('track'), name: nameSchema.optional()}),
    z.object({
      kind: z.literal('against'),
      turnoutId: refIdSchema,
      name: nameSchema,
    }),
    z.object({
      kind: z.literal('unknown'),
      turnoutId: refIdSchema.optional(),
      name: nameSchema.optional(),
    }),
  ])
  .catch({kind: 'unknown'});
export type LeadsTo = z.infer<typeof leadsToSchema>;

export const passageSchema = z.object({
  station: z.object({viewId: refIdSchema, name: nameSchema}),
  entry: z.object({exitId: refIdSchema, name: nameSchema}),
  leadsTo: leadsToSchema,
  alongLine: z.boolean(),
  turnouts: z
    .array(
      z.object({
        id: refIdSchema,
        name: nameSchema,
        position: text(40).optional(),
        certainty: certaintySchema,
      }),
    )
    .max(64),
  signals: z
    .array(
      z.object({
        id: refIdSchema,
        name: nameSchema,
        aspect: aspectSchema,
        label: text(60).optional(),
      }),
    )
    .max(32),
  routes: z
    .array(
      z.object({
        id: refIdSchema,
        state: routeStateSchema,
        fromName: nameSchema,
        toName: nameSchema,
      }),
    )
    .max(16),
  level: levelSchema,
});
export type Passage = z.infer<typeof passageSchema>;

export const lineStatusBodySchema = z.object({
  lineId: refIdSchema,
  directionId: refIdSchema.optional(),
  passages: z.array(passageSchema).max(64),
  // Lever's own central-unit connection is interrupted or lost.
  stale: z.boolean().default(false),
});

export const driverViewBodySchema = z.object({
  address: dccAddressSchema,
  // Absent: Lever has no train with this loco now (nothing else is sent).
  train: z
    .object({
      id: refIdSchema,
      blockName: nameSchema,
      stationName: nameSchema,
      directionKnown: z.boolean(),
    })
    .optional(),
  freeAhead: z.number().int().min(0).max(64).optional(),
  endsBy: openCode.optional(),
  signalAhead: z
    .object({
      name: nameSchema,
      aspect: aspectSchema,
      label: text(60).optional(),
    })
    .optional(),
  routeAhead: z
    .object({state: routeStateSchema, toName: nameSchema})
    .optional(),
  nearestOccupied: z
    .object({
      blocksAhead: z.number().int().min(1).max(64),
      address: dccAddressSchema.optional(),
    })
    .optional(),
  level: levelSchema.optional(),
  hold: openCode.optional(),
  controlled: z.boolean().default(false),
  auto: z
    .object({
      state: openCode,
      reason: openCode.optional(),
      nextStopName: nameSchema.optional(),
    })
    .optional(),
  stale: z.boolean(),
});

export const noticeBodySchema = z.object({
  code: openCode,
  address: dccAddressSchema.optional(),
  params: z
    .record(text(40), z.union([text(200), z.number(), z.boolean()]))
    .optional(),
});

export const errorBodySchema = z.object({code: openCode});

// ---------------------------------------------------------------------------

export const MESSAGE_SCHEMAS = {
  hello: helloBodySchema,
  locos: locosBodySchema,
  locoState: locoStateBodySchema,
  setLine: setLineBodySchema,
  getLines: emptyBodySchema,
  bye: emptyBodySchema,
  ack: ackBodySchema,
  welcome: welcomeBodySchema,
  lines: linesBodySchema,
  strip: stripBodySchema,
  lineStatus: lineStatusBodySchema,
  driverView: driverViewBodySchema,
  notice: noticeBodySchema,
  error: errorBodySchema,
} as const;

export type MessageType = keyof typeof MESSAGE_SCHEMAS;
export type MessageBody<K extends MessageType> = z.infer<
  (typeof MESSAGE_SCHEMAS)[K]
>;
// What a sender may pass (defaults not yet applied).
export type MessageBodyInput<K extends MessageType> = z.input<
  (typeof MESSAGE_SCHEMAS)[K]
>;
export type LinkMessage = {
  [K in MessageType]: {type: K; body: MessageBody<K>};
}[MessageType];

export const THROTTLE_MESSAGE_TYPES = [
  'hello',
  'locos',
  'locoState',
  'setLine',
  'getLines',
  'ack',
  'bye',
] as const satisfies readonly MessageType[];

export const LEVER_MESSAGE_TYPES = [
  'welcome',
  'lines',
  'strip',
  'lineStatus',
  'driverView',
  'notice',
  'error',
  'ack',
] as const satisfies readonly MessageType[];

export const isMessageType = (type: string): type is MessageType =>
  Object.prototype.hasOwnProperty.call(MESSAGE_SCHEMAS, type);

// Transport-level: a slice of a larger message (contract 5.3).
export const PART_TYPE = 'part';
export const partBodySchema = z
  .object({
    msgId: z.string().min(1).max(32),
    index: z.number().int().min(0),
    count: z.number().int().min(1).max(LINK_LIMITS.maxParts),
    type: text(40).min(1),
    data: z.string(),
  })
  .refine((part) => part.index < part.count, {message: 'index ≥ count'});
export type PartBody = z.infer<typeof partBodySchema>;
