// Reassembly of `part` datagrams (contract 5.3). Parts may arrive in any
// order and more than once; a message whose parts do not all arrive within
// `chunkTimeoutMs` of its first part is dropped. The clock is a parameter.
import {decodeBody, utf8ByteLength} from './codec.ts';
import type {Envelope} from './codec.ts';
import {LINK_DEFAULTS, LINK_LIMITS} from './defaults.ts';
import {isMessageType} from './messages.ts';
import type {LinkMessage, PartBody} from './messages.ts';

export type ReassemblyResult =
  | {kind: 'complete'; envelope: Envelope; message: LinkMessage}
  | {kind: 'pending'}
  // Complete, but of a type this version does not know (minor-newer).
  | {kind: 'unknownType'; envelope: Envelope}
  | {kind: 'invalid'; reason: string};

type Pending = {
  sender: string;
  // The first part's envelope; its seq and rel stand for the message.
  envelope: Envelope;
  type: string;
  count: number;
  parts: (string | undefined)[];
  received: number;
  bytes: number;
  firstAt: number;
};

export type ReassemblerOptions = {
  timeoutMs?: number;
  maxPendingPerSender?: number;
  maxMessageBytes?: number;
};

export class Reassembler {
  private readonly pending = new Map<string, Pending>();
  private readonly timeoutMs: number;
  private readonly maxPendingPerSender: number;
  private readonly maxMessageBytes: number;

  constructor(options: ReassemblerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? LINK_DEFAULTS.chunkTimeoutMs;
    this.maxPendingPerSender =
      options.maxPendingPerSender ?? LINK_LIMITS.maxPendingPerSender;
    this.maxMessageBytes =
      options.maxMessageBytes ?? LINK_LIMITS.maxMessageBytes;
  }

  get size(): number {
    return this.pending.size;
  }

  add(envelope: Envelope, part: PartBody, now: number): ReassemblyResult {
    this.prune(now);
    const key = `${envelope.id}\u0000${part.msgId}`;
    let entry = this.pending.get(key);
    if (!entry) {
      if (this.pendingOf(envelope.id) >= this.maxPendingPerSender) {
        return {kind: 'invalid', reason: 'too many messages in parts'};
      }
      entry = {
        sender: envelope.id,
        envelope,
        type: part.type,
        count: part.count,
        parts: new Array<string | undefined>(part.count).fill(undefined),
        received: 0,
        bytes: 0,
        firstAt: now,
      };
      this.pending.set(key, entry);
    } else if (entry.count !== part.count || entry.type !== part.type) {
      this.pending.delete(key);
      return {kind: 'invalid', reason: 'parts do not match'};
    }
    if (entry.parts[part.index] === undefined) {
      entry.parts[part.index] = part.data;
      entry.received++;
      entry.bytes += utf8ByteLength(part.data);
    }
    if (entry.bytes > this.maxMessageBytes) {
      this.pending.delete(key);
      return {kind: 'invalid', reason: 'message too large'};
    }
    if (entry.received < entry.count) {
      return {kind: 'pending'};
    }
    this.pending.delete(key);
    let body: unknown;
    try {
      body = JSON.parse(entry.parts.join(''));
    } catch {
      return {kind: 'invalid', reason: 'parts are not JSON'};
    }
    const merged: Envelope = {...entry.envelope, t: entry.type, body};
    if (!isMessageType(entry.type)) {
      return {kind: 'unknownType', envelope: merged};
    }
    const decoded = decodeBody(entry.type, body);
    return decoded.ok
      ? {kind: 'complete', envelope: merged, message: decoded.message}
      : {kind: 'invalid', reason: decoded.reason};
  }

  // Drops messages whose parts did not all arrive in time; returns how many.
  prune(now: number): number {
    let dropped = 0;
    for (const [key, entry] of this.pending) {
      if (now - entry.firstAt > this.timeoutMs) {
        this.pending.delete(key);
        dropped++;
      }
    }
    return dropped;
  }

  // Forgets a sender's incomplete messages (e.g. when it says bye).
  forget(sender: string): void {
    for (const [key, entry] of this.pending) {
      if (entry.sender === sender) {
        this.pending.delete(key);
      }
    }
  }

  private pendingOf(sender: string): number {
    let count = 0;
    for (const entry of this.pending.values()) {
      if (entry.sender === sender) {
        count++;
      }
    }
    return count;
  }
}
