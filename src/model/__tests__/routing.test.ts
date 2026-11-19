// Level 2 route finding (RTE-1 – RTE-3) and route signal aspects (RTE-5):
// "given this layout, when a route is asked from A to B, then …".
import {describe, expect, it} from 'vitest';
import {pairConnectors} from '../connectors';
import {DiagramElement, Signal, StationConnector} from '../elements';
import {Project} from '../project';
import {routeSignalAspects} from '../routeSignals';
import {findRoutes, RoutePlan} from '../routing';
import {projectWith, track, turnout} from './testLayouts';

const signal = (
  id: string,
  at: [number, number],
  facing: 'E' | 'W',
  signalTypeId = 'builtin:main2',
): Signal => ({
  kind: 'signal',
  id,
  name: id,
  at: {x: at[0], y: at[1]},
  facing,
  side: 'right',
  signalTypeId,
  control: {kind: 'manual'},
});

const connector = (
  id: string,
  at: [number, number],
  direction: 'E' | 'W',
): StationConnector => ({
  kind: 'connector',
  id,
  name: id,
  at: {x: at[0], y: at[1]},
  direction,
});

const dcc = (address: number) => ({
  control: {kind: 'dcc' as const, addresses: [address], invert: false},
});

// A passing loop: track 1 straight through, track 2 through both diverging
// legs. Entry signal S1 (east), exit signals S3/S4 (east), S2 at the east
// end facing east, W1 on track 1 facing west.
//
//  C1 —S1→— T1 ——— track 1 —W1←— S3→ — T2 —— S2→ —— C2
//             \______ track 2 ________ S4→ /
const loopElements = (s1Type = 'builtin:main2'): DiagramElement[] => [
  connector('C1', [0, 0], 'W'),
  track('in', [0, 0], [4, 0]),
  signal('S1', [2, 0], 'E', s1Type),
  turnout('T1', [5, 0], {type: 'right', orientation: 'E', ...dcc(1)}),
  track('t1', [6, 0], [14, 0]),
  signal('W1', [8, 0], 'W'),
  signal('S3', [12, 0], 'E'),
  track('t2', [6, 1], [7, 2], [13, 2], [14, 1]),
  signal('S4', [12, 2], 'E'),
  turnout('T2', [15, 0], {type: 'left', orientation: 'W', ...dcc(2)}),
  track('out', [16, 0], [20, 0]),
  signal('S2', [18, 0], 'E'),
  connector('C2', [20, 0], 'E'),
];

const loop = (s1Type?: string) => projectWith(...loopElements(s1Type));

const only = (result: ReturnType<typeof findRoutes>): RoutePlan => {
  if (!result.ok) {
    throw new Error(`no route: ${result.reason}`);
  }
  expect(result.routes).toHaveLength(1);
  return result.routes[0];
};

const positions = (plan: RoutePlan) =>
  Object.fromEntries(plan.turnouts.map((t) => [t.turnoutId, t.position]));

const aspects = (project: Project, plan: RoutePlan) =>
  Object.fromEntries(
    routeSignalAspects(project, plan).map((s) => [s.signalId, s.aspectId]),
  );

describe('finding a route (RTE-2)', () => {
  it('given a passing loop, the straight track is chosen (fewest diverging moves)', () => {
    const plan = only(findRoutes(loop(), 'S1', 'C2'));
    expect(positions(plan)).toEqual({T1: 'straight', T2: 'straight'});
    expect(plan.endSignalId).toBeUndefined();
  });

  it('ends at a signal approached in its direction, through the diverging legs', () => {
    const plan = only(findRoutes(loop(), 'S1', 'S4'));
    expect(positions(plan)).toEqual({T1: 'diverging'});
    expect(plan.endSignalId).toBe('S4');
  });

  it('never leaves a signal backwards or reverses on the spot', () => {
    // C1 lies behind S1.
    expect(findRoutes(loop(), 'S1', 'C1')).toEqual({
      ok: false,
      reason: 'noPath',
    });
  });

  it('does not end at a signal approached from behind', () => {
    // From C2 westwards, W1 faces the train, S3 does not.
    expect(only(findRoutes(loop(), 'C2', 'W1')).endSignalId).toBe('W1');
    expect(findRoutes(loop(), 'C2', 'S3').ok).toBe(false);
  });

  it('refuses points that cannot start or end a route', () => {
    expect(findRoutes(loop(), 't1', 'C2')).toMatchObject({
      ok: false,
      reason: 'notRoutePoint',
      elementId: 't1',
    });
  });

  it('given two equally good routes, offers both (tie)', () => {
    // Wyes at both ends: each way round is two diverging moves.
    const project = projectWith(
      connector('A', [0, 0], 'W'),
      track('a', [0, 0], [4, 0]),
      turnout('Y1', [5, 0], {type: 'wye', orientation: 'E', ...dcc(1)}),
      track('up', [6, -1], [7, -2], [13, -2], [14, -1]),
      track('down', [6, 1], [7, 2], [13, 2], [14, 1]),
      turnout('Y2', [15, 0], {type: 'wye', orientation: 'W', ...dcc(2)}),
      track('b', [16, 0], [20, 0]),
      connector('B', [20, 0], 'E'),
    );
    const result = findRoutes(project, 'A', 'B');
    expect(result.ok && result.routes.map(positions)).toEqual(
      expect.arrayContaining([
        {Y1: 'left', Y2: 'right'},
        {Y1: 'right', Y2: 'left'},
      ]),
    );
  });

  it('a via point forces the other way (RTE-3)', () => {
    const project = projectWith(...loopElements(), {
      kind: 'virtualPoint',
      id: 'V',
      name: '',
      at: {x: 10, y: 2},
    });
    const plan = only(findRoutes(project, 'S1', 'C2', ['V']));
    expect(positions(plan)).toEqual({T1: 'diverging', T2: 'diverging'});
  });

  it('lists manual turnouts as such (ACC-5, RTE-4)', () => {
    const project = projectWith(
      ...loopElements().map((e) =>
        e.id === 'T2' ? {...e, control: {kind: 'manual' as const}} : e,
      ),
    );
    const plan = only(findRoutes(project, 'S1', 'C2'));
    expect(plan.turnouts.find((t) => t.turnoutId === 'T2')).toMatchObject({
      manual: true,
    });
  });

  it('runs on into another station through linked exits (FULL-3)', () => {
    const project = loop();
    const second = {
      id: 'v2',
      name: 'Next',
      areaId: 'area-next',
      elements: [
        connector('N1', [0, 0], 'W'),
        track('n', [0, 0], [6, 0]),
        signal('NS', [4, 0], 'E'),
      ],
    };
    const joined = pairConnectors(
      {
        ...project,
        views: [...project.views, second],
        areas: [...project.areas, {id: 'area-next', name: 'Next', level: 2}],
      },
      'C2',
      'N1',
    );
    const plan = only(findRoutes(joined, 'S1', 'NS'));
    expect(plan.segments.map((s) => s.viewId)).toEqual(['v', 'v2']);
    expect(plan.areas.map((a) => a.name)).toEqual(['Test', 'Next']);
  });
});

describe('signals along a route (RTE-5)', () => {
  it('start and passed signals facing the route proceed; the end signal and opposite ones stop', () => {
    const project = loop();
    const plan = only(findRoutes(project, 'S1', 'C2'));
    expect(aspects(project, plan)).toEqual({
      S1: 'proceed',
      W1: 'stop',
      S3: 'proceed',
      S2: 'proceed',
    });
    const toS3 = only(findRoutes(project, 'S1', 'S3'));
    expect(aspects(project, toS3)).toMatchObject({S1: 'proceed', S3: 'stop'});
  });

  it('a three-aspect signal shows reduced speed before a diverging route', () => {
    const project = loop('builtin:main3');
    expect(aspects(project, only(findRoutes(project, 'S1', 'S4')))).toEqual({
      S1: 'reduced',
      S4: 'stop',
    });
    expect(aspects(project, only(findRoutes(project, 'S1', 'S3'))).S1).toBe(
      'proceed',
    );
  });

  it('a distant signal repeats its main signal', () => {
    const project = projectWith(...loopElements(), {
      ...signal('D1', [1, 0], 'E', 'builtin:distant'),
      distantFor: 'S1',
    } as Signal);
    expect(
      aspects(project, only(findRoutes(project, 'S1', 'C2'))),
    ).toMatchObject({D1: 'expectProceed'});
  });
});
