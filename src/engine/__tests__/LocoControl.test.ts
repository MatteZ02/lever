import {describe, expect, it} from 'vitest';
import {Loco, locoSchema} from '../../model/locos';
import {LOCO_TICK_MS, LocoControl} from '../LocoControl';

// 100 km/h at step 126; braking and acceleration 10 km/h per second.
const loco: Loco = locoSchema.parse({
  id: 'l1',
  name: 'Dm12',
  address: 3,
  maxSpeedKmh: 126,
  acceleration: 10,
  braking: 10,
});

const setup = () => {
  const sent: {speed: number; forward: boolean}[] = [];
  let timer: (() => void) | null = null;
  const control = new LocoControl({
    drive: ({speed, forward}) => sent.push({speed, forward}),
    schedule: (_ms, run) => {
      timer = run;
      return () => {
        timer = null;
      };
    },
  });
  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += LOCO_TICK_MS) {
      const run = timer;
      timer = null;
      run?.();
    }
  };
  return {control, sent, advance};
};

describe('loco control (Levels 3 and 4)', () => {
  it('given a target, it accelerates along the loco ramp', () => {
    const {control, sent, advance} = setup();
    control.setTarget(loco, {kmh: 20, forward: true});
    advance(1000);
    // 10 km/h per s: 2 km/h (= 2 steps) per 200 ms tick.
    expect(sent.map((s) => s.speed)).toEqual([2, 4, 6, 8, 10]);
    advance(2000);
    expect(sent.at(-1)).toEqual({speed: 20, forward: true});
  });

  it('given a held train its driver runs at 50 km/h, it brakes to 0 (no emergency stop)', () => {
    const {control, sent, advance} = setup();
    control.reported({
      address: 3,
      forward: true,
      speed: 50,
      emergencyStop: false,
    });
    control.setTarget(loco, {kmh: 0});
    advance(LOCO_TICK_MS);
    expect(sent).toEqual([{speed: 48, forward: true}]);
    advance(6000);
    expect(sent.at(-1)).toEqual({speed: 0, forward: true});
  });

  it('when the driver accelerates a held train again, the stop is re-asserted', () => {
    const {control, sent, advance} = setup();
    control.setTarget(loco, {kmh: 0});
    advance(1000);
    // Speed not known yet: asserted once.
    expect(sent).toEqual([{speed: 0, forward: true}]);
    sent.length = 0;
    control.reported({
      address: 3,
      forward: true,
      speed: 30,
      emergencyStop: false,
    });
    advance(LOCO_TICK_MS);
    expect(sent).toEqual([{speed: 28, forward: true}]);
  });

  it('reverses only at standstill', () => {
    const {control, sent, advance} = setup();
    control.reported({
      address: 3,
      forward: true,
      speed: 4,
      emergencyStop: false,
    });
    control.setTarget(loco, {kmh: 4, forward: false});
    advance(1000);
    expect(sent.slice(0, 3)).toEqual([
      {speed: 2, forward: true},
      {speed: 0, forward: false},
      {speed: 2, forward: false},
    ]);
  });

  it('without a target, Lever sends nothing', () => {
    const {control, sent, advance} = setup();
    control.setTarget(loco, {kmh: 10, forward: true});
    control.setTarget(loco, null);
    advance(1000);
    expect(sent).toEqual([]);
  });
});
