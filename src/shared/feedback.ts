// Feedback inputs, independent of the bus they come from (BLK-1). Blocks and
// turnout position feedback refer to inputs with these references; adding a
// source to a project is configuration, not code.
import {z} from 'zod';

export const feedbackSourceSchema = z.enum(['rbus', 'loconet', 'can']);
export type FeedbackSource = z.infer<typeof feedbackSourceSchema>;

export const feedbackInputRefSchema = z.discriminatedUnion('source', [
  // R-Bus feedback module 1..20, input 1..8 (as printed on the module).
  z.object({
    source: z.literal('rbus'),
    module: z.number().int().min(1).max(20),
    input: z.number().int().min(1).max(8),
  }),
  // LocoNet occupancy detector feedback address (user-configured, e.g. via
  // LNCV).
  z.object({
    source: z.literal('loconet'),
    address: z.number().int().min(0).max(65535),
  }),
  // CAN occupancy detector: module address (user-configured) and port 0..7.
  // The detector's fixed network id is shown for information only.
  z.object({
    source: z.literal('can'),
    module: z.number().int().min(0).max(65535),
    port: z.number().int().min(0).max(7),
  }),
]);
export type FeedbackInputRef = z.infer<typeof feedbackInputRefSchema>;

// Stable string key, e.g. for maps and for the feedback monitor.
export const feedbackInputKey = (input: FeedbackInputRef): string => {
  switch (input.source) {
    case 'rbus':
      return `rbus:${input.module}:${input.input}`;
    case 'loconet':
      return `loconet:${input.address}`;
    case 'can':
      return `can:${input.module}:${input.port}`;
  }
};

export const detectedLocoSchema = z.object({
  address: z.number().int(),
  // undefined: direction not reported.
  forward: z.boolean().optional(),
});
export type DetectedLoco = z.infer<typeof detectedLocoSchema>;

// The live state of one input, as last reported by the central unit.
export const feedbackInputStateSchema = z.object({
  key: z.string(),
  input: feedbackInputRefSchema,
  occupied: z.boolean(),
  // Locos reported in the section (RailCom, transponder, LISSY), if any
  // (BLK-5). Informational at Levels 1-2.
  locos: z.array(detectedLocoSchema),
  // CAN detectors: overload level 1-3, 0 = none.
  overload: z.number().int(),
  // CAN detectors: fixed network id, for the feedback monitor.
  networkId: z.number().int().optional(),
  changedAt: z.number(),
});
export type FeedbackInputState = z.infer<typeof feedbackInputStateSchema>;
