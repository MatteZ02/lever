// Signal types are data (SIG-1): each aspect says which outputs to switch
// (basic accessories) or which value to send (extended accessories). The
// built-in templates are a small, generic, Swiss-style set (SIG-1b); projects
// can define their own types with the same schema.
import {z} from 'zod';
import {strings} from '../shared/strings';
import {idSchema, outputRefSchema} from './elements';

// How an aspect is drawn (SIG-2). Generic Swiss-style lamps.
export const aspectIconSchema = z.enum([
  'stop',
  'proceed',
  'reduced',
  'expectStop',
  'expectProceed',
  'shuntStop',
  'shuntAllowed',
  'dark',
]);
export type AspectIcon = z.infer<typeof aspectIconSchema>;

export const signalAspectSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(60),
  icon: aspectIconSchema,
  // Basic accessory outputs to switch, in order (default mapping; a signal
  // may override it with its control's outputMap).
  outputs: z.array(outputRefSchema),
  // Value for an extended accessory decoder, if known.
  extValue: z.number().int().min(0).max(255).optional(),
});
export type SignalAspect = z.infer<typeof signalAspectSchema>;

export const signalTypeSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(60),
  category: z.enum(['main', 'distant', 'shunting']),
  addressCount: z.number().int().min(1).max(4),
  aspects: z.array(signalAspectSchema).min(1),
  // The most restrictive aspect: set on route release and when a route
  // breaks (RTE-6, RTE-6c). For distant signals: "expect stop".
  stopAspectId: idSchema,
  // Main signals: the aspect for a straight route and for a diverging
  // route, if the type has one (RTE-5).
  proceedAspectId: idSchema.optional(),
  reducedAspectId: idSchema.optional(),
});
export type SignalType = z.infer<typeof signalTypeSchema>;

const names = strings.signalTypes;

export const BUILT_IN_SIGNAL_TYPES: SignalType[] = [
  {
    id: 'builtin:main2',
    name: names.main2,
    category: 'main',
    addressCount: 1,
    aspects: [
      {
        id: 'stop',
        name: names.aspects.stop,
        icon: 'stop',
        outputs: [{address: 0, output: 1}],
        extValue: 0,
      },
      {
        id: 'proceed',
        name: names.aspects.proceed,
        icon: 'proceed',
        outputs: [{address: 0, output: 2}],
        extValue: 16,
      },
    ],
    stopAspectId: 'stop',
    proceedAspectId: 'proceed',
  },
  {
    id: 'builtin:main3',
    name: names.main3,
    category: 'main',
    addressCount: 2,
    aspects: [
      {
        id: 'stop',
        name: names.aspects.stop,
        icon: 'stop',
        outputs: [{address: 0, output: 1}],
        extValue: 0,
      },
      {
        id: 'proceed',
        name: names.aspects.proceed,
        icon: 'proceed',
        outputs: [
          {address: 0, output: 2},
          {address: 1, output: 1},
        ],
        extValue: 16,
      },
      {
        id: 'reduced',
        name: names.aspects.reduced,
        icon: 'reduced',
        outputs: [
          {address: 0, output: 2},
          {address: 1, output: 2},
        ],
        extValue: 4,
      },
    ],
    stopAspectId: 'stop',
    proceedAspectId: 'proceed',
    reducedAspectId: 'reduced',
  },
  {
    id: 'builtin:distant',
    name: names.distant,
    category: 'distant',
    addressCount: 1,
    aspects: [
      {
        id: 'expectStop',
        name: names.aspects.expectStop,
        icon: 'expectStop',
        outputs: [{address: 0, output: 1}],
      },
      {
        id: 'expectProceed',
        name: names.aspects.expectProceed,
        icon: 'expectProceed',
        outputs: [{address: 0, output: 2}],
      },
    ],
    stopAspectId: 'expectStop',
    proceedAspectId: 'expectProceed',
  },
  {
    id: 'builtin:shunting',
    name: names.shunting,
    category: 'shunting',
    addressCount: 1,
    aspects: [
      {
        id: 'stop',
        name: names.aspects.shuntStop,
        icon: 'shuntStop',
        outputs: [{address: 0, output: 1}],
        extValue: 0,
      },
      {
        id: 'shuntAllowed',
        name: names.aspects.shuntAllowed,
        icon: 'shuntAllowed',
        outputs: [{address: 0, output: 2}],
        extValue: 65,
      },
    ],
    stopAspectId: 'stop',
    proceedAspectId: 'shuntAllowed',
  },
];

export const DEFAULT_SIGNAL_TYPE_ID = 'builtin:main2';

// Built-ins first, then the project's own types.
export const allSignalTypes = (projectTypes: SignalType[]): SignalType[] => [
  ...BUILT_IN_SIGNAL_TYPES,
  ...projectTypes,
];

export const findSignalType = (
  projectTypes: SignalType[],
  id: string,
): SignalType | undefined =>
  allSignalTypes(projectTypes).find((type) => type.id === id);
