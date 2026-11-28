// Runs every fixture in ../../fixtures through the decoder. Throttle runs the
// same file over its copy, so both apps read every message the same way.
// Each fixture is a datagram written out as pretty JSON; it is sent compact.
import ackFromLever from '../../fixtures/ack-from-lever.json';
import ackFromThrottle from '../../fixtures/ack-from-throttle.json';
import bye from '../../fixtures/bye.json';
import driverViewAuto from '../../fixtures/driverView-auto.json';
import driverViewNoTrain from '../../fixtures/driverView-noTrain.json';
import driverView from '../../fixtures/driverView.json';
import errorVersionMismatch from '../../fixtures/error-versionMismatch.json';
import getLines from '../../fixtures/getLines.json';
import helloPlainAddress from '../../fixtures/hello-plain-address.json';
import hello from '../../fixtures/hello.json';
import invalidAddressZero from '../../fixtures/invalid-address-zero.json';
import invalidEnvelopeNoSeq from '../../fixtures/invalid-envelope-no-seq.json';
import invalidNotLeverLink from '../../fixtures/invalid-not-lever-link.json';
import invalidStepBeyondMode from '../../fixtures/invalid-step-beyond-mode.json';
import linesPart1 from '../../fixtures/lines-part-1.json';
import linesPart10 from '../../fixtures/lines-part-10.json';
import linesPart2 from '../../fixtures/lines-part-2.json';
import linesPart3 from '../../fixtures/lines-part-3.json';
import linesPart4 from '../../fixtures/lines-part-4.json';
import linesPart5 from '../../fixtures/lines-part-5.json';
import linesPart6 from '../../fixtures/lines-part-6.json';
import linesPart7 from '../../fixtures/lines-part-7.json';
import linesPart8 from '../../fixtures/lines-part-8.json';
import linesPart9 from '../../fixtures/lines-part-9.json';
import lines from '../../fixtures/lines.json';
import lineStatusOneStation from '../../fixtures/lineStatus-oneStation.json';
import lineStatusPart1 from '../../fixtures/lineStatus-part-1.json';
import lineStatusPart2 from '../../fixtures/lineStatus-part-2.json';
import locos from '../../fixtures/locos.json';
import locoStateEStop from '../../fixtures/locoState-eStop.json';
import locoState from '../../fixtures/locoState.json';
import majorNewer from '../../fixtures/major-newer.json';
import minorNewerHello from '../../fixtures/minor-newer-hello.json';
import minorNewerLineStatus from '../../fixtures/minor-newer-lineStatus.json';
import minorNewerUnknownType from '../../fixtures/minor-newer-unknown-type.json';
import noticeAutomationStopped from '../../fixtures/notice-automationStopped.json';
import noticeLocoConflict from '../../fixtures/notice-locoConflict.json';
import setLineClear from '../../fixtures/setLine-clear.json';
import setLine from '../../fixtures/setLine.json';
import stripConflict from '../../fixtures/strip-conflict.json';
import strip from '../../fixtures/strip.json';
import welcome from '../../fixtures/welcome.json';
import {Reassembler} from '../chunking.ts';
import {decodeDatagram, encodeDatagrams, utf8ByteLength} from '../codec.ts';
import type {DecodedDatagram} from '../codec.ts';
import {LINK_DEFAULTS} from '../defaults.ts';
import {
  LEVER_MESSAGE_TYPES,
  MESSAGE_SCHEMAS,
  THROTTLE_MESSAGE_TYPES,
} from '../messages.ts';
import type {MessageType} from '../messages.ts';

type Expect =
  | {kind: 'message'; type: MessageType; from: 'throttle' | 'lever'}
  | {kind: 'unknownType' | 'versionMismatch' | 'notLeverLink' | 'invalid'};

// One entry per fixture file. A new fixture must be added here.
const SINGLE: [string, unknown, Expect][] = [
  ['hello', hello, {kind: 'message', type: 'hello', from: 'throttle'}],
  [
    'hello-plain-address',
    helloPlainAddress,
    {kind: 'message', type: 'hello', from: 'throttle'},
  ],
  ['locos', locos, {kind: 'message', type: 'locos', from: 'throttle'}],
  [
    'locoState',
    locoState,
    {kind: 'message', type: 'locoState', from: 'throttle'},
  ],
  [
    'locoState-eStop',
    locoStateEStop,
    {kind: 'message', type: 'locoState', from: 'throttle'},
  ],
  ['setLine', setLine, {kind: 'message', type: 'setLine', from: 'throttle'}],
  [
    'setLine-clear',
    setLineClear,
    {kind: 'message', type: 'setLine', from: 'throttle'},
  ],
  ['getLines', getLines, {kind: 'message', type: 'getLines', from: 'throttle'}],
  [
    'ack-from-throttle',
    ackFromThrottle,
    {kind: 'message', type: 'ack', from: 'throttle'},
  ],
  ['bye', bye, {kind: 'message', type: 'bye', from: 'throttle'}],
  ['welcome', welcome, {kind: 'message', type: 'welcome', from: 'lever'}],
  ['lines', lines, {kind: 'message', type: 'lines', from: 'lever'}],
  ['strip', strip, {kind: 'message', type: 'strip', from: 'lever'}],
  [
    'strip-conflict',
    stripConflict,
    {kind: 'message', type: 'strip', from: 'lever'},
  ],
  [
    'lineStatus-oneStation',
    lineStatusOneStation,
    {kind: 'message', type: 'lineStatus', from: 'lever'},
  ],
  [
    'driverView',
    driverView,
    {kind: 'message', type: 'driverView', from: 'lever'},
  ],
  [
    'driverView-auto',
    driverViewAuto,
    {kind: 'message', type: 'driverView', from: 'lever'},
  ],
  [
    'driverView-noTrain',
    driverViewNoTrain,
    {kind: 'message', type: 'driverView', from: 'lever'},
  ],
  [
    'notice-locoConflict',
    noticeLocoConflict,
    {kind: 'message', type: 'notice', from: 'lever'},
  ],
  [
    'notice-automationStopped',
    noticeAutomationStopped,
    {kind: 'message', type: 'notice', from: 'lever'},
  ],
  [
    'error-versionMismatch',
    errorVersionMismatch,
    {kind: 'message', type: 'error', from: 'lever'},
  ],
  [
    'ack-from-lever',
    ackFromLever,
    {kind: 'message', type: 'ack', from: 'lever'},
  ],
  [
    'minor-newer-hello',
    minorNewerHello,
    {kind: 'message', type: 'hello', from: 'throttle'},
  ],
  [
    'minor-newer-lineStatus',
    minorNewerLineStatus,
    {kind: 'message', type: 'lineStatus', from: 'lever'},
  ],
  ['minor-newer-unknown-type', minorNewerUnknownType, {kind: 'unknownType'}],
  ['major-newer', majorNewer, {kind: 'versionMismatch'}],
  ['invalid-not-lever-link', invalidNotLeverLink, {kind: 'notLeverLink'}],
  ['invalid-step-beyond-mode', invalidStepBeyondMode, {kind: 'invalid'}],
  ['invalid-envelope-no-seq', invalidEnvelopeNoSeq, {kind: 'invalid'}],
  ['invalid-address-zero', invalidAddressZero, {kind: 'invalid'}],
];

// Messages sent in parts, in order.
const CHUNKED: [string, unknown[], MessageType][] = [
  ['lineStatus', [lineStatusPart1, lineStatusPart2], 'lineStatus'],
  [
    'lines (400-byte datagrams)',
    [
      linesPart1,
      linesPart2,
      linesPart3,
      linesPart4,
      linesPart5,
      linesPart6,
      linesPart7,
      linesPart8,
      linesPart9,
      linesPart10,
    ],
    'lines',
  ],
];

const decode = (fixture: unknown): DecodedDatagram =>
  decodeDatagram(JSON.stringify(fixture), {
    maxBytes: LINK_DEFAULTS.maxDatagramBytes,
  });

describe('fixtures', () => {
  it.each(SINGLE)('%s decodes as expected', (_name, fixture, expected) => {
    const result = decode(fixture);
    expect(result.kind).toBe(expected.kind);
    if (expected.kind === 'message' && result.kind === 'message') {
      expect(result.message.type).toBe(expected.type);
      const allowed: readonly string[] =
        expected.from === 'throttle'
          ? THROTTLE_MESSAGE_TYPES
          : LEVER_MESSAGE_TYPES;
      expect(allowed).toContain(expected.type);
    }
  });

  it.each(SINGLE.filter(([name]) => !name.startsWith('invalid')))(
    '%s fits one datagram',
    (_name, fixture) => {
      expect(utf8ByteLength(JSON.stringify(fixture))).toBeLessThanOrEqual(
        LINK_DEFAULTS.maxDatagramBytes,
      );
    },
  );

  it.each(SINGLE.filter(([, , e]) => e.kind === 'message'))(
    '%s re-encodes to the same message',
    (_name, fixture) => {
      const first = decode(fixture);
      if (first.kind !== 'message') {
        throw new Error('not a message');
      }
      const [again] = encodeDatagrams(
        {
          id: first.envelope.id,
          ses: first.envelope.ses,
          seq: first.envelope.seq,
          rel: first.envelope.rel,
          ts: first.envelope.ts,
        },
        first.message,
        {maxBytes: 64 * 1024},
      );
      const second = decodeDatagram(again);
      expect(second.kind).toBe('message');
      if (second.kind === 'message') {
        expect(second.message).toEqual(first.message);
      }
    },
  );

  it.each(CHUNKED)('%s reassembles', (_name, parts, type) => {
    const reassembler = new Reassembler();
    const results = parts.map((part, index) => {
      const decoded = decode(part);
      if (decoded.kind !== 'part') {
        throw new Error(`part ${index} is ${decoded.kind}`);
      }
      return reassembler.add(decoded.envelope, decoded.part, 1000 + index);
    });
    expect(results.slice(0, -1).every((r) => r.kind === 'pending')).toBe(true);
    const last = results[results.length - 1];
    expect(last.kind).toBe('complete');
    if (last.kind === 'complete') {
      expect(last.message.type).toBe(type);
      expect(last.envelope.t).toBe(type);
    }
  });

  it('cover every message type', () => {
    const covered = new Set(
      [
        ...SINGLE.map(([, , e]) => (e.kind === 'message' ? e.type : '')),
        ...CHUNKED.map(([, , type]) => type),
      ].filter(Boolean),
    );
    expect([...covered].sort()).toEqual(Object.keys(MESSAGE_SCHEMAS).sort());
  });

  describe('minor-newer messages', () => {
    it('drop unknown fields and keep known ones', () => {
      const result = decode(minorNewerHello);
      if (result.kind !== 'message' || result.message.type !== 'hello') {
        throw new Error('not a hello');
      }
      const body = result.message.body;
      expect(body).not.toHaveProperty('pairing');
      expect(body.device).not.toHaveProperty('model');
      expect(body.device.appVersion).toBe('1.4.0');
      expect(body.capabilities).toContain('requests');
      // An unknown throttle kind claims the least: a plain address.
      expect(body.throttles[1].kind).toBe('address');
    });

    it('read unknown states as the value that claims least', () => {
      const result = decode(minorNewerLineStatus);
      if (result.kind !== 'message' || result.message.type !== 'lineStatus') {
        throw new Error('not a lineStatus');
      }
      const [passage] = result.message.body.passages;
      expect(passage.leadsTo).toEqual({kind: 'unknown'});
      expect(passage.turnouts[0].certainty).toBe('unknown');
      expect(passage.turnouts[1].certainty).toBe('confirmed');
      expect(passage.signals[0].aspect).toBe('unknown');
      expect(passage.routes[0].state).toBe('unconfirmed');
    });
  });

  it('a major-newer message gives its version and sender', () => {
    expect(decode(majorNewer)).toEqual({
      kind: 'versionMismatch',
      version: [2, 0],
      id: 'thr-mihdtmo7-5mx7o6cbe3',
      seq: 1764331300003,
    });
  });
});
