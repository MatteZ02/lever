// Locos and schedules for Levels 3 and 4 (section 9), stored in the project.
// A loco's driving figures follow Throttle's loco library (src/library/
// types.ts there): top speed in km/h, and acceleration and braking in km/h
// per second, used as straight-line ramps. Lever adds the speeds it drives
// at automatically: cruising and approach (into the block before a stop).
// Pure: schemas and speed arithmetic only.
import {z} from 'zod';
import {idSchema} from './elements';

export const speedStepsSchema = z.union([
  z.literal(14),
  z.literal(28),
  z.literal(128),
]);
export type LocoSpeedSteps = z.infer<typeof speedStepsSchema>;

// Throttle's defaults for new locos (DEFAULT_ACCELERATION, DEFAULT_BRAKING,
// DEFAULT_MAX_SPEED).
export const DEFAULT_MAX_SPEED_KMH = 100;
export const DEFAULT_ACCELERATION = 5;
export const DEFAULT_BRAKING = 5;
export const DEFAULT_CRUISE_KMH = 60;
export const DEFAULT_APPROACH_KMH = 20;

const kmhSchema = z.number().min(0).max(500);
const rateSchema = z.number().min(0.1).max(200);

export const locoSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(100),
  // DCC address (§4.1: 1–9999).
  address: z.number().int().min(1).max(9999),
  speedSteps: speedStepsSchema.default(128),
  // Reached at the top speed step; the scale between is linear, as in
  // Throttle and the Roco app (the real curve is the decoder's).
  maxSpeedKmh: kmhSchema.default(DEFAULT_MAX_SPEED_KMH),
  // km/h gained per second when Lever accelerates the loco.
  acceleration: rateSchema.default(DEFAULT_ACCELERATION),
  // km/h lost per second when Lever brakes it (automatic stop, stopping at
  // a destination). Never an emergency stop.
  braking: rateSchema.default(DEFAULT_BRAKING),
  // Level 4: speed between stops, and in the block before a stop.
  cruiseKmh: kmhSchema.default(DEFAULT_CRUISE_KMH),
  approachKmh: kmhSchema.default(DEFAULT_APPROACH_KMH),
  notes: z.string().max(2000).default(''),
});
export type Loco = z.infer<typeof locoSchema>;

// Level 4: the blocks a train is driven to in turn, waiting `dwellS` at
// each. `repeat`: start again from the first stop after the last.
export const scheduleStopSchema = z.object({
  blockId: idSchema,
  dwellS: z.number().int().min(0).max(3600).default(30),
});
export const scheduleSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(100),
  stops: z.array(scheduleStopSchema).max(100).default([]),
  repeat: z.boolean().default(false),
});
export type Schedule = z.infer<typeof scheduleSchema>;
export type ScheduleStop = z.infer<typeof scheduleStopSchema>;

export const maxStep = (steps: LocoSpeedSteps): number =>
  steps === 14 ? 14 : steps === 28 ? 28 : 126;

// The speed step for a speed (rounded; never above the top step).
export const stepForKmh = (loco: Loco, kmh: number): number => {
  if (loco.maxSpeedKmh <= 0 || kmh <= 0) {
    return 0;
  }
  const top = maxStep(loco.speedSteps);
  return Math.min(top, Math.round((kmh / loco.maxSpeedKmh) * top));
};

export const kmhForStep = (loco: Loco, step: number): number =>
  (Math.max(0, step) / maxStep(loco.speedSteps)) * loco.maxSpeedKmh;

// The next speed (km/h) on the way from `current` to `target`: by the
// loco's acceleration or braking over the elapsed time, never past the
// target.
export const rampKmh = (
  loco: Loco,
  current: number,
  target: number,
  elapsedMs: number,
): number => {
  if (elapsedMs <= 0 || current === target) {
    return current;
  }
  const rate = target > current ? loco.acceleration : loco.braking;
  const change = (rate * elapsedMs) / 1000;
  return target > current
    ? Math.min(target, current + change)
    : Math.max(target, current - change);
};

// How far a loco runs while braking from `kmh` to a stop, in seconds (for
// showing the operator; distances are unknown without a scale).
export const brakingSeconds = (loco: Loco, kmh: number): number =>
  kmh <= 0 ? 0 : kmh / loco.braking;
