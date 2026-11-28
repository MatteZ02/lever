// Scenario tests: given a layout and state, when something happens, then …
// (ARC-L2). Time is a fake clock; commands are collected instead of sent.
import {describe, expect, it} from 'vitest';
import {AccessoryJob} from '../../connection/AccessoryQueue';
import {
  point,
  projectWith,
  track,
  turnout,
} from '../../model/__tests__/testLayouts';
import {DiagramElement, Signal} from '../../model/elements';
import {Project} from '../../model/project';
import {
  CHECK_REPLY_MS,
  Interlocking,
  InterlockingNotice,
} from '../Interlocking';

const fakeClock = () => {
  let now = 0;
  let timers: {at: number; run: () => void; cancelled: boolean}[] = [];
  return {
    schedule: (ms: number, run: () => void) => {
      const timer = {at: now + ms, run, cancelled: false};
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    advance: (ms: number) => {
      const end = now + ms;
      for (;;) {
        const next = timers
          .filter((timer) => !timer.cancelled && timer.at <= end)
          .sort((a, b) => a.at - b.at)[0];
        if (!next) {
          break;
        }
        now = next.at;
        next.cancelled = true;
        next.run();
      }
      now = end;
      timers = timers.filter((timer) => !timer.cancelled);
    },
  };
};

const setup = (project: Project) => {
  const clock = fakeClock();
  const jobs: AccessoryJob[] = [];
  const notices: InterlockingNotice[] = [];
  const interlocking = new Interlocking({
    enqueue: (job) => jobs.push(job),
    schedule: clock.schedule,
    onChange: () => undefined,
    onNotice: (notice) => notices.push(notice),
  });
  interlocking.load(project);
  // The engine starts each job and tells the interlocking.
  const startJobs = () => {
    for (const job of jobs.splice(0)) {
      if (job.kind !== 'query' && job.tag) {
        interlocking.jobStarted(job.tag);
      }
    }
  };
  return {interlocking, clock, jobs, notices, startJobs};
};

const dccTurnout = (address: number) =>
  turnout('T', [3, 0], {
    control: {kind: 'dcc', addresses: [address], invert: false},
  });

describe('turnouts (ACC-2)', () => {
  it('given no reports, the position is unknown', () => {
    const {interlocking} = setup(projectWith(dccTurnout(5)));
    expect(interlocking.state().turnouts['T']).toEqual({status: 'unknown'});
  });

  it('given a start-up report, the position is shown as reported, not confirmed', () => {
    const {interlocking} = setup(projectWith(dccTurnout(5)));
    interlocking.accessoryReport(4, 'output1', true);
    expect(interlocking.state().turnouts['T']).toEqual({
      position: 'straight',
      status: 'reported',
    });
  });

  it('when thrown, it is commanded until the central unit reports it, then confirmed', () => {
    const {interlocking, jobs} = setup(projectWith(dccTurnout(5)));
    interlocking.accessoryReport(4, 'output1', true);
    interlocking.command({
      type: 'setTurnout',
      elementId: 'T',
      position: 'diverging',
    });

    expect(jobs).toMatchObject([
      {kind: 'switch', fAdr: 4, output: 1, tag: 'T'},
    ]);
    expect(interlocking.state().turnouts['T']).toEqual({
      position: 'straight',
      status: 'commanded',
      commanded: 'diverging',
    });

    interlocking.accessoryReport(4, 'output2', false);
    expect(interlocking.state().turnouts['T']).toEqual({
      position: 'diverging',
      status: 'confirmed',
    });
  });

  it('when another client throws it, the change is followed and confirmed (MULTI-1)', () => {
    const {interlocking} = setup(projectWith(dccTurnout(5)));
    interlocking.accessoryReport(4, 'output2', false);
    expect(interlocking.state().turnouts['T']).toEqual({
      position: 'diverging',
      status: 'confirmed',
    });
  });

  it('when no report comes, it retries once, then reports failure', () => {
    const {interlocking, jobs, notices, clock, startJobs} = setup(
      projectWith(dccTurnout(5)),
    );
    interlocking.command({
      type: 'setTurnout',
      elementId: 'T',
      position: 'diverging',
    });
    startJobs();
    clock.advance(2000);
    expect(jobs).toHaveLength(1); // the retry
    expect(interlocking.state().turnouts['T'].status).toBe('retrying');
    startJobs();
    clock.advance(2000);
    expect(interlocking.state().turnouts['T'].status).toBe('failed');
    expect(notices).toEqual([{code: 'failed', elementId: 'T'}]);
  });

  it('when the retry works, it is confirmed', () => {
    const {interlocking, clock, startJobs} = setup(projectWith(dccTurnout(5)));
    interlocking.command({
      type: 'setTurnout',
      elementId: 'T',
      position: 'diverging',
    });
    startJobs();
    clock.advance(2000);
    interlocking.accessoryReport(4, 'output2', false);
    expect(interlocking.state().turnouts['T']).toEqual({
      position: 'diverging',
      status: 'confirmed',
    });
  });

  it('given a central unit that never reports, "assume" confirms after the retry', () => {
    const project = projectWith(dccTurnout(5));
    project.settings.centralUnit.confirmation = 'assume';
    const {interlocking, clock, startJobs} = setup(project);
    interlocking.command({
      type: 'setTurnout',
      elementId: 'T',
      position: 'diverging',
    });
    startJobs();
    clock.advance(2000);
    startJobs();
    clock.advance(2000);
    expect(interlocking.state().turnouts['T']).toEqual({
      position: 'diverging',
      status: 'confirmed',
    });
  });

  it('given a manual turnout, the operator records the position; nothing is sent (ACC-5)', () => {
    const {interlocking, jobs} = setup(projectWith(turnout('M', [3, 0])));
    expect(interlocking.state().turnouts['M']).toEqual({status: 'unknown'});
    interlocking.command({
      type: 'setTurnout',
      elementId: 'M',
      position: 'diverging',
    });
    expect(jobs).toEqual([]);
    expect(interlocking.state().turnouts['M']).toEqual({
      position: 'diverging',
      status: 'manual',
    });
  });

  it('reports a turnout without an address as incomplete', () => {
    const {interlocking, notices} = setup(
      projectWith(
        turnout('T', [3, 0], {
          control: {kind: 'dcc', addresses: [], invert: false},
        }),
      ),
    );
    interlocking.command({
      type: 'setTurnout',
      elementId: 'T',
      position: 'diverging',
    });
    expect(notices).toEqual([
      {code: 'incomplete', elementId: 'T', reason: 'missingAddress'},
    ]);
  });

  it('when the connection is lost, positions become unknown; recorded ones stay (MULTI-3)', () => {
    const {interlocking} = setup(
      projectWith(dccTurnout(5), turnout('M', [9, 0])),
    );
    interlocking.accessoryReport(4, 'output2', false);
    interlocking.command({
      type: 'setTurnout',
      elementId: 'M',
      position: 'straight',
    });
    interlocking.connectionLost();
    expect(interlocking.state().turnouts['T']).toEqual({status: 'unknown'});
    expect(interlocking.state().turnouts['M']).toEqual({
      position: 'straight',
      status: 'manual',
    });
  });
});

describe('restoring last known positions (ACC-4)', () => {
  const layout = () =>
    projectWith(
      dccTurnout(5),
      turnout('U', [9, 0], {
        control: {kind: 'dcc', addresses: [6], invert: false},
      }),
      turnout('M', [15, 0], {control: {kind: 'manual'}}),
    );

  it('commands addressed turnouts through the queue, skipping manual ones', () => {
    // Given a start-up report that may be a default of the central unit
    const {interlocking, jobs} = setup(layout());
    interlocking.accessoryReport(4, 'output1', true);
    // When the saved positions are restored
    interlocking.restoreTurnouts({
      T: 'straight',
      U: 'diverging',
      M: 'diverging',
    });
    // Then both addressed turnouts are commanded (a report is not trusted)
    expect(jobs).toMatchObject([
      {kind: 'switch', fAdr: 4, output: 0, tag: 'T'},
      {kind: 'switch', fAdr: 5, output: 1, tag: 'U'},
    ]);
    // And the manual turnout is not recorded as checked by the operator
    expect(interlocking.state().turnouts['M']).toEqual({status: 'unknown'});
  });

  it('leaves turnouts already confirmed in that position, and unknown positions', () => {
    const {interlocking, jobs} = setup(layout());
    interlocking.accessoryReport(4, 'output2', false);
    interlocking.restoreTurnouts({T: 'diverging', U: 'left'});
    expect(jobs).toEqual([]);
  });
});

describe('position feedback (ACC-3)', () => {
  const withFeedback = () => {
    const project = projectWith(
      turnout('T', [3, 0], {
        control: {kind: 'dcc', addresses: [5], invert: false},
        positionFeedback: {
          straight: {source: 'rbus', module: 1, input: 1},
          diverging: {source: 'rbus', module: 1, input: 2},
        },
      }),
    );
    return setup(project);
  };
  const input = (n: number, occupied: boolean) => ({
    key: `rbus:1:${n}`,
    input: {source: 'rbus' as const, module: 1, input: n},
    occupied,
    locos: [],
    overload: 0,
    changedAt: 0,
  });

  it('confirms a position the feedback agrees with', () => {
    const {interlocking} = withFeedback();
    interlocking.accessoryReport(4, 'output1', true);
    interlocking.feedbackChanged([input(1, true)]);
    expect(interlocking.state().turnouts['T']).toEqual({
      position: 'straight',
      status: 'confirmed',
      feedback: 'straight',
    });
  });

  it('flags a mismatch between reported and fed-back position', () => {
    const {interlocking} = withFeedback();
    interlocking.accessoryReport(4, 'output1', false);
    interlocking.feedbackChanged([input(2, true)]);
    expect(interlocking.state().turnouts['T']).toMatchObject({
      position: 'straight',
      status: 'mismatch',
      feedback: 'diverging',
    });
  });
});

describe('signals (SIG-3, MULTI-2)', () => {
  const signal = (control: Signal['control']): DiagramElement => ({
    kind: 'signal',
    id: 'S',
    name: '',
    at: point(2, 0),
    facing: 'E',
    side: 'right',
    signalTypeId: 'builtin:main3',
    control,
  });

  it('sets an aspect and confirms it from the reported outputs', () => {
    const {interlocking, jobs} = setup(
      projectWith(
        track('t', [0, 0], [5, 0]),
        signal({kind: 'dcc', addresses: [10, 11], invert: false}),
      ),
    );
    interlocking.command({
      type: 'setSignal',
      elementId: 'S',
      aspectId: 'reduced',
    });
    expect(
      jobs.map((job) => job.kind === 'switch' && [job.fAdr, job.output]),
    ).toEqual([
      [9, 1],
      [10, 1],
    ]);
    interlocking.accessoryReport(9, 'output2', false);
    expect(interlocking.state().signals['S'].status).toBe('commanded');
    interlocking.accessoryReport(10, 'output2', false);
    expect(interlocking.state().signals['S']).toEqual({
      aspect: 'reduced',
      status: 'confirmed',
    });
  });

  it('records the aspect of a signal that is not connected', () => {
    const {interlocking} = setup(
      projectWith(track('t', [0, 0], [5, 0]), signal({kind: 'manual'})),
    );
    interlocking.command({
      type: 'setSignal',
      elementId: 'S',
      aspectId: 'proceed',
    });
    expect(interlocking.state().signals['S']).toEqual({
      aspect: 'proceed',
      status: 'manual',
    });
  });
});

describe('blocks and feedback (BLK-1–BLK-4)', () => {
  const blockProject = (inputs: Project['blocks'][number]['inputs']) => {
    const project = projectWith({
      ...track('t', [0, 0], [5, 0]),
      blockId: 'B',
    } as DiagramElement);
    return {...project, blocks: [{id: 'B', name: 'Track 1', inputs}]};
  };
  const loconet = (occupied: boolean) => ({
    key: 'loconet:5',
    input: {source: 'loconet' as const, address: 5},
    occupied,
    locos: occupied ? [{address: 3}] : [],
    overload: 0,
    changedAt: 0,
  });

  it('shows occupation at once and release only after the delay', () => {
    const {interlocking, clock} = setup(
      blockProject([{source: 'loconet', address: 5}]),
    );
    interlocking.feedbackChanged([loconet(true)]);
    expect(interlocking.state().blocks['B']).toMatchObject({
      occupied: true,
      locos: [{address: 3}],
    });

    interlocking.feedbackChanged([loconet(false)]);
    expect(interlocking.state().blocks['B']).toMatchObject({
      occupied: true,
      releasing: true,
    });
    clock.advance(999);
    expect(interlocking.state().blocks['B'].occupied).toBe(true);
    clock.advance(1);
    expect(interlocking.state().blocks['B']).toMatchObject({
      occupied: false,
      releasing: false,
    });
  });

  it('ignores a short drop-out shorter than the delay', () => {
    const {interlocking, clock} = setup(
      blockProject([{source: 'loconet', address: 5}]),
    );
    interlocking.feedbackChanged([loconet(true)]);
    interlocking.feedbackChanged([loconet(false)]);
    clock.advance(300);
    interlocking.feedbackChanged([loconet(true)]);
    clock.advance(5000);
    expect(interlocking.state().blocks['B']).toMatchObject({
      occupied: true,
      releasing: false,
    });
  });

  it('allows train labels only on blocks with feedback', () => {
    const withInputs = setup(blockProject([{source: 'loconet', address: 5}]));
    withInputs.interlocking.setTrainLabel('B', ' IC 1234 ');
    expect(withInputs.interlocking.state().blocks['B'].label).toBe('IC 1234');
    withInputs.interlocking.setTrainLabel('B', null);
    expect(withInputs.interlocking.state().blocks['B'].label).toBeUndefined();

    const without = setup(blockProject([]));
    without.interlocking.setTrainLabel('B', 'IC 1');
    expect(without.notices).toEqual([
      {code: 'labelNeedsFeedback', blockId: 'B'},
    ]);
  });
});

describe('mixed levels (ARC-L1)', () => {
  it('given a Level 3 area, a turnout in no route is thrown by hand as usual', () => {
    const project = projectWith(dccTurnout(5));
    const area = project.areas.find((a) => a.id === project.views[0].areaId)!;
    area.level = 3;
    const {interlocking, jobs, notices} = setup(project);
    interlocking.command({
      type: 'setTurnout',
      elementId: 'T',
      position: 'diverging',
    });
    expect(jobs).toHaveLength(1);
    expect(notices).toEqual([]);
  });
});

describe('signals at Level 2 (set by routes only)', () => {
  const withSignal = (level: 1 | 2) => {
    const project = projectWith(track('t', [0, 0], [5, 0]), {
      kind: 'signal',
      id: 'S',
      name: '',
      at: point(2, 0),
      facing: 'E',
      side: 'right',
      signalTypeId: 'builtin:main2',
      control: {kind: 'dcc', addresses: [20], invert: false},
    });
    project.areas.forEach((area) => (area.level = level));
    return project;
  };

  it('given a Level 2 area, the operator cannot set a signal by hand', () => {
    const {interlocking, jobs, notices} = setup(withSignal(2));
    interlocking.command({
      type: 'setSignal',
      elementId: 'S',
      aspectId: 'proceed',
    });
    expect(jobs).toEqual([]);
    expect(notices).toEqual([
      {code: 'refused', elementId: 'S', reason: 'signalNeedsRoute'},
    ]);
  });

  it('a route may set it, and at Level 1 the operator may', () => {
    const {interlocking, jobs} = setup(withSignal(2));
    interlocking.command(
      {type: 'setSignal', elementId: 'S', aspectId: 'proceed'},
      'route',
    );
    expect(jobs).toHaveLength(1);
    const level1 = setup(withSignal(1));
    level1.interlocking.command({
      type: 'setSignal',
      elementId: 'S',
      aspectId: 'proceed',
    });
    expect(level1.jobs).toHaveLength(1);
  });
});

describe('position refresh (DR5000: changes by other programs)', () => {
  it('given a known position, when a refresh reply differs, then the change is followed and confirmed', () => {
    const {interlocking} = setup(projectWith(dccTurnout(5)));
    interlocking.accessoryReport(4, 'output1', true);
    // WinDigipet throws it; the DR5000 tells nobody. The refresh asks:
    interlocking.accessoryReport(4, 'output2', true);
    expect(interlocking.state().turnouts['T']).toEqual({
      position: 'diverging',
      status: 'confirmed',
    });
  });

  it('given a start-up position, when a refresh reply is the same, then it stays reported', () => {
    const {interlocking} = setup(projectWith(dccTurnout(5)));
    interlocking.accessoryReport(4, 'output1', true);
    interlocking.accessoryReport(4, 'output1', true);
    expect(interlocking.state().turnouts['T']).toEqual({
      position: 'straight',
      status: 'reported',
    });
  });

  it('lists the addresses drawn in a view', () => {
    const {interlocking} = setup(projectWith(dccTurnout(5)));
    expect(interlocking.addressesOfViews(new Set(['v']))).toEqual([4]);
    expect(interlocking.addressesOfViews(new Set(['other']))).toEqual([]);
  });
});

describe('a lost report (DR5000: replies sent to the wrong client)', () => {
  const setupWithQuery = () => {
    const queried: number[] = [];
    const clock = fakeClock();
    const jobs: AccessoryJob[] = [];
    const notices: InterlockingNotice[] = [];
    const interlocking = new Interlocking({
      enqueue: (job) => jobs.push(job),
      schedule: clock.schedule,
      onChange: () => undefined,
      onNotice: (notice) => notices.push(notice),
      query: (fAdr) => queried.push(fAdr),
    });
    interlocking.load(projectWith(dccTurnout(5)));
    // Known: straight. The operator throws it to diverging.
    interlocking.accessoryReport(4, 'output1', true);
    interlocking.command({
      type: 'setTurnout',
      elementId: 'T',
      position: 'diverging',
    });
    const startJobs = () => {
      for (const job of jobs.splice(0)) {
        if (job.kind !== 'query' && job.tag) {
          interlocking.jobStarted(job.tag);
        }
      }
    };
    startJobs();
    return {interlocking, clock, jobs, notices, queried, startJobs};
  };

  it('given no report, when the check finds it moved, then it is confirmed and not sent again', () => {
    const {interlocking, clock, jobs, queried} = setupWithQuery();
    clock.advance(2000);
    expect(queried).toEqual([4]);
    expect(jobs).toEqual([]);

    interlocking.accessoryReport(4, 'output2', true); // the check's answer
    expect(interlocking.state().turnouts['T']).toEqual({
      position: 'diverging',
      status: 'confirmed',
    });
    clock.advance(10000);
    expect(jobs).toEqual([]);
  });

  it('given the check finds it has not moved, then it is sent again', () => {
    const {interlocking, clock, jobs, startJobs} = setupWithQuery();
    clock.advance(2000);
    interlocking.accessoryReport(4, 'output1', true);
    clock.advance(CHECK_REPLY_MS);
    expect(jobs).toMatchObject([{kind: 'switch', fAdr: 4, output: 1}]);
    expect(interlocking.state().turnouts['T'].status).toBe('retrying');

    startJobs();
    interlocking.accessoryReport(4, 'output2', false);
    expect(interlocking.state().turnouts['T']).toEqual({
      position: 'diverging',
      status: 'confirmed',
    });
  });

  it('given it really does not move, then it fails in the position the central unit reports', () => {
    const {interlocking, clock, notices, queried, startJobs} = setupWithQuery();
    clock.advance(2000);
    interlocking.accessoryReport(4, 'output1', true);
    clock.advance(CHECK_REPLY_MS);
    startJobs(); // the second try
    clock.advance(2000);
    expect(queried).toEqual([4, 4]);
    interlocking.accessoryReport(4, 'output1', true);
    clock.advance(CHECK_REPLY_MS);

    expect(interlocking.state().turnouts['T']).toEqual({
      position: 'straight',
      status: 'failed',
    });
    expect(notices).toEqual([{code: 'failed', elementId: 'T'}]);
  });
});
