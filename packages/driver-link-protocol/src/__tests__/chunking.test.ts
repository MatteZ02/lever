import linesFixture from '../../fixtures/lines.json';
import {Reassembler} from '../chunking.ts';
import {decodeDatagram, encodeDatagrams} from '../codec.ts';
import type {Envelope, OutgoingMessage} from '../codec.ts';
import type {PartBody} from '../messages.ts';

// Line colours are data; taken from a fixture (colour literals are linted).
const LINE_COLOR = linesFixture.body.lines[0].color;

const message: OutgoingMessage = {
  type: 'lines',
  body: {
    version: 'v7',
    lines: Array.from({length: 12}, (_, i) => ({
      id: `line-${i}`,
      name: `Linja ${i} – "ä"`,
      shortName: `L${i}`,
      color: LINE_COLOR,
      loop: i % 2 === 0,
      directional: false,
    })),
  },
};

const partsOf = (
  id = 'lvr-mi4iuyo7-79m345ruoa',
  seq = 50,
  msg: OutgoingMessage = message,
): {envelope: Envelope; part: PartBody}[] =>
  encodeDatagrams({id, seq, rel: true}, msg, {maxBytes: 300}).map((d) => {
    const decoded = decodeDatagram(d);
    if (decoded.kind !== 'part') {
      throw new Error(decoded.kind);
    }
    return {envelope: decoded.envelope, part: decoded.part};
  });

describe('Reassembler', () => {
  it('reassembles parts in any order, once each', () => {
    const parts = partsOf();
    expect(parts.length).toBeGreaterThan(3);
    const reassembler = new Reassembler();
    const order = [...parts].reverse();
    // A duplicate in the middle changes nothing.
    order.splice(2, 0, order[1]);
    const results = order.map((p) => reassembler.add(p.envelope, p.part, 0));
    expect(results.filter((r) => r.kind === 'complete')).toHaveLength(1);
    const last = results[results.length - 1];
    expect(last.kind).toBe('complete');
    if (last.kind === 'complete') {
      expect(last.envelope).toMatchObject({t: 'lines', seq: 50, rel: true});
      expect(last.message).toEqual({
        type: 'lines',
        body: {
          ...message.body,
          lines: (message.body as {lines: object[]}).lines.map((line) => ({
            ...line,
            directions: [],
            directionRequired: false,
          })),
        },
      });
    }
    expect(reassembler.size).toBe(0);
  });

  it('drops a message whose parts do not all arrive in time', () => {
    const parts = partsOf();
    const reassembler = new Reassembler({timeoutMs: 2000});
    parts
      .slice(0, -1)
      .forEach((p) => reassembler.add(p.envelope, p.part, 1000));
    expect(reassembler.size).toBe(1);
    expect(reassembler.prune(3001)).toBe(1);
    const last = parts[parts.length - 1];
    expect(reassembler.add(last.envelope, last.part, 3002).kind).toBe(
      'pending',
    );
  });

  it('keeps messages of different senders and ids apart', () => {
    const a = partsOf('thr-a-aaaaaaaa', 1);
    const b = partsOf('thr-b-bbbbbbbb', 1);
    const reassembler = new Reassembler();
    const results = a.flatMap((p, i) => [
      reassembler.add(p.envelope, p.part, 0),
      reassembler.add(b[i].envelope, b[i].part, 0),
    ]);
    expect(results.filter((r) => r.kind === 'complete')).toHaveLength(2);
  });

  it('refuses parts that do not match the first', () => {
    const [first, second] = partsOf();
    const reassembler = new Reassembler();
    reassembler.add(first.envelope, first.part, 0);
    expect(
      reassembler.add(
        second.envelope,
        {...second.part, count: second.part.count + 1},
        0,
      ),
    ).toEqual({kind: 'invalid', reason: 'parts do not match'});
    expect(reassembler.size).toBe(0);
  });

  it('limits messages in parts per sender', () => {
    const reassembler = new Reassembler({maxPendingPerSender: 2});
    const results = [1, 2, 3].map((seq) => {
      const [p] = partsOf('thr-a-aaaaaaaa', seq);
      return reassembler.add(p.envelope, p.part, 0);
    });
    expect(results.map((r) => r.kind)).toEqual([
      'pending',
      'pending',
      'invalid',
    ]);
    const [other] = partsOf('thr-b-bbbbbbbb', 1);
    expect(reassembler.add(other.envelope, other.part, 0).kind).toBe('pending');
  });

  it('limits the size of a reassembled message', () => {
    const reassembler = new Reassembler({maxMessageBytes: 500});
    const results = partsOf().map((p) =>
      reassembler.add(p.envelope, p.part, 0),
    );
    expect(results).toContainEqual({
      kind: 'invalid',
      reason: 'message too large',
    });
  });

  it('reports parts that are not JSON, invalid bodies and unknown types', () => {
    const envelope: Envelope = {
      p: 'lever-link',
      v: [1, 0],
      t: 'part',
      id: 'x',
      seq: 1,
      body: null,
    };
    const reassembler = new Reassembler();
    const add = (type: string, data: string, msgId: string) =>
      reassembler.add(envelope, {msgId, index: 0, count: 1, type, data}, 0);
    expect(add('lines', '{"version":', 'a').kind).toBe('invalid');
    expect(add('lines', '{"version":"v"}', 'b').kind).toBe('invalid');
    expect(add('thumbnail', '{"png":"…"}', 'c').kind).toBe('unknownType');
  });

  it('forgets a sender', () => {
    const parts = partsOf('thr-a-aaaaaaaa');
    const reassembler = new Reassembler();
    reassembler.add(parts[0].envelope, parts[0].part, 0);
    reassembler.forget('thr-a-aaaaaaaa');
    expect(reassembler.size).toBe(0);
  });
});
