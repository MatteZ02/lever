// Everything about how accessories are driven that may differ between central
// units (z21 start, Z21, DR5000) or between layouts, in one place. Stored per
// project (PRJ-1), so a difference found on a DR5000 is fixed by
// changing a setting, not code. See docs/hardware-notes.md for what still has
// to be verified.
import {z} from 'zod';
import {feedbackSourceSchema} from '../shared/feedback';

export const centralUnitProfileSchema = z.object({
  // Added to every displayed turnout/accessory number before it is sent
  // (LOAD-5). 0 = Roco numbering (turnout #1 is FAdr 0). Use e.g. +4 or -4 if
  // the central unit or its decoders count differently.
  addressOffset: z.number().int().min(-2048).max(2048).default(0),
  // Which output a turnout's "straight" position uses by default (the other
  // one is "diverging"). Per element, `invert` swaps them.
  straightOutput: z.union([z.literal(1), z.literal(2)]).default(1),
  // Activation time of one output (spec §5.2.1), unless an element sets its
  // own.
  pulseMs: z.number().int().min(20).max(5000).default(150),
  // Minimum time between two accessory commands (LOAD-2).
  accessoryGapMs: z.number().int().min(20).max(5000).default(150),
  // 'pulse': LAN_X_SET_TURNOUT with Q=0, Lever times activate and deactivate
  // (works everywhere). 'queued': Q=1 (FW 1.24+), the central unit queues
  // the command; Lever still sends the deactivate. Never mixed (§5.2.2).
  turnoutCommandMode: z.enum(['pulse', 'queued']).default('pulse'),
  // How a commanded position becomes "confirmed" (ACC-2, RTE-4):
  // 'report': only when the central unit reports it (LAN_X_TURNOUT_INFO).
  // 'assume': also after confirmTimeoutMs without a report, for central
  //           units that do not report accessory changes.
  confirmation: z.enum(['report', 'assume']).default('report'),
  confirmTimeoutMs: z.number().int().min(100).max(30000).default(2000),
  // Some central units (the DR5000, FW 1.29) do not tell Lever about turnouts
  // switched by other programs (e.g. WinDigipet over USB) or other clients.
  // Then Lever asks for the positions of the stations on screen this often,
  // and at once on an operator's action when they are a few seconds old.
  // 0 = off: a Z21 reports changes itself.
  positionRefreshMs: z.number().int().min(0).max(600000).default(0),
  // The DR5000 does not tell Lever about STOP, track power or a short
  // circuit caused by other devices; Lever asks for the track status this
  // often (it also notices a lost connection sooner). 0 = only the
  // keepalive, enough for a Z21, which reports them itself.
  statusRefreshMs: z.number().int().min(0).max(60000).default(1000),
  // Feedback buses the layout uses (LOAD-1, BLK-1).
  feedbackSources: z.array(feedbackSourceSchema).default([]),
});

export type CentralUnitProfile = z.infer<typeof centralUnitProfileSchema>;

export const defaultCentralUnitProfile = (): CentralUnitProfile =>
  centralUnitProfileSchema.parse({});
