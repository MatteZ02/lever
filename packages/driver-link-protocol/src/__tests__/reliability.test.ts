import {initialSeq, ResendQueue, SeenSequences} from '../reliability.ts';

describe('ResendQueue', () => {
  it('resends with a doubling interval up to the maximum', () => {
    const queue = new ResendQueue<string>({resendMs: 500, resendMaxMs: 8000});
    queue.add(1, 'line:3', 'datagram', 0);
    const times: number[] = [];
    for (let now = 0; now <= 40000; now += 50) {
      if (queue.due(now).length > 0) {
        times.push(now);
      }
    }
    expect(times.slice(0, 7)).toEqual([
      500, 1500, 3500, 7500, 15500, 23500, 31500,
    ]);
  });

  it('stops when acknowledged', () => {
    const queue = new ResendQueue<string>();
    queue.add(1, 'a', 'x', 0);
    expect(queue.ack(1)).toBe(true);
    expect(queue.ack(1)).toBe(false);
    expect(queue.due(10000)).toEqual([]);
    expect(queue.nextDueAt()).toBeUndefined();
  });

  it('replaces an older message about the same subject', () => {
    const queue = new ResendQueue<string>({resendMs: 500});
    queue.add(1, 'line:3', 'old', 0);
    queue.add(2, 'line:4', 'other', 0);
    queue.add(3, 'line:3', 'new', 100);
    expect(queue.size).toBe(2);
    expect(queue.nextDueAt()).toBe(500);
    expect(queue.due(600).map((e) => e.payload)).toEqual(['other', 'new']);
    queue.removeSubject('line:4');
    queue.clear();
    expect(queue.size).toBe(0);
  });
});

describe('SeenSequences', () => {
  it('lets each id + seq through once', () => {
    const seen = new SeenSequences();
    expect(seen.firstTime('a', 1)).toBe(true);
    expect(seen.firstTime('a', 1)).toBe(false);
    expect(seen.firstTime('b', 1)).toBe(true);
    expect(seen.firstTime('a', 2)).toBe(true);
  });

  it('remembers a bounded number of seqs and senders', () => {
    const seen = new SeenSequences({perSender: 3, maxSenders: 2});
    [1, 2, 3, 4].forEach((seq) => seen.firstTime('a', seq));
    expect(seen.firstTime('a', 1)).toBe(true); // forgotten
    expect(seen.firstTime('a', 4)).toBe(false);
    seen.firstTime('b', 1);
    seen.firstTime('c', 1); // evicts a, heard longest ago
    expect(seen.firstTime('b', 1)).toBe(false);
    expect(seen.firstTime('a', 4)).toBe(true);
    seen.forget('b');
    expect(seen.firstTime('b', 1)).toBe(true);
  });

  it('starts seqs at the clock', () => {
    expect(initialSeq(1764331234567.8)).toBe(1764331234567);
    expect(initialSeq(-5)).toBe(0);
  });
});
