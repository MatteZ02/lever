import {describe, expect, it} from 'vitest';
import {AccessoryStateStore, isUnconfirmed} from './accessoryState';

describe('AccessoryStateStore', () => {
  it('given nothing reported, knows nothing', () => {
    const store = new AccessoryStateStore();
    expect(store.get(4)).toBeUndefined();
  });

  it('when commanded, shows the command as unconfirmed until reported', () => {
    const store = new AccessoryStateStore();
    const commanded = store.commanded(4, 1, 100);
    expect(commanded).toEqual({
      fAdr: 4,
      reported: 'unknown',
      commanded: 1,
      updatedAt: 100,
    });
    expect(isUnconfirmed(commanded)).toBe(true);

    const confirmed = store.reported(4, 'output2', 110);
    expect(confirmed.commanded).toBeNull();
    expect(isUnconfirmed(confirmed)).toBe(false);
  });

  it('when another client switches, follows the report (MULTI-1)', () => {
    const store = new AccessoryStateStore();
    store.reported(4, 'output1', 100);
    store.commanded(4, 1, 200);
    // A report for the other output wins over our command (ARC-2).
    expect(store.reported(4, 'output1', 210)).toMatchObject({
      reported: 'output1',
      commanded: null,
    });
  });

  it('keeps "not switched yet" as a report, not as a position', () => {
    const store = new AccessoryStateStore();
    const state = store.reported(0, 'notSwitched', 1);
    expect(state.reported).toBe('notSwitched');
  });

  it('stores extended accessory values; "data unknown" has no value', () => {
    const store = new AccessoryStateStore();
    expect(store.extReported(4, 0, false, 1).value).toBeUndefined();
    expect(store.extReported(4, 16, true, 2).value).toBe(16);
  });

  it('forgets everything when the connection is lost (MULTI-3)', () => {
    const store = new AccessoryStateStore();
    store.reported(4, 'output1', 1);
    store.extReported(4, 16, true, 1);
    store.clear();
    expect(store.all()).toEqual([]);
    expect(store.allExt()).toEqual([]);
  });
});
