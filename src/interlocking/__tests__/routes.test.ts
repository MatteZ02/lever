// Scenario tests for Level 2 routes in the interlocking (RTE-4 – RTE-8,
// MULTI-4) and mixed Level 1 / Level 2 areas (MIX-4, MIX-6, MIX-8):
// "given this layout and state, when X happens, then Y".
import {describe, expect, it} from 'vitest';
import {AccessoryJob} from '../../connection/AccessoryQueue';
import {projectWith, track, turnout} from '../../model/__tests__/testLayouts';
import {DiagramElement, Signal} from '../../model/elements';
import {AutomationLevel, Project} from '../../model/project';
import {Interlocking, InterlockingNotice} from '../Interlocking';

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
          .filter((t) => !t.cancelled && t.at <= end)
          .sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        now = next.at;
        next.cancelled = true;
        next.run();
      }
      now = end;
      timers = timers.filter((t) => !t.cancelled);
    },
  };
};

const signal = (
  id: string,
  at: [number, number],
  facing: 'E' | 'W',
  address: number,
): Signal => ({
  kind: 'signal',
  id,
  name: id,
  at: {x: at[0], y: at[1]},
  facing,
  side: 'right',
  signalTypeId: 'builtin:main2',
  control: {kind: 'dcc', addresses: [address], invert: false},
});

const dcc = (address: number) => ({
  control: {kind: 'dcc' as const, addresses: [address], invert: false},
});

// A passing loop (see model/__tests__/routing.test.ts): S1 (address 11)
// enters, T1 (1) and T2 (2), exit signals S3 (13) and S4 (14).
const loopElements = (): DiagramElement[] => [
  {kind: 'connector', id: 'C1', name: '', at: {x: 0, y: 0}, direction: 'W'},
  track('in', [0, 0], [4, 0]),
  signal('S1', [2, 0], 'E', 11),
  turnout('T1', [5, 0], {type: 'right', orientation: 'E', ...dcc(1)}),
  track('t1', [6, 0], [14, 0]),
  signal('S3', [12, 0], 'E', 13),
  track('t2', [6, 1], [7, 2], [13, 2], [14, 1]),
  signal('S4', [12, 2], 'E', 14),
  turnout('T2', [15, 0], {type: 'left', orientation: 'W', ...dcc(2)}),
  track('out', [16, 0], [20, 0]),
  {kind: 'connector', id: 'C2', name: '', at: {x: 20, y: 0}, direction: 'E'},
];

// The station at `level`; optionally track 2 and T2 in a second area.
const layout = (
  level: AutomationLevel = 2,
  options: {lineLevel?: AutomationLevel; manualT2?: boolean} = {},
): Project => {
  const base = projectWith(
    ...loopElements().map((element) => {
      let next = element;
      if (options.manualT2 && next.id === 'T2') {
        next = {...next, control: {kind: 'manual'}} as DiagramElement;
      }
      if (options.lineLevel !== undefined && ['t2', 'T2'].includes(next.id)) {
        next = {...next, areaId: 'line'};
      }
      return next;
    }),
  );
  const areas = base.areas.map((area) => ({...area, level}));
  if (options.lineLevel !== undefined) {
    areas.push({id: 'line', name: 'Line', level: options.lineLevel});
  }
  return {...base, areas};
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
  // Start-up: both turnouts reported straight (output 1), signals at stop.
  for (const fAdr of [0, 1, 10, 12, 13]) {
    interlocking.accessoryReport(fAdr, 'output1', true);
  }
  // The central unit reports every switched output.
  const reportJobs = () => {
    for (const job of jobs.splice(0)) {
      if (job.kind === 'switch') {
        if (job.tag) interlocking.jobStarted(job.tag);
        interlocking.accessoryReport(
          job.fAdr,
          job.output === 0 ? 'output1' : 'output2',
          false,
        );
      }
    }
  };
  const route = () => Object.values(interlocking.state().routes)[0];
  const signalOutputs = (from: AccessoryJob[]) =>
    from.flatMap((job) =>
      job.kind === 'switch' && job.tag?.startsWith('S')
        ? [`${job.tag}:${job.output}`]
        : [],
    );
  return {interlocking, clock, jobs, notices, reportJobs, route, signalOutputs};
};

describe('setting a route (RTE-4, RTE-5)', () => {
  it('throws the turnouts, is "setting" until they report, then sets its signals', () => {
    const {interlocking, jobs, reportJobs, route, signalOutputs} =
      setup(layout());
    interlocking.setRoute('S1', 'S4', []);
    expect(route().state).toBe('setting');
    expect(jobs).toMatchObject([{kind: 'switch', fAdr: 0, output: 1}]);
    expect(signalOutputs(jobs)).toEqual([]);

    reportJobs();
    expect(route().state).toBe('set');
    // S1 to proceed (output 2 = wire 1); S4, the end, to stop: its
    // start-up report may be a default, so stop is sent, not assumed.
    expect(signalOutputs(jobs)).toEqual(['S1:1', 'S4:0']);
  });

  it('does not throw turnouts already confirmed in place', () => {
    const {interlocking, jobs, reportJobs, route} = setup(layout());
    interlocking.accessoryReport(0, 'output1', false); // T1 seen straight
    interlocking.accessoryReport(1, 'output1', false); // T2 seen straight
    interlocking.setRoute('S1', 'C2', []);
    expect(
      jobs.filter((j) => j.kind === 'switch' && j.tag?.startsWith('T')),
    ).toEqual([]);
    expect(route().state).toBe('set');
    reportJobs();
  });

  it('given a manual turnout, waits for the operator to confirm it', () => {
    const {interlocking, reportJobs, route} = setup(
      layout(2, {manualT2: true}),
    );
    // Via track 2: T2 (manual) must be diverging.
    interlocking.setRoute('S4', 'C2', []);
    reportJobs();
    expect(route()).toMatchObject({
      state: 'awaitingManual',
      manualToSet: ['T2'],
    });
    interlocking.confirmManualTurnouts(route().id);
    reportJobs();
    expect(route().state).toBe('set');
    expect(interlocking.state().turnouts['T2']).toEqual({
      position: 'diverging',
      status: 'manual',
    });
  });

  it('given a turnout that does not move, the route fails and can be cancelled (RTE-8)', () => {
    const {interlocking, clock, jobs, notices, route} = setup(layout());
    interlocking.setRoute('S1', 'S4', []);
    // The queue sends, but the central unit never reports.
    const started = () => {
      for (const job of jobs.splice(0)) {
        if (job.kind !== 'query' && job.tag) interlocking.jobStarted(job.tag);
      }
    };
    for (let i = 0; i < 6; i++) {
      started();
      clock.advance(5000);
    }
    expect(route()).toMatchObject({state: 'failed', failedTurnoutId: 'T1'});
    expect(notices).toContainEqual(
      expect.objectContaining({code: 'routeFailed', elementId: 'T1'}),
    );
    interlocking.cancelRoute(route().id);
    expect(interlocking.state().routes).toEqual({});
  });
});

describe('a set route that changes (RTE-6c, MULTI-4)', () => {
  it('when another client throws one of its turnouts, its signals go to stop and it is broken', () => {
    const {interlocking, jobs, notices, reportJobs, route, signalOutputs} =
      setup(layout());
    interlocking.setRoute('S1', 'S4', []);
    reportJobs();
    expect(route().state).toBe('set');
    jobs.splice(0);

    interlocking.accessoryReport(0, 'output1', false); // T1 back to straight
    expect(route()).toMatchObject({state: 'broken', brokenTurnoutId: 'T1'});
    expect(signalOutputs(jobs)).toEqual(['S1:0']); // S1 to stop
    expect(notices).toContainEqual(
      expect.objectContaining({code: 'routeBroken', elementId: 'T1'}),
    );
  });

  it('the same when this operator throws it (Level 2 does not lock)', () => {
    const {interlocking, reportJobs, route} = setup(layout());
    interlocking.setRoute('S1', 'S4', []);
    reportJobs();
    interlocking.command({
      type: 'setTurnout',
      elementId: 'T1',
      position: 'straight',
    });
    reportJobs();
    expect(route().state).toBe('broken');
  });
});

describe('releasing and undoing (RTE-6, RTE-6b)', () => {
  it('releasing sets the signals to stop and keeps the turnouts', () => {
    const {interlocking, jobs, reportJobs, route, signalOutputs} =
      setup(layout());
    interlocking.setRoute('S1', 'S4', []);
    reportJobs();
    jobs.splice(0);
    interlocking.releaseRoute(route().id);
    expect(signalOutputs(jobs)).toEqual(['S1:0']);
    expect(
      jobs.filter((j) => j.kind === 'switch' && j.tag?.startsWith('T')),
    ).toEqual([]);
    expect(interlocking.state().routes).toEqual({});
  });

  it('undo puts the turnouts back, except one moved since', () => {
    const {interlocking, jobs, notices, reportJobs} = setup(layout());
    interlocking.setRoute('S1', 'S4', []);
    reportJobs();
    interlocking.undoRoute();
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({tag: 'S1', output: 0}),
        expect.objectContaining({tag: 'T1', fAdr: 0, output: 0}),
      ]),
    );
    expect(notices).toContainEqual(
      expect.objectContaining({code: 'routeUndone', skipped: []}),
    );
    reportJobs();

    // Set again; then someone else moves T1 before the undo.
    interlocking.setRoute('S1', 'S4', []);
    reportJobs();
    interlocking.accessoryReport(0, 'output1', false);
    jobs.splice(0);
    interlocking.undoRoute();
    expect(jobs.filter((j) => j.kind === 'switch' && j.tag === 'T1')).toEqual(
      [],
    );
    expect(notices).toContainEqual(
      expect.objectContaining({code: 'routeUndone', skipped: ['T1']}),
    );
  });
});

describe('mixed Level 1 and Level 2 areas (MIX-4, MIX-6, MIX-8)', () => {
  it('given a Level 1 station, routes are refused there', () => {
    const {interlocking, notices} = setup(layout(1));
    interlocking.setRoute('S1', 'C2', []);
    expect(interlocking.state().routes).toEqual({});
    expect(notices).toContainEqual({
      code: 'routeRefused',
      reason: 'needsLevel2',
    });
  });

  it('a route from a Level 2 area into a Level 1 area is set normally there', () => {
    const {interlocking, reportJobs, route} = setup(layout(2, {lineLevel: 1}));
    interlocking.setRoute('S1', 'C2', ['S4']);
    // Through track 2 (the Level 1 line): both areas listed.
    expect(route().areas.map((a) => `${a.name}:${a.level}`)).toEqual([
      'Test:2',
      'Line:1',
    ]);
    reportJobs();
    expect(route().state).toBe('set');
    // A turnout in the Level 1 part breaks the route too (RTE-6c).
    interlocking.accessoryReport(1, 'output1', false);
    expect(route().state).toBe('broken');
  });

  it('lowering the station to Level 1 while a route is set moves nothing (MIX-6)', () => {
    const {interlocking, jobs, reportJobs, route} = setup(layout());
    interlocking.setRoute('S1', 'S4', []);
    reportJobs();
    jobs.splice(0);
    interlocking.load(layout(1));
    expect(jobs).toEqual([]);
    expect(route().state).toBe('set');
  });

  it('a route over an area at a level not built yet is refused', () => {
    const {interlocking, notices} = setup(layout(2, {lineLevel: 3}));
    interlocking.setRoute('S1', 'C2', ['S4']);
    expect(notices).toContainEqual({
      code: 'routeRefused',
      reason: 'levelNotAvailable',
    });
  });
});
