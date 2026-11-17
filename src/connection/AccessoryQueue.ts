// The one queue every accessory command goes through (LOAD-2, LOAD-3).
//
// Turnouts use LAN_X_SET_TURNOUT with Q=0 (spec §5.2.1): the client is
// responsible for serialisation and timing. Each switch job sends activate,
// waits the pulse duration, sends deactivate, and then waits the gap before
// the next job. So exactly one output is active at a time, and a route with
// many turnouts never fires them all at once.
//
// STOP and track power never go through this queue.
import {
  AccessoryOutput,
  lanXSetExtAccessory,
  lanXSetTurnout,
} from '@lever/z21-protocol';

// Defaults; projects can override both (PRJ-1).
export const DEFAULT_ACCESSORY_GAP_MS = 150;
export const DEFAULT_PULSE_MS = 150;
// Limits for configured values, so a typo cannot latch an output or flood the
// central unit.
export const MIN_PULSE_MS = 20;
export const MAX_PULSE_MS = 5000;
export const MIN_GAP_MS = 20;

export type AccessoryJob =
  | {
      kind: 'switch';
      fAdr: number;
      output: AccessoryOutput;
      pulseMs: number;
      // Q flag (FW 1.24+). Set from the project's central-unit profile, the
      // same for every command, so Q=0 and Q=1 are never mixed (§5.2.2).
      queued?: boolean;
    }
  | {kind: 'extAccessory'; rawAddress: number; value: number}
  // A request whose answer arrives as a broadcast-style message (turnout
  // info, feedback status). `key` identifies duplicates.
  | {kind: 'query'; key: string; dataset: Uint8Array};

// sent: on the wire (for a switch: activate and deactivate both sent).
// replaced: a newer switch for the same address took its place.
// cancelled: removed by cancel() before it started.
// dropped: the connection was lost before it started.
export type JobResult = 'sent' | 'replaced' | 'cancelled' | 'dropped';

export type AccessoryQueueOptions = {
  send: (datasets: Uint8Array[]) => void;
  gapMs?: number;
  // Called when a job starts, e.g. to record the commanded position.
  onStart?: (job: AccessoryJob) => void;
};

type Entry = {
  id: number;
  job: AccessoryJob;
  onDone?: (result: JobResult) => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export class AccessoryQueue {
  private readonly send: (datasets: Uint8Array[]) => void;
  private readonly onStart?: (job: AccessoryJob) => void;
  private gapMs: number;
  private pending: Entry[] = [];
  private nextId = 1;
  private connected = false;
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  // A deactivate that could not be sent because the connection was lost in
  // the middle of a pulse. Sent first after reconnecting, so no output stays
  // switched on.
  private owedDeactivate: Uint8Array | null = null;

  constructor(options: AccessoryQueueOptions) {
    this.send = options.send;
    this.onStart = options.onStart;
    this.gapMs = clamp(
      options.gapMs ?? DEFAULT_ACCESSORY_GAP_MS,
      MIN_GAP_MS,
      Number.MAX_SAFE_INTEGER,
    );
  }

  setGap(gapMs: number): void {
    this.gapMs = Math.max(MIN_GAP_MS, gapMs);
  }

  // Number of jobs waiting (not counting the one running).
  size(): number {
    return this.pending.length;
  }

  // Adds a job. A switch for an address that already has a switch waiting
  // replaces it in place (the newest position wins; order is kept). An
  // identical query that is already waiting is not added twice.
  enqueue(job: AccessoryJob, onDone?: (result: JobResult) => void): number {
    if (!this.connected) {
      onDone?.('dropped');
      return 0;
    }
    const id = this.nextId++;
    const existing = this.pending.findIndex((entry) =>
      sameTarget(entry.job, job),
    );
    if (existing >= 0) {
      const replaced = this.pending[existing];
      this.pending[existing] = {id, job, onDone};
      replaced.onDone?.(job.kind === 'query' ? 'sent' : 'replaced');
    } else {
      this.pending.push({id, job, onDone});
    }
    this.pump();
    return id;
  }

  // Removes waiting jobs (e.g. when a route being set is cancelled, RTE-8).
  // A job already running finishes its pulse.
  cancel(predicate: (job: AccessoryJob, id: number) => boolean): void {
    const removed = this.pending.filter((entry) =>
      predicate(entry.job, entry.id),
    );
    this.pending = this.pending.filter(
      (entry) => !predicate(entry.job, entry.id),
    );
    removed.forEach((entry) => entry.onDone?.('cancelled'));
  }

  // Called by the connection owner on every connection state change. While
  // disconnected nothing is queued: replaying stale switching commands later
  // would be unsafe.
  setConnected(connected: boolean): void {
    if (connected === this.connected) {
      return;
    }
    this.connected = connected;
    if (!connected) {
      const dropped = this.pending;
      this.pending = [];
      dropped.forEach((entry) => entry.onDone?.('dropped'));
      return;
    }
    if (this.owedDeactivate) {
      this.send([this.owedDeactivate]);
      this.owedDeactivate = null;
    }
    this.pump();
  }

  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const dropped = this.pending;
    this.pending = [];
    dropped.forEach((entry) => entry.onDone?.('dropped'));
  }

  private pump(): void {
    if (this.busy || !this.connected) {
      return;
    }
    const entry = this.pending.shift();
    if (!entry) {
      return;
    }
    this.busy = true;
    this.onStart?.(entry.job);
    const {job} = entry;

    switch (job.kind) {
      case 'switch': {
        const pulseMs = clamp(job.pulseMs, MIN_PULSE_MS, MAX_PULSE_MS);
        const queue = job.queued ?? false;
        const deactivate = lanXSetTurnout({
          fAdr: job.fAdr,
          output: job.output,
          activate: false,
          queue,
        });
        this.send([
          lanXSetTurnout({
            fAdr: job.fAdr,
            output: job.output,
            activate: true,
            queue,
          }),
        ]);
        this.wait(pulseMs, () => {
          if (this.connected) {
            this.send([deactivate]);
          } else {
            this.owedDeactivate = deactivate;
          }
          entry.onDone?.('sent');
          this.wait(this.gapMs, () => this.next());
        });
        break;
      }
      case 'extAccessory':
        this.send([lanXSetExtAccessory(job.rawAddress, job.value)]);
        entry.onDone?.('sent');
        this.wait(this.gapMs, () => this.next());
        break;
      case 'query':
        this.send([job.dataset]);
        entry.onDone?.('sent');
        this.wait(this.gapMs, () => this.next());
        break;
    }
  }

  private wait(ms: number, then: () => void): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      then();
    }, ms);
  }

  private next(): void {
    this.busy = false;
    this.pump();
  }
}

const sameTarget = (a: AccessoryJob, b: AccessoryJob): boolean => {
  if (a.kind === 'switch' && b.kind === 'switch') {
    return a.fAdr === b.fAdr;
  }
  if (a.kind === 'extAccessory' && b.kind === 'extAccessory') {
    return a.rawAddress === b.rawAddress;
  }
  if (a.kind === 'query' && b.kind === 'query') {
    return a.key === b.key;
  }
  return false;
};
