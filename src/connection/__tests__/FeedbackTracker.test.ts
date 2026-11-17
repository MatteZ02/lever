import {decodeDatagram, fromHex, toHex} from '@lever/z21-protocol';
import {describe, expect, it} from 'vitest';
import {
  broadcastFlagsFor,
  FeedbackTracker,
  feedbackStartupQueries,
} from '../FeedbackTracker';

const feed = (tracker: FeedbackTracker, hex: string, now = 1000) =>
  decodeDatagram(fromHex(hex)).flatMap((message) =>
    tracker.handle(message, now),
  );

describe('broadcast flags and startup queries', () => {
  it('subscribes only to the configured sources', () => {
    expect(broadcastFlagsFor([])).toBe(0x00000001);
    expect(broadcastFlagsFor(['rbus'])).toBe(0x00000003);
    expect(broadcastFlagsFor(['loconet', 'can'])).toBe(0x08080001);
  });

  it('asks each configured source for its status', () => {
    expect(feedbackStartupQueries([])).toEqual([]);
    expect(
      feedbackStartupQueries(['rbus', 'loconet', 'can']).map((job) =>
        job.kind === 'query' ? toHex(job.dataset) : '',
      ),
    ).toEqual([
      '05 00 81 00 00',
      '05 00 81 00 01',
      '07 00 A4 00 80 00 00',
      '07 00 C4 00 00 00 D0',
    ]);
  });
});

describe('FeedbackTracker', () => {
  it('given an R-Bus report, reports every input first, then only changes', () => {
    const tracker = new FeedbackTracker();
    // Spec §7.1 example: module 11 input 1, module 13 inputs 1, 3, 7, 8.
    const first = feed(tracker, '0F 00 80 00 01 01 00 C5 00 00 00 00 00 00 00');
    expect(first).toHaveLength(80);
    expect(
      first.filter((state) => state.occupied).map((state) => state.key),
    ).toEqual([
      'rbus:11:1',
      'rbus:13:1',
      'rbus:13:3',
      'rbus:13:7',
      'rbus:13:8',
    ]);

    // Same report again: nothing changed.
    expect(
      feed(tracker, '0F 00 80 00 01 01 00 C5 00 00 00 00 00 00 00'),
    ).toEqual([]);

    // Module 11 input 1 released.
    const changes = feed(
      tracker,
      '0F 00 80 00 01 00 00 C5 00 00 00 00 00 00 00',
      2000,
    );
    expect(changes).toEqual([
      {
        key: 'rbus:11:1',
        input: {source: 'rbus', module: 11, input: 1},
        occupied: false,
        locos: [],
        overload: 0,
        changedAt: 2000,
      },
    ]);
  });

  it('given LocoNet detector reports, tracks occupancy and transponders', () => {
    const tracker = new FeedbackTracker();
    expect(feed(tracker, '08 00 A4 00 01 05 00 01')).toMatchObject([
      {key: 'loconet:5', occupied: true},
    ]);
    // Transponder 3 enters block 5, then exits.
    expect(feed(tracker, '09 00 A4 00 02 05 00 03 00')).toMatchObject([
      {key: 'loconet:5', occupied: true, locos: [{address: 3}]},
    ]);
    expect(feed(tracker, '09 00 A4 00 03 05 00 03 00')).toMatchObject([
      {locos: []},
    ]);
    expect(feed(tracker, '08 00 A4 00 01 05 00 00')).toMatchObject([
      {occupied: false},
    ]);
  });

  it('given CAN detector reports, tracks occupancy, overload and RailCom locos', () => {
    const tracker = new FeedbackTracker();
    // NId 0x1234, module 1, port 3: occupied with voltage.
    expect(
      feed(tracker, '0E 00 C4 00 34 12 01 00 03 01 00 11 00 00'),
    ).toMatchObject([
      {key: 'can:1:3', occupied: true, overload: 0, networkId: 0x1234},
    ]);
    // Overload 2.
    expect(
      feed(tracker, '0E 00 C4 00 34 12 01 00 03 01 02 12 00 00'),
    ).toMatchObject([{occupied: true, overload: 2}]);
    // Loco list: 3 forward, 210 backwards.
    expect(
      feed(tracker, '0E 00 C4 00 34 12 01 00 03 11 03 80 D2 C0'),
    ).toMatchObject([
      {
        locos: [
          {address: 3, forward: true},
          {address: 210, forward: false},
        ],
      },
    ]);
    // A new list replaces the old one.
    expect(
      feed(tracker, '0E 00 C4 00 34 12 01 00 03 11 00 00 00 00'),
    ).toMatchObject([{locos: []}]);
  });

  it('ignores unrelated messages and forgets everything on clear', () => {
    const tracker = new FeedbackTracker();
    expect(feed(tracker, '07 00 40 00 81 00 81')).toEqual([]);
    feed(tracker, '08 00 A4 00 01 05 00 01');
    expect(tracker.all()).toHaveLength(1);
    tracker.clear();
    expect(tracker.all()).toEqual([]);
  });
});
