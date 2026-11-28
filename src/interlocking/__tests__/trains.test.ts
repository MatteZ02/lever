// Scenario tests for trains (following occupancy), Level 3 protection and
// Level 4 automatic driving (section 9, MIX-8): "given this layout and
// state, when X happens, then Y".
import {describe, expect, it} from 'vitest';
import {AccessoryJob} from '../../connection/AccessoryQueue';
import {projectWith, track} from '../../model/__tests__/testLayouts';
import {DiagramElement} from '../../model/elements';
import {Loco, locoSchema} from '../../model/locos';
import {AutomationLevel, Project} from '../../model/project';
import {Interlocking, InterlockingNotice} from '../Interlocking';
import {LocoTarget} from '../trains';

// Four blocks in a row, west to east: A [0..4], B [4..8], C [8..12],
// D [12..16], each with a LocoNet detector (addresses 1–4).
const BLOCKS = ['A', 'B', 'C', 'D'];
const line = (level: AutomationLevel, clearAhead = 1): Project => {
  const project = projectWith(
    ...BLOCKS.map(
      (id, i) =>
        ({
          ...track(`t${id}`, [i * 4, 0], [i * 4 + 4, 0]),
          blockId: id,
        }) as DiagramElement,
    ),
  );
  return {
    ...project,
    areas: project.areas.map((area) => ({...area, level})),
    settings: {...project.settings, blocksClearAhead: clearAhead},
    blocks: BLOCKS.map((id, i) => ({
      id,
      name: id,
      inputs: [{source: 'loconet' as const, address: i + 1}],
    })),
    locos: [
      locoSchema.parse({
        id: 'L',
        name: 'Dm12',
        address: 3,
        cruiseKmh: 60,
        approachKmh: 20,
      }),
    ],
  };
};

const setup = (project: Project) => {
  let now = 0;
  const timers: {at: number; run: () => void}[] = [];
  const targets: (LocoTarget | null)[] = [];
  const notices: InterlockingNotice[] = [];
  const jobs: AccessoryJob[] = [];
  // The loco as the central unit reports it.
  const loco = {kmh: 0, forward: true as boolean | undefined};
  const interlocking = new Interlocking({
    enqueue: (job) => jobs.push(job),
    schedule: (ms, run) => {
      const timer = {at: now + ms, run};
      timers.push(timer);
      return () => {
        timers.splice(timers.indexOf(timer), 1);
      };
    },
    onChange: () => undefined,
    onNotice: (notice) => notices.push(notice),
    setLocoTarget: (_loco: Loco, target) => targets.push(target),
    locoSpeed: () => loco.kmh,
    locoForward: () => loco.forward,
    now: () => now,
  });
  interlocking.load(project);
  const advance = (ms: number) => {
    now += ms;
    for (const timer of timers.filter((t) => t.at <= now)) {
      timers.splice(timers.indexOf(timer), 1);
      timer.run();
    }
  };
  const detector = (block: string, occupied: boolean) => {
    const address = BLOCKS.indexOf(block) + 1;
    interlocking.feedbackChanged([
      {
        key: `loconet:${address}`,
        input: {source: 'loconet', address},
        occupied,
        locos: [],
        overload: 0,
        changedAt: now,
      },
    ]);
    if (!occupied) {
      advance(5000); // release delay
    }
  };
  const train = () => Object.values(interlocking.state().trains)[0];
  // IC 1 with loco L in A, then driven into B: its direction is known.
  const trainInB = () => {
    detector('A', true);
    interlocking.setTrainLabel('A', 'IC 1');
    interlocking.assignTrainLoco(train().id, 'L');
    detector('B', true);
    detector('A', false);
  };
  return {
    interlocking,
    targets,
    notices,
    loco,
    detector,
    train,
    trainInB,
    advance,
  };
};

describe('trains follow occupancy', () => {
  it('given a train number on a block, when the next block is occupied, the train moves on', () => {
    const {interlocking, detector, train} = setup(line(1));
    detector('A', true);
    interlocking.setTrainLabel('A', 'IC 1');
    detector('B', true);
    expect(train().blockIds).toEqual(['B', 'A']);
    detector('A', false);
    expect(train()).toMatchObject({blockIds: ['B'], directionKnown: true});
    // The block label follows.
    expect(interlocking.state().blocks['B'].label).toBe('IC 1');
    expect(interlocking.state().blocks['A'].label).toBeUndefined();
  });

  it('occupancy no train explains stays unlabelled', () => {
    const {interlocking, detector, train} = setup(line(1));
    detector('A', true);
    interlocking.setTrainLabel('A', 'IC 1');
    detector('D', true);
    expect(train().blockIds).toEqual(['A']);
    expect(interlocking.state().blocks['D'].label).toBeUndefined();
  });

  it('when its last block is freed with nowhere to go, the train is lost', () => {
    const {interlocking, detector, notices} = setup(line(1));
    detector('A', true);
    interlocking.setTrainLabel('A', 'IC 1');
    detector('A', false);
    expect(interlocking.state().trains).toEqual({});
    expect(notices).toContainEqual(
      expect.objectContaining({code: 'trainLost', name: 'IC 1'}),
    );
  });
});

describe('Level 3: automatic train stop', () => {
  it('given 2 free blocks needed and D occupied, the train in B is braked to 0', () => {
    const {detector, targets, train, trainInB, notices} = setup(line(3, 2));
    detector('D', true);
    trainInB();
    expect(train().hold).toBe('occupiedAhead');
    expect(targets.at(-1)).toEqual({kmh: 0});
    expect(notices).toContainEqual(
      expect.objectContaining({code: 'trainHeld', reason: 'occupiedAhead'}),
    );
  });

  it('when the block ahead is free again, the hold ends and the driver has the loco', () => {
    const {detector, targets, train, trainInB} = setup(line(3, 2));
    detector('D', true);
    trainInB();
    detector('D', false);
    expect(train().hold).toBeUndefined();
    expect(targets.at(-1)).toBeNull();
  });

  it('given 1 free block needed, D occupied does not hold a train in B', () => {
    const {detector, train, trainInB} = setup(line(3, 1));
    detector('D', true);
    trainInB();
    expect(train().hold).toBeUndefined();
  });

  it('the track ending ahead holds a train in the last block', () => {
    const {detector, train, trainInB} = setup(line(3, 1));
    trainInB();
    detector('C', true);
    detector('B', false);
    detector('D', true);
    detector('C', false);
    expect(train()).toMatchObject({blockIds: ['D'], hold: 'endOfTrack'});
  });

  it('a driver reversing out of the stop is not held', () => {
    const {detector, loco, interlocking, train, trainInB} = setup(line(3, 2));
    detector('D', true);
    trainInB();
    loco.forward = false;
    interlocking.locosChanged();
    expect(train().hold).toBeUndefined();
  });

  it('at Level 2 nothing is held', () => {
    const {detector, train, trainInB} = setup(line(2, 2));
    detector('D', true);
    trainInB();
    expect(train().hold).toBeUndefined();
  });
});

describe('Level 4: automatic driving', () => {
  it('drives a train to its destination: route, cruise, approach, stop, release', () => {
    const {interlocking, detector, loco, targets, train, trainInB, notices} =
      setup(line(4, 1));
    trainInB();
    interlocking.driveTrain(train().id, 'D');
    // The route is set at once (no turnouts); the train cruises ahead.
    expect(Object.values(interlocking.state().routes)).toHaveLength(1);
    expect(targets.at(-1)).toEqual({kmh: 60, forward: true});
    loco.kmh = 60;
    // In C, D is next: approach speed.
    detector('C', true);
    detector('B', false);
    expect(targets.at(-1)).toEqual({kmh: 20, forward: true});
    // In D: brake to 0.
    detector('D', true);
    expect(targets.at(-1)).toEqual({kmh: 0, forward: true});
    expect(train().auto?.state).toBe('stopping');
    // Stands: arrived, route released. D is the end of the track, so Level
    // 3 protection keeps it held there (at 0).
    loco.kmh = 0;
    interlocking.locosChanged();
    expect(train().auto).toBeUndefined();
    expect(interlocking.state().routes).toEqual({});
    expect(train().hold).toBe('endOfTrack');
    expect(targets.at(-1)).toEqual({kmh: 0});
    expect(notices).toContainEqual(
      expect.objectContaining({code: 'trainArrived', blockId: 'D'}),
    );
  });

  it('given the way is occupied, it waits and starts once it is free', () => {
    const {interlocking, detector, targets, train, trainInB} = setup(
      line(4, 1),
    );
    detector('D', true);
    trainInB();
    interlocking.driveTrain(train().id, 'D');
    expect(train().auto).toMatchObject({state: 'waiting', reason: 'occupied'});
    expect(targets.at(-1)).toEqual({kmh: 0, forward: true});
    detector('D', false);
    expect(train().auto?.state).toBe('running');
  });

  it('pausing automation brakes the train; resuming drives on', () => {
    const {interlocking, targets, train, trainInB} = setup(line(4, 1));
    trainInB();
    interlocking.driveTrain(train().id, 'D');
    interlocking.setAutomationPaused(true);
    expect(targets.at(-1)).toEqual({kmh: 0, forward: true});
    expect(train().auto?.reason).toBe('paused');
    interlocking.setAutomationPaused(false);
    expect(targets.at(-1)).toEqual({kmh: 60, forward: true});
  });

  it('stopping a train brakes it, then leaves it to its driver', () => {
    const {interlocking, loco, targets, train, trainInB} = setup(line(4, 1));
    trainInB();
    interlocking.driveTrain(train().id, 'D');
    loco.kmh = 60;
    interlocking.stopTrain(train().id);
    expect(targets.at(-1)).toEqual({kmh: 0});
    expect(interlocking.state().routes).toEqual({});
    loco.kmh = 0;
    interlocking.locosChanged();
    expect(targets.at(-1)).toBeNull();
  });

  it('a train whose direction is not known yet does not start', () => {
    const {interlocking, detector, train} = setup(line(4, 1));
    detector('B', true);
    interlocking.setTrainLabel('B', 'IC 1');
    interlocking.assignTrainLoco(train().id, 'L');
    interlocking.driveTrain(train().id, 'D');
    expect(train().auto?.reason).toBe('directionUnknown');
  });

  it('only inside Level 4 areas (MIX-7)', () => {
    const {interlocking, train, trainInB} = setup(line(3, 1));
    trainInB();
    interlocking.driveTrain(train().id, 'D');
    expect(train().auto?.reason).toBe('notLevel4');
  });
});
