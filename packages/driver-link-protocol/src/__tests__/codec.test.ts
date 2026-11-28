import linesFixture from '../../fixtures/lines.json';
import {
  decodeDatagram,
  encodeDatagrams,
  encodeMessage,
  LinkEncodeError,
  utf8ByteLength,
} from '../codec.ts';
import type {OutgoingMessage} from '../codec.ts';
import {LINK_LIMITS} from '../defaults.ts';
import {PROTOCOL_NAME} from '../version.ts';

// Line colours are data; taken from a fixture (colour literals are linted).
const LINE_COLOR = linesFixture.body.lines[0].color;

const header = {id: 'thr-mihdtmo7-5mx7o6cbe3', seq: 1000};

describe('utf8ByteLength', () => {
  it.each([
    ['', 0],
    ['abc', 3],
    ['ä', 2],
    ['€', 3],
    ['🚂', 4],
    ['Päärata 🚂 €', 18],
  ])('%j is %i bytes', (text, bytes) => {
    expect(utf8ByteLength(text)).toBe(bytes);
    expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).length);
  });

  it('counts a lone surrogate as the replacement character', () => {
    expect(utf8ByteLength('\ud800')).toBe(3);
    expect(utf8ByteLength('\ud800x')).toBe(4);
  });
});

describe('encodeMessage', () => {
  it('writes the envelope fields in order and leaves out absent ones', () => {
    expect(encodeMessage(header, {type: 'getLines', body: {}})).toBe(
      `{"p":"${PROTOCOL_NAME}","v":[1,0],"t":"getLines","id":"thr-mihdtmo7-5mx7o6cbe3","seq":1000,"body":{}}`,
    );
  });

  it('applies defaults and drops unknown fields', () => {
    const text = encodeMessage(header, {
      type: 'locos',
      body: {
        locos: [],
        extra: true,
      } as unknown as OutgoingMessage['body'],
    } as OutgoingMessage);
    expect(JSON.parse(text).body).toEqual({locos: [], consists: []});
  });

  it('refuses an invalid body', () => {
    expect(() =>
      encodeMessage(header, {
        type: 'setLine',
        body: {address: 0, lineId: 'line-pun'},
      }),
    ).toThrow(LinkEncodeError);
  });
});

describe('decodeDatagram', () => {
  it('drops a datagram over the size limit before parsing it', () => {
    const text = encodeMessage(header, {type: 'getLines', body: {}});
    expect(decodeDatagram(text, {maxBytes: 20})).toEqual({
      kind: 'tooLarge',
      bytes: text.length,
    });
  });

  it.each([
    ['', 'invalid'],
    ['garbage', 'invalid'],
    ['{"p":"lever-link"', 'invalid'],
    ['null', 'notLeverLink'],
    ['[1,2]', 'notLeverLink'],
    ['"lever-link"', 'notLeverLink'],
    ['{"t":"hello"}', 'notLeverLink'],
    ['{"p":"lever-link","v":"1.0"}', 'invalid'],
    ['{"p":"lever-link","v":[1]}', 'invalid'],
    ['{"p":"lever-link","v":[1,0],"t":"hello","id":"x","seq":-1}', 'invalid'],
    ['{"p":"lever-link","v":[1,0],"t":"hello","id":"x","seq":1}', 'invalid'],
    [
      '{"p":"lever-link","v":[1,0],"t":"part","id":"x","seq":1,"body":{"msgId":"a","index":3,"count":2,"type":"lines","data":""}}',
      'invalid',
    ],
  ])('%j is %s', (text, kind) => {
    expect(decodeDatagram(text).kind).toBe(kind);
  });

  it('reports a major mismatch even when the rest is unreadable', () => {
    expect(decodeDatagram('{"p":"lever-link","v":[3,1]}')).toEqual({
      kind: 'versionMismatch',
      version: [3, 1],
      id: undefined,
      seq: undefined,
    });
  });

  it('reads an older minor version', () => {
    const text = encodeMessage(header, {type: 'bye', body: {}}, [1, 0]);
    expect(decodeDatagram(text).kind).toBe('message');
  });

  it('keeps the envelope of a message', () => {
    const text = encodeMessage(
      {...header, ses: 'ses-miit871j-1ggvfov4g0', rel: true, ts: 5},
      {type: 'setLine', body: {address: 3, lineId: null}},
    );
    const result = decodeDatagram(text);
    expect(result.kind).toBe('message');
    if (result.kind === 'message') {
      expect(result.envelope).toMatchObject({
        ses: 'ses-miit871j-1ggvfov4g0',
        rel: true,
        ts: 5,
        seq: 1000,
      });
    }
  });
});

describe('encodeDatagrams', () => {
  const bigLines = (count: number, name: string): OutgoingMessage => ({
    type: 'lines',
    body: {
      version: 'v1',
      lines: Array.from({length: count}, (_, i) => ({
        id: `line-${i}`,
        name: `${name} ${i}`,
        shortName: `L${i}`,
        color: LINE_COLOR,
        loop: false,
        directional: false,
      })),
    },
  });

  it('sends a small message as one datagram', () => {
    expect(encodeDatagrams(header, {type: 'bye', body: {}})).toHaveLength(1);
  });

  it.each([
    ['ASCII', 'Line'],
    ['Finnish letters', 'Päärata – pohjoinen'],
    ['quotes and backslashes', 'A "quoted" \\ name'],
    ['emoji', 'Juna 🚂🚃🚃'],
    ['control characters', 'tab\there\nnewline'],
  ])('splits a large message (%s) into parts that fit', (_label, name) => {
    for (const maxBytes of [300, 401, 577, 1200]) {
      const message = bigLines(40, name);
      const datagrams = encodeDatagrams(header, message, {maxBytes});
      expect(datagrams.length).toBeGreaterThan(1);
      for (const datagram of datagrams) {
        expect(utf8ByteLength(datagram)).toBeLessThanOrEqual(maxBytes);
        const decoded = decodeDatagram(datagram, {maxBytes});
        expect(decoded.kind).toBe('part');
        if (decoded.kind === 'part') {
          expect(decoded.envelope.seq).toBe(header.seq);
          expect(decoded.part.count).toBe(datagrams.length);
          expect(decoded.part.type).toBe('lines');
        }
      }
      const joined = datagrams
        .map((d) => JSON.parse(d).body.data as string)
        .join('');
      expect(JSON.parse(joined)).toEqual(
        JSON.parse(encodeMessage(header, message)).body,
      );
    }
  });

  it('never splits a surrogate pair', () => {
    const datagrams = encodeDatagrams(header, bigLines(30, '🚂🚂🚂🚂🚂'), {
      maxBytes: 300,
    });
    for (const datagram of datagrams) {
      const data = JSON.parse(datagram).body.data as string;
      expect(/^[\udc00-\udfff]/.test(data)).toBe(false);
      expect(/[\ud800-\udbff]$/.test(data)).toBe(false);
    }
  });

  it('refuses a message needing more than the maximum of parts', () => {
    expect(() =>
      encodeDatagrams(header, bigLines(64, 'x'.repeat(100)), {maxBytes: 250}),
    ).toThrow(LinkEncodeError);
    expect(LINK_LIMITS.maxParts).toBe(64);
  });

  it('refuses a limit too small for a part header', () => {
    expect(() =>
      encodeDatagrams(header, bigLines(5, 'x'), {maxBytes: 100}),
    ).toThrow(LinkEncodeError);
  });
});
