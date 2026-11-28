// Envelope, encoding and decoding of datagrams (contract sections 4, 5.1,
// 5.3). Every datagram is one JSON envelope in UTF-8, at most
// `maxDatagramBytes`; a larger message is sent as `part` datagrams.
//
// Decoding never throws: it says what the datagram is, so a receiver can
// count and drop invalid ones, answer a major mismatch, and ignore unknown
// types from a newer minor version.
import {z} from 'zod';
import {LINK_DEFAULTS, LINK_LIMITS} from './defaults.ts';
import {
  isMessageType,
  MESSAGE_SCHEMAS,
  PART_TYPE,
  partBodySchema,
  seqSchema,
} from './messages.ts';
import type {
  LinkMessage,
  MessageBodyInput,
  MessageType,
  PartBody,
} from './messages.ts';
import {PROTOCOL_MAJOR, PROTOCOL_NAME, PROTOCOL_VERSION} from './version.ts';

export const envelopeSchema = z.object({
  p: z.literal(PROTOCOL_NAME),
  v: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  t: z.string().min(1).max(40),
  // Sender's instance or device id.
  id: z.string().min(1).max(64),
  // Lever's session id (Throttle echoes the last one it saw).
  ses: z.string().min(1).max(64).optional(),
  seq: seqSchema,
  rel: z.boolean().optional(),
  ts: z.number().optional(),
  body: z.unknown(),
});
export type Envelope = z.infer<typeof envelopeSchema>;

// Everything in the envelope except the type and body.
export type EnvelopeHeader = {
  id: string;
  ses?: string;
  seq: number;
  rel?: boolean;
  ts?: number;
};

export type OutgoingMessage = {
  [K in MessageType]: {type: K; body: MessageBodyInput<K>};
}[MessageType];

export class LinkEncodeError extends Error {
  readonly code: 'invalidBody' | 'tooLarge';
  constructor(code: 'invalidBody' | 'tooLarge', message: string) {
    super(message);
    this.code = code;
    this.name = 'LinkEncodeError';
  }
}

// UTF-8 length of a string, without TextEncoder (not everywhere in React
// Native). A lone surrogate counts as U+FFFD (3 bytes), as encoders write it.
export const utf8ByteLength = (text: string): number => {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
};

const envelopeText = (
  header: EnvelopeHeader,
  type: string,
  body: unknown,
  version: readonly [number, number],
): string =>
  JSON.stringify({
    p: PROTOCOL_NAME,
    v: version,
    t: type,
    id: header.id,
    ses: header.ses,
    seq: header.seq,
    rel: header.rel,
    ts: header.ts,
    body,
  });

// Validates the body against its schema (defaults applied, unknown fields
// dropped), so a sender cannot put an invalid message on the network.
export const prepareBody = (message: OutgoingMessage): unknown => {
  const result = MESSAGE_SCHEMAS[message.type].safeParse(message.body);
  if (!result.success) {
    throw new LinkEncodeError(
      'invalidBody',
      `${message.type}: ${issueText(result.error)}`,
    );
  }
  return result.data;
};

// One datagram, without the size check (use encodeDatagrams to send).
export const encodeMessage = (
  header: EnvelopeHeader,
  message: OutgoingMessage,
  version: readonly [number, number] = PROTOCOL_VERSION,
): string => envelopeText(header, message.type, prepareBody(message), version);

export type EncodeOptions = {
  maxBytes?: number;
  // Id shared by the parts of one message; default: the seq in base 36.
  msgId?: string;
  version?: readonly [number, number];
};

// The datagrams to send for a message: one, or its parts (contract 5.3).
// Every part carries the message's header (the same seq and rel), so a
// receiver de-duplicates and acknowledges the reassembled message, not the
// parts. Throws LinkEncodeError when the body would need more than
// LINK_LIMITS.maxParts parts.
export const encodeDatagrams = (
  header: EnvelopeHeader,
  message: OutgoingMessage,
  options: EncodeOptions = {},
): string[] => {
  const maxBytes = Math.min(
    options.maxBytes ?? LINK_DEFAULTS.maxDatagramBytes,
    LINK_LIMITS.maxDatagramBytes,
  );
  const version = options.version ?? PROTOCOL_VERSION;
  const body = prepareBody(message);
  const whole = envelopeText(header, message.type, body, version);
  if (utf8ByteLength(whole) <= maxBytes) {
    return [whole];
  }
  const msgId = options.msgId ?? header.seq.toString(36);
  const bodyText = JSON.stringify(body);
  // Overhead of a part with the widest index and count.
  const overhead = utf8ByteLength(
    envelopeText(
      header,
      PART_TYPE,
      {
        msgId,
        index: LINK_LIMITS.maxParts - 1,
        count: LINK_LIMITS.maxParts,
        type: message.type,
        data: '',
      },
      version,
    ),
  );
  const room = maxBytes - overhead;
  if (room < 16) {
    throw new LinkEncodeError('tooLarge', 'datagram limit below the header');
  }
  const slices = sliceForJson(bodyText, room);
  if (slices.length > LINK_LIMITS.maxParts) {
    throw new LinkEncodeError(
      'tooLarge',
      `${message.type} needs ${slices.length} parts`,
    );
  }
  return slices.map((data, index) =>
    envelopeText(
      header,
      PART_TYPE,
      {msgId, index, count: slices.length, type: message.type, data},
      version,
    ),
  );
};

// Bytes a character takes inside a JSON string (escapes included).
const jsonCharBytes = (char: string): number => {
  const code = char.charCodeAt(0);
  if (char.length === 1 && code >= 0x20 && code < 0x7f) {
    return char === '"' || char === '\\' ? 2 : 1;
  }
  return utf8ByteLength(JSON.stringify(char)) - 2;
};

// Splits text into slices whose JSON string form fits `room` bytes, never
// inside a surrogate pair.
const sliceForJson = (text: string, room: number): string[] => {
  const slices: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of text) {
    const size = jsonCharBytes(char);
    if (bytes + size > room && current !== '') {
      slices.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  if (current !== '' || slices.length === 0) {
    slices.push(current);
  }
  return slices;
};

export type DecodedDatagram =
  | {kind: 'message'; envelope: Envelope; message: LinkMessage}
  | {kind: 'part'; envelope: Envelope; part: PartBody}
  // A type this version does not know (minor-newer): ignore it, but
  // acknowledge it if it is reliable, so the sender stops resending.
  | {kind: 'unknownType'; envelope: Envelope}
  // Another major version: Lever answers `error versionMismatch`.
  | {
      kind: 'versionMismatch';
      version: [number, number];
      id?: string;
      seq?: number;
    }
  | {kind: 'notLeverLink'}
  | {kind: 'tooLarge'; bytes: number}
  | {kind: 'invalid'; reason: string; envelope?: Envelope};

export type DecodeOptions = {maxBytes?: number};

export const decodeDatagram = (
  text: string,
  options: DecodeOptions = {},
): DecodedDatagram => {
  const maxBytes = options.maxBytes ?? LINK_LIMITS.maxDatagramBytes;
  const bytes = utf8ByteLength(text);
  if (bytes > maxBytes) {
    return {kind: 'tooLarge', bytes};
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {kind: 'invalid', reason: 'not JSON'};
  }
  if (
    typeof data !== 'object' ||
    data === null ||
    (data as {p?: unknown}).p !== PROTOCOL_NAME
  ) {
    return {kind: 'notLeverLink'};
  }
  const raw = data as Record<string, unknown>;
  const version = raw['v'];
  if (
    !Array.isArray(version) ||
    version.length < 2 ||
    !Number.isInteger(version[0]) ||
    !Number.isInteger(version[1])
  ) {
    return {kind: 'invalid', reason: 'version'};
  }
  if (version[0] !== PROTOCOL_MAJOR) {
    return {
      kind: 'versionMismatch',
      version: [version[0], version[1]],
      id: typeof raw['id'] === 'string' ? raw['id'] : undefined,
      seq: typeof raw['seq'] === 'number' ? raw['seq'] : undefined,
    };
  }
  const parsed = envelopeSchema.safeParse({
    ...raw,
    v: [version[0], version[1]],
  });
  if (!parsed.success) {
    return {kind: 'invalid', reason: `envelope: ${issueText(parsed.error)}`};
  }
  const envelope = parsed.data;
  if (envelope.t === PART_TYPE) {
    const part = partBodySchema.safeParse(envelope.body);
    return part.success
      ? {kind: 'part', envelope, part: part.data}
      : {kind: 'invalid', reason: `part: ${issueText(part.error)}`, envelope};
  }
  if (!isMessageType(envelope.t)) {
    return {kind: 'unknownType', envelope};
  }
  const body = decodeBody(envelope.t, envelope.body);
  return body.ok
    ? {kind: 'message', envelope, message: body.message}
    : {kind: 'invalid', reason: body.reason, envelope};
};

export const decodeBody = (
  type: MessageType,
  body: unknown,
): {ok: true; message: LinkMessage} | {ok: false; reason: string} => {
  const result = MESSAGE_SCHEMAS[type].safeParse(body);
  return result.success
    ? {ok: true, message: {type, body: result.data} as LinkMessage}
    : {ok: false, reason: `${type}: ${issueText(result.error)}`};
};

const issueText = (error: z.ZodError): string => {
  const issue = error.issues[0];
  if (!issue) {
    return 'invalid';
  }
  const path = issue.path.join('.');
  return `${path === '' ? '' : `${path}: `}${issue.message}`.slice(0, 200);
};
