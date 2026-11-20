// Scenario tests for Level 2 routes in the interlocking (RTE-4 – RTE-8,
// MULTI-4) and mixed Level 1 / Level 2 areas (MIX-4, MIX-6, MIX-8):
// "given this layout and state, when X happens, then Y".
import {describe, expect, it} from 'vitest';
import {AccessoryJob} from '../../connection/AccessoryQueue';
import {projectWith, track, turnout} from '../../model/__tests__/testLayouts';
import {DiagramElement, Signal, Turnout} from '../../model/elements';
import {step} from '../../model/geometry';
import {turnoutPorts} from '../../model/ports';
import {AutomationLevel, Project} from '../../model/project';
import {routeConflict} from '../../model/routeConflicts';
import {findRoutes} from '../../model/routing';
import {buildProjectTopology} from '../../model/topology';
import {validateProject} from '../../model/validation';
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

  it('given a manual turnout, records it without asking and notes it', () => {
    const {interlocking, notices, reportJobs, route} = setup(
      layout(2, {manualT2: true}),
    );
    // Via track 2: T2 (manual) must be diverging.
    interlocking.setRoute('S4', 'C2', []);
    expect(interlocking.state().turnouts['T2']).toEqual({
      position: 'diverging',
      status: 'manual',
    });
    reportJobs();
    expect(route()).toMatchObject({state: 'set', manualToSet: ['T2']});
    expect(notices).toContainEqual({
      code: 'routeSet',
      routeId: route().id,
      manualThrow: [{turnoutId: 'T2', position: 'diverging'}],
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

// A double slip D (address 5) with an exit at each leg: Ca1 – Ca2 and
// Cb1 – Cb2 are the straight lines, Ca1 – Cb2 and Cb1 – Ca2 the curves.
const slipLayout = (): Project => {
  const slip = turnout('D', [10, 10], {
    type: 'doubleSlip',
    orientation: 'E',
    ...dcc(5),
  });
  const legs = turnoutPorts(slip as Turnout).flatMap((port) => {
    const end = step(port.at, port.direction, 3);
    return [
      track(`t-${port.name}`, [port.at.x, port.at.y], [end.x, end.y]),
      {
        kind: 'connector',
        id: `C${port.name}`,
        name: '',
        at: end,
        direction: port.direction,
      } as DiagramElement,
    ];
  });
  const base = projectWith(slip, ...legs);
  return {...base, areas: base.areas.map((area) => ({...area, level: 2}))};
};

describe('conflicting routes', () => {
  it('given a set route, a new route sharing its track cancels it, signals to stop first', () => {
    const {interlocking, jobs, notices, reportJobs, signalOutputs} =
      setup(layout());
    interlocking.setRoute('S1', 'S4', []);
    reportJobs();
    const first = Object.keys(interlocking.state().routes)[0];
    jobs.splice(0);

    interlocking.setRoute('S1', 'S3', []);
    const routes = Object.values(interlocking.state().routes);
    expect(routes.map((r) => r.to)).toEqual(['S3']);
    expect(notices).toContainEqual({
      code: 'routeCancelled',
      routeId: first,
      elementId: 'S1',
      toElementId: 'S4',
    });
    // S1 to stop is queued before T1 is thrown back.
    const order = jobs.flatMap((j) => (j.kind === 'switch' ? [j.tag] : []));
    expect(order.indexOf('S1')).toBeLessThan(order.indexOf('T1'));
    expect(signalOutputs(jobs)[0]).toBe('S1:0');
  });

  it('routes one after the other (end of one = start of the next) do not conflict', () => {
    const {interlocking, notices, reportJobs} = setup(layout());
    interlocking.setRoute('S1', 'S3', []);
    reportJobs();
    interlocking.setRoute('S3', 'C2', []);
    reportJobs();
    expect(Object.keys(interlocking.state().routes)).toHaveLength(2);
    expect(notices.map((n) => n.code)).not.toContain('routeCancelled');
  });

  it.each([
    ['straight', 'Ca1', 'Ca2', 'Cb1', 'Cb2'],
    ['curves', 'Ca1', 'Cb2', 'Cb1', 'Ca2'],
  ])(
    'routes crossing in a double slip (%s) need confirming, then both stay',
    (_, from1, to1, from2, to2) => {
      const {interlocking, notices, reportJobs} = setup(slipLayout());
      interlocking.setRoute(from1, to1, []);
      reportJobs();
      interlocking.setRoute(from2, to2, []);
      expect(notices).toContainEqual({
        code: 'routeRefused',
        reason: 'crossing',
      });
      expect(Object.keys(interlocking.state().routes)).toHaveLength(1);

      interlocking.setRoute(from2, to2, [], undefined, true);
      reportJobs();
      const routes = Object.values(interlocking.state().routes);
      expect(routes.map((r) => r.state)).toEqual(['set', 'set']);
      expect(notices.map((n) => n.code)).not.toContain('routeCancelled');
    },
  );

  it('a route through the slip in the other position cancels the first, even if confirmed', () => {
    const {interlocking, notices, reportJobs} = setup(slipLayout());
    interlocking.setRoute('Ca1', 'Ca2', []);
    reportJobs();
    interlocking.setRoute('Cb1', 'Ca2', [], undefined, true);
    const routes = Object.values(interlocking.state().routes);
    expect(routes.map((r) => `${r.from}-${r.to}`)).toEqual(['Cb1-Ca2']);
    expect(notices.map((n) => n.code)).toContain('routeCancelled');
  });
});

describe('routeConflict (pure)', () => {
  const plan = (project: Project, from: string, to: string) => {
    const search = findRoutes(project, from, to);
    if (!search.ok) throw new Error(search.reason);
    return search.routes[0].steps;
  };

  it('tells crossings, conflicts and independent routes apart', () => {
    const project = slipLayout();
    const topology = buildProjectTopology(project);
    const straightA = plan(project, 'Ca1', 'Ca2');
    expect(
      routeConflict(topology, straightA, plan(project, 'Cb1', 'Cb2')),
    ).toEqual({kind: 'crossing', elementIds: ['D']});
    expect(
      routeConflict(topology, straightA, plan(project, 'Ca1', 'Cb2')),
    ).toMatchObject({kind: 'conflict'});
    expect(
      routeConflict(topology, plan(project, 'Ca2', 'Ca1'), straightA),
    ).toMatchObject({kind: 'conflict'});
    expect(
      routeConflict(
        buildProjectTopology(layout()),
        plan(layout(), 'S1', 'S3'),
        plan(layout(), 'S3', 'C2'),
      ),
    ).toBeUndefined();
  });
});

// A scissors crossover drawn with four turnouts whose diverging legs meet
// at (6, 1): W1/E1 on top, W2/E2 below.
const scissorsLayout = (): Project => {
  const exit = (id: string, x: number, y: number, direction: 'E' | 'W') =>
    ({
      kind: 'connector',
      id,
      name: id,
      at: {x, y},
      direction,
    }) as DiagramElement;
  const base = projectWith(
    exit('W1', 0, 0, 'W'),
    track('w1', [0, 0], [4, 0]),
    turnout('TA', [5, 0], {type: 'right', orientation: 'E', ...dcc(1)}),
    turnout('TB', [7, 0], {type: 'left', orientation: 'W', ...dcc(2)}),
    track('e1', [8, 0], [12, 0]),
    exit('E1', 12, 0, 'E'),
    exit('W2', 0, 2, 'W'),
    track('w2', [0, 2], [4, 2]),
    turnout('TC', [5, 2], {type: 'left', orientation: 'E', ...dcc(3)}),
    turnout('TD', [7, 2], {type: 'right', orientation: 'W', ...dcc(4)}),
    track('e2', [8, 2], [12, 2]),
    exit('E2', 12, 2, 'E'),
  );
  return {...base, areas: base.areas.map((area) => ({...area, level: 2}))};
};

describe('scissors crossover drawn with four turnouts', () => {
  it('the middle, where the four legs meet, is a crossing, not a junction', () => {
    const problems = validateProject(scissorsLayout()).map((p) => p.code);
    expect(problems).not.toContain('junctionWithoutTurnout');
  });

  it('routes go straight across the middle, never turn there', () => {
    const project = scissorsLayout();
    const across = findRoutes(project, 'W1', 'E2');
    expect(across.ok && across.routes[0].key).toBe('TA=diverging,TD=diverging');
    // W1 to W2 would need a sharp turn in the middle.
    expect(findRoutes(project, 'W1', 'W2')).toMatchObject({ok: false});
  });

  it('two routes crossing in the middle are a crossing to confirm', () => {
    const project = scissorsLayout();
    const steps = (from: string, to: string) => {
      const search = findRoutes(project, from, to);
      if (!search.ok) throw new Error(search.reason);
      return search.routes[0].steps;
    };
    const conflict = routeConflict(
      buildProjectTopology(project),
      steps('W1', 'E2'),
      steps('W2', 'E1'),
    );
    expect(conflict?.kind).toBe('crossing');
    expect(conflict?.elementIds.sort()).toEqual(['TA', 'TB', 'TC', 'TD']);
  });
});
