import {lanXGetTurnoutInfo, toHex} from '@lever/z21-protocol';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AccessoryJob, AccessoryQueue, JobResult} from '../AccessoryQueue';

// Byte values: spec §5.2.1 (FAdr 4 = turnout #5, output 2) and
// packages/z21-protocol accessories tests.
const ACTIVATE_5_OUT2 = '09 00 40 00 53 00 04 89 DE';
const DEACTIVATE_5_OUT2 = '09 00 40 00 53 00 04 81 D6';
const ACTIVATE_3_OUT1 = '09 00 40 00 53 00 02 88 D9';
const DEACTIVATE_3_OUT1 = '09 00 40 00 53 00 02 80 D1';

const PULSE = 150;
const GAP = 100;

const switchJob = (
  fAdr: number,
  output: 0 | 1,
  pulseMs = PULSE,
): AccessoryJob => ({kind: 'switch', fAdr, output, pulseMs});

const setup = () => {
  const sent: {at: number; hex: string}[] = [];
  const started: AccessoryJob[] = [];
  const start = Date.now();
  const queue = new AccessoryQueue({
    send: (datasets) =>
      datasets.forEach((dataset) =>
        sent.push({at: Date.now() - start, hex: toHex(dataset)}),
      ),
    gapMs: GAP,
    onStart: (job) => started.push(job),
  });
  queue.setConnected(true);
  return {queue, sent, started, hexes: () => sent.map((entry) => entry.hex)};
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AccessoryQueue', () => {
  it('pulses a turnout: activate, pulse, deactivate', () => {
    const {queue, sent} = setup();
    const results: JobResult[] = [];
    queue.enqueue(switchJob(4, 1), (result) => results.push(result));

    expect(sent).toEqual([{at: 0, hex: ACTIVATE_5_OUT2}]);
    vi.advanceTimersByTime(PULSE - 1);
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sent[1]).toEqual({at: PULSE, hex: DEACTIVATE_5_OUT2});
    expect(results).toEqual(['sent']);
  });

  it('serialises commands with the gap between them; never two outputs active', () => {
    const {queue, sent} = setup();
    queue.enqueue(switchJob(4, 1));
    queue.enqueue(switchJob(2, 0));
    vi.advanceTimersByTime(1000);

    expect(sent).toEqual([
      {at: 0, hex: ACTIVATE_5_OUT2},
      {at: PULSE, hex: DEACTIVATE_5_OUT2},
      {at: PULSE + GAP, hex: ACTIVATE_3_OUT1},
      {at: PULSE + GAP + PULSE, hex: DEACTIVATE_3_OUT1},
    ]);
  });

  it('uses the per-job pulse duration, within limits', () => {
    const {queue, sent} = setup();
    queue.enqueue(switchJob(4, 1, 400));
    vi.advanceTimersByTime(399);
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sent).toHaveLength(2);

    queue.enqueue(switchJob(2, 0, 0)); // clamped to the minimum
    vi.advanceTimersByTime(GAP + 20);
    expect(sent.map((entry) => entry.at)).toEqual([0, 400, 500, 520]);
  });

  it('a newer switch for a waiting address replaces it in place', () => {
    const {queue, hexes} = setup();
    const results: string[] = [];
    queue.enqueue(switchJob(10, 0)); // running
    queue.enqueue(switchJob(4, 0), (result) => results.push(`a:${result}`));
    queue.enqueue(switchJob(2, 0));
    queue.enqueue(switchJob(4, 1), (result) => results.push(`b:${result}`));
    expect(queue.size()).toBe(2);
    vi.advanceTimersByTime(2000);

    expect(results).toEqual(['a:replaced', 'b:sent']);
    // Order kept: 10, then 4 (new position), then 2.
    expect(hexes()[2]).toBe(ACTIVATE_5_OUT2);
    expect(hexes()[4]).toBe(ACTIVATE_3_OUT1);
  });

  it('sends queries through the queue without duplicates (LOAD-3)', () => {
    const {queue, sent} = setup();
    for (const fAdr of [0, 1, 2, 1]) {
      queue.enqueue({
        kind: 'query',
        key: `turnout:${fAdr}`,
        dataset: lanXGetTurnoutInfo(fAdr),
      });
    }
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([
      {at: 0, hex: '08 00 40 00 43 00 00 43'},
      {at: GAP, hex: '08 00 40 00 43 00 01 42'},
      {at: 2 * GAP, hex: '08 00 40 00 43 00 02 41'},
    ]);
  });

  it('sends extended accessory values with the gap', () => {
    const {queue, sent} = setup();
    queue.enqueue({kind: 'extAccessory', rawAddress: 4, value: 5});
    queue.enqueue({kind: 'extAccessory', rawAddress: 5, value: 0});
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([
      {at: 0, hex: '0A 00 40 00 54 00 04 05 00 55'},
      {at: GAP, hex: '0A 00 40 00 54 00 05 00 00 51'},
    ]);
  });

  it('cancels waiting jobs; the running one completes its pulse (RTE-8)', () => {
    const {queue, hexes} = setup();
    const results: string[] = [];
    queue.enqueue(switchJob(4, 1), (result) => results.push(`4:${result}`));
    queue.enqueue(switchJob(2, 0), (result) => results.push(`2:${result}`));
    queue.cancel(() => true);
    vi.advanceTimersByTime(1000);

    expect(hexes()).toEqual([ACTIVATE_5_OUT2, DEACTIVATE_5_OUT2]);
    expect(results).toEqual(['2:cancelled', '4:sent']);
  });

  it('drops jobs while disconnected and never replays them', () => {
    const {queue, sent} = setup();
    const results: string[] = [];
    queue.enqueue(switchJob(4, 1));
    queue.enqueue(switchJob(2, 0), (result) => results.push(result));
    queue.setConnected(false);
    queue.enqueue(switchJob(6, 0), (result) => results.push(result));
    queue.setConnected(true);
    vi.advanceTimersByTime(1000);

    expect(results).toEqual(['dropped', 'dropped']);
    expect(sent.map((entry) => entry.hex)).not.toContain(ACTIVATE_3_OUT1);
  });

  it('sends a deactivate cut off by a connection loss first after reconnecting', () => {
    const {queue, hexes} = setup();
    queue.enqueue(switchJob(4, 1));
    queue.setConnected(false);
    vi.advanceTimersByTime(PULSE);
    expect(hexes()).toEqual([ACTIVATE_5_OUT2]);

    vi.advanceTimersByTime(5000);
    queue.setConnected(true);
    queue.enqueue(switchJob(2, 0));
    expect(hexes()).toEqual([
      ACTIVATE_5_OUT2,
      DEACTIVATE_5_OUT2,
      ACTIVATE_3_OUT1,
    ]);
  });

  it('reports each job when it starts', () => {
    const {queue, started} = setup();
    queue.enqueue(switchJob(4, 1));
    queue.enqueue(switchJob(2, 0));
    expect(started).toEqual([switchJob(4, 1)]);
    vi.advanceTimersByTime(PULSE + GAP);
    expect(started).toEqual([switchJob(4, 1), switchJob(2, 0)]);
  });
});
