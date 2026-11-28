// Drives locos for Levels 3 and 4: brings each controlled loco to its target
// speed along its acceleration or braking ramp (Loco.acceleration /
// Loco.braking, km/h per second), sending LAN_X_SET_LOCO_DRIVE when the
// speed step changes, at most once per loco per tick. Never an emergency
// stop: Level 3 stops brake like a driver would.
//
// Lever controls a loco only while the interlocking gives it a target (a
// Level 3 hold, a Level 4 run); otherwise its driver has it. LAN_X_LOCO_INFO
// reports (any client's change) are taken as the loco's speed, so a driver
// accelerating a held train is braked back to 0 (re-asserting the stop).
//
// Drive commands do not go through the accessory queue: they are one short
// datagram each, a few per second at most, and must not wait behind a round
// of turnout commands. STOP still bypasses everything (the connection).
import {SpeedSteps} from '@lever/z21-protocol';
import {LocoTarget} from '../interlocking/trains';
import {kmhForStep, Loco, maxStep, rampKmh, stepForKmh} from '../model/locos';

export const LOCO_TICK_MS = 200;

export type LocoReport = {
  address: number;
  speedSteps?: SpeedSteps;
  forward: boolean;
  speed: number;
  emergencyStop: boolean;
};

export type LocoControlDeps = {
  drive: (command: {
    address: number;
    steps: SpeedSteps;
    speed: number;
    forward: boolean;
  }) => void;
  schedule: (ms: number, run: () => void) => () => void;
};

type Controlled = {
  loco: Loco;
  target: LocoTarget;
  // Where the ramp is now (km/h), and the direction driven.
  kmh: number;
  forward: boolean;
  // Last sent, to send only changes.
  sentStep?: number;
  sentForward?: boolean;
};

export class LocoControl {
  private readonly controlled = new Map<number, Controlled>();
  // Last report per address (also for locos not controlled).
  private readonly reports = new Map<number, LocoReport>();
  private cancelTick: (() => void) | null = null;

  constructor(private readonly deps: LocoControlDeps) {}

  report(address: number): LocoReport | undefined {
    return this.reports.get(address);
  }

  // The speed shown for a loco: its ramp while controlled, else reported.
  kmh(loco: Loco): number | undefined {
    const controlled = this.controlled.get(loco.address);
    if (controlled) {
      return controlled.kmh;
    }
    const report = this.reports.get(loco.address);
    return report ? kmhForStep(loco, report.speed) : undefined;
  }

  // The DCC direction shown for a loco: as driven while controlled, else
  // reported.
  forward(loco: Loco): boolean | undefined {
    return (
      this.controlled.get(loco.address)?.forward ??
      this.reports.get(loco.address)?.forward
    );
  }

  // Sets or drops (null) a loco's target. A new target starts from the
  // reported speed when Lever was not driving the loco.
  setTarget(loco: Loco, target: LocoTarget | null): void {
    const existing = this.controlled.get(loco.address);
    if (!target) {
      this.controlled.delete(loco.address);
      return;
    }
    if (existing) {
      existing.loco = loco;
      existing.target = target;
    } else {
      const report = this.reports.get(loco.address);
      this.controlled.set(loco.address, {
        loco,
        target,
        kmh: report ? kmhForStep(loco, report.speed) : 0,
        // The direction it runs now; a new one only after braking to 0.
        forward: report?.forward ?? target.forward ?? true,
        sentStep: report?.speed,
        sentForward: report?.forward,
      });
    }
    this.startTicking();
  }

  // LAN_X_LOCO_INFO. A speed that differs from Lever's own (a driver, a
  // stop by the central unit) becomes the ramp's starting point.
  reported(report: LocoReport): void {
    this.reports.set(report.address, report);
    const controlled = this.controlled.get(report.address);
    if (!controlled) {
      return;
    }
    const step = report.emergencyStop ? 0 : report.speed;
    if (
      step !== controlled.sentStep ||
      report.forward !== controlled.sentForward
    ) {
      controlled.kmh = kmhForStep(controlled.loco, step);
      controlled.sentStep = step;
      controlled.sentForward = report.forward;
      if (controlled.target.forward === undefined) {
        controlled.forward = report.forward;
      }
      this.startTicking();
    }
  }

  // STOP or track power off: every loco stands; ramps start from 0 again.
  allStopped(): void {
    for (const controlled of this.controlled.values()) {
      controlled.kmh = 0;
      controlled.sentStep = 0;
    }
  }

  // Connection lost: reports are no longer known.
  forgetReports(): void {
    this.reports.clear();
  }

  dispose(): void {
    this.cancelTick?.();
    this.cancelTick = null;
    this.controlled.clear();
  }

  private startTicking(): void {
    if (this.cancelTick) {
      return;
    }
    this.cancelTick = this.deps.schedule(LOCO_TICK_MS, () => {
      this.cancelTick = null;
      if (this.tick()) {
        this.startTicking();
      }
    });
  }

  // One step of every ramp; true while any loco still has to change.
  tick(): boolean {
    let moving = false;
    for (const [address, c] of this.controlled) {
      // A change of direction only at standstill: brake first.
      const wantForward = c.target.forward ?? c.forward;
      const reversing = wantForward !== c.forward;
      const goal = reversing ? 0 : c.target.kmh;
      c.kmh = rampKmh(c.loco, c.kmh, goal, LOCO_TICK_MS);
      if (reversing && c.kmh === 0) {
        c.forward = wantForward;
      }
      const top = maxStep(c.loco.speedSteps);
      const step = Math.min(top, stepForKmh(c.loco, c.kmh));
      if (step !== c.sentStep || c.forward !== c.sentForward) {
        this.deps.drive({
          address,
          steps: c.loco.speedSteps,
          speed: step,
          forward: c.forward,
        });
        c.sentStep = step;
        c.sentForward = c.forward;
      }
      if (c.kmh !== c.target.kmh || c.forward !== wantForward) {
        moving = true;
      }
    }
    return moving;
  }
}
