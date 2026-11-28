// Reliable messages (contract 5.2): resent after `resendMs`, the interval
// doubling up to `resendMaxMs`, until acknowledged or replaced by a newer
// message about the same subject. Receivers process each id + seq once.
// The clock is a parameter; both classes are pure.
import {LINK_DEFAULTS} from './defaults.ts';

type Entry<P> = {
  subject: string;
  payload: P;
  dueAt: number;
  intervalMs: number;
};

export type ResendOptions = {resendMs?: number; resendMaxMs?: number};

// What a sender keeps for its unacknowledged reliable messages. `payload` is
// whatever it needs to send again (usually the encoded datagrams).
export class ResendQueue<P> {
  private readonly entries = new Map<number, Entry<P>>();
  private readonly resendMs: number;
  private readonly resendMaxMs: number;

  constructor(options: ResendOptions = {}) {
    this.resendMs = options.resendMs ?? LINK_DEFAULTS.resendMs;
    this.resendMaxMs = options.resendMaxMs ?? LINK_DEFAULTS.resendMaxMs;
  }

  get size(): number {
    return this.entries.size;
  }

  // A newer message about the same subject replaces the older one.
  add(seq: number, subject: string, payload: P, now: number): void {
    this.removeSubject(subject);
    this.entries.set(seq, {
      subject,
      payload,
      dueAt: now + this.resendMs,
      intervalMs: this.resendMs,
    });
  }

  ack(seq: number): boolean {
    return this.entries.delete(seq);
  }

  removeSubject(subject: string): void {
    for (const [seq, entry] of this.entries) {
      if (entry.subject === subject) {
        this.entries.delete(seq);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }

  // The messages to send again now; each is rescheduled with a doubled
  // interval.
  due(now: number): {seq: number; subject: string; payload: P}[] {
    const out: {seq: number; subject: string; payload: P}[] = [];
    for (const [seq, entry] of this.entries) {
      if (entry.dueAt <= now) {
        entry.intervalMs = Math.min(entry.intervalMs * 2, this.resendMaxMs);
        entry.dueAt = now + entry.intervalMs;
        out.push({seq, subject: entry.subject, payload: entry.payload});
      }
    }
    return out;
  }

  nextDueAt(): number | undefined {
    let next: number | undefined;
    for (const entry of this.entries.values()) {
      if (next === undefined || entry.dueAt < next) {
        next = entry.dueAt;
      }
    }
    return next;
  }
}

export type SeenOptions = {perSender?: number; maxSenders?: number};

// De-duplication: remembers the latest seqs per sender (bounded), so a
// resent message is processed once. A sender starts its seq at its clock in
// ms (`initialSeq`), so a restarted app never repeats a recent seq.
export class SeenSequences {
  private readonly senders = new Map<string, Set<number>>();
  private readonly perSender: number;
  private readonly maxSenders: number;

  constructor(options: SeenOptions = {}) {
    this.perSender = options.perSender ?? 256;
    this.maxSenders = options.maxSenders ?? 64;
  }

  // True the first time this id + seq is seen.
  firstTime(id: string, seq: number): boolean {
    let seen = this.senders.get(id);
    if (seen) {
      // Most recently heard last, so the oldest sender is evicted first.
      this.senders.delete(id);
    } else {
      seen = new Set();
      if (this.senders.size >= this.maxSenders) {
        const oldest = this.senders.keys().next().value;
        if (oldest !== undefined) {
          this.senders.delete(oldest);
        }
      }
    }
    this.senders.set(id, seen);
    if (seen.has(seq)) {
      return false;
    }
    seen.add(seq);
    if (seen.size > this.perSender) {
      const oldest = seen.values().next().value;
      if (oldest !== undefined) {
        seen.delete(oldest);
      }
    }
    return true;
  }

  forget(id: string): void {
    this.senders.delete(id);
  }
}

// The first seq of a sender: its clock in ms, so seqs keep increasing across
// restarts (at fewer than 1000 messages a second).
export const initialSeq = (nowMs: number): number =>
  Math.max(0, Math.floor(nowMs));
