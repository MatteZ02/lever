import {describe, expect, it} from 'vitest';
import {
  addressToFAdr,
  signalAspectCommands,
  turnoutCommands,
} from '../accessoryCommands';
import {buildAddressTable} from '../addressTable';
import {defaultCentralUnitProfile} from '../centralUnitProfile';
import {
  cloneForPaste,
  deleteElements,
  insertTurnout,
  moveElements,
  rotateElements,
  splitTrack,
} from '../editing';
import {Signal, Track} from '../elements';
import {
  directionBetween,
  expandPolyline,
  isValidPolyline,
  rotateDirection,
  simplifyPolyline,
  snapToDirection,
} from '../geometry';
import {loadProject, serializeProject} from '../migrations';
import {turnoutGeometry, turnoutPorts} from '../ports';
import {createProject, PROJECT_SCHEMA_VERSION} from '../project';
import {BUILT_IN_SIGNAL_TYPES} from '../signalTypes';
import {buildViewTopology, connectionCount} from '../topology';
import {validateProject} from '../validation';
import {
  bufferStop,
  point,
  projectWith,
  sidingLayout,
  track,
  turnout,
} from './testLayouts';

const profile = defaultCentralUnitProfile();

describe('geometry', () => {
  it('knows the 8 directions and rotations', () => {
    expect(directionBetween(point(0, 0), point(3, -3))).toBe('NE');
    expect(directionBetween(point(0, 0), point(2, 1))).toBeUndefined();
    expect(rotateDirection('E', 1)).toBe('NE');
    expect(rotateDirection('E', -1)).toBe('SE');
  });

  it('snaps the mouse to the nearest allowed direction', () => {
    expect(snapToDirection(point(0, 0), point(5, 1))).toEqual(point(5, 0));
    expect(snapToDirection(point(0, 0), point(3, -2))).toEqual(point(3, -3));
    expect(snapToDirection(point(0, 0), point(0, 4))).toEqual(point(0, 4));
    // The exact mouse position: always lands on a grid point.
    expect(snapToDirection(point(0, 0), {x: 5.2, y: 0.4})).toEqual(point(5, 0));
    expect(snapToDirection(point(0, 0), {x: -0.3, y: 3.6})).toEqual(
      point(0, 4),
    );
  });

  it('expands and simplifies polylines', () => {
    expect(expandPolyline([point(0, 0), point(2, 0), point(3, 1)])).toEqual([
      point(0, 0),
      point(1, 0),
      point(2, 0),
      point(3, 1),
    ]);
    expect(
      simplifyPolyline([point(0, 0), point(1, 0), point(2, 0), point(3, 1)]),
    ).toEqual([point(0, 0), point(2, 0), point(3, 1)]);
    expect(isValidPolyline([point(0, 0), point(2, 1)])).toBe(false);
  });
});

describe('turnout geometry', () => {
  it('places the ports of a right-hand turnout one step from its centre', () => {
    const ports = turnoutPorts(turnout('T', [3, 0]));
    expect(ports.map((port) => [port.name, port.at])).toEqual([
      ['tip', point(2, 0)],
      ['straight', point(4, 0)],
      ['diverging', point(4, 1)],
    ]);
  });

  it('opens both slip curves together in a one-address double slip', () => {
    const slip = turnoutGeometry('doubleSlip', 'E');
    const open = (position: string) =>
      slip.transitions
        .filter((transition) => transition.positions.includes(position))
        .map((transition) => `${transition.from}-${transition.to}`);
    expect(open('straight')).toEqual(['a1-a2', 'b1-b2']);
    expect(open('diverging')).toEqual(['a1-b2', 'b1-a2']);
  });
});

describe('accessory commands', () => {
  const t = turnout('T', [0, 0], {
    control: {kind: 'dcc', addresses: [5], invert: false},
  });

  it('converts Roco numbers with the project offset (LOAD-5)', () => {
    expect(addressToFAdr(5, profile)).toBe(4);
    expect(addressToFAdr(5, {...profile, addressOffset: 4})).toBe(8);
    expect(addressToFAdr(1, {...profile, addressOffset: -1})).toBeUndefined();
  });

  it('maps straight/diverging to outputs, with profile default and invert', () => {
    expect(turnoutCommands(t, 'straight', profile)).toEqual({
      kind: 'commands',
      commands: [{fAdr: 4, output: 0, pulseMs: 150, queued: false}],
    });
    expect(
      turnoutCommands(t, 'straight', {...profile, straightOutput: 2}),
    ).toMatchObject({commands: [{output: 1}]});
    expect(
      turnoutCommands(
        {
          ...t,
          control: {kind: 'dcc', addresses: [5], invert: true, pulseMs: 400},
        },
        'straight',
        {...profile, turnoutCommandMode: 'queued'},
      ),
    ).toMatchObject({commands: [{output: 1, pulseMs: 400, queued: true}]});
  });

  it('sends nothing for manual turnouts and reports missing addresses', () => {
    expect(
      turnoutCommands({...t, control: {kind: 'manual'}}, 'straight', profile),
    ).toEqual({kind: 'manual'});
    expect(
      turnoutCommands(
        {
          ...t,
          type: 'threeWay',
          control: {kind: 'dcc', addresses: [5], invert: false},
        },
        'right',
        profile,
      ),
    ).toEqual({kind: 'incomplete', reason: 'missingAddress'});
  });

  it('drives both motors of a two-address double slip together', () => {
    const slip = turnout('S', [0, 0], {
      type: 'doubleSlip',
      control: {kind: 'dcc', addresses: [10, 11], invert: false},
    });
    expect(turnoutCommands(slip, 'diverging', profile)).toMatchObject({
      commands: [
        {fAdr: 9, output: 1},
        {fAdr: 10, output: 1},
      ],
    });
  });

  it('sets signal aspects from the type, or extended values', () => {
    const main3 = BUILT_IN_SIGNAL_TYPES.find(
      (type) => type.id === 'builtin:main3',
    )!;
    const signal: Signal = {
      kind: 'signal',
      id: 'S',
      name: '',
      at: point(0, 0),
      facing: 'E',
      side: 'right',
      signalTypeId: main3.id,
      control: {kind: 'dcc', addresses: [20, 21], invert: false},
    };
    expect(
      signalAspectCommands(signal, main3, 'reduced', profile),
    ).toMatchObject({
      commands: [
        {fAdr: 19, output: 1},
        {fAdr: 20, output: 1},
      ],
    });
    expect(
      signalAspectCommands(
        {...signal, control: {kind: 'extended', address: 1}},
        main3,
        'proceed',
        profile,
      ),
    ).toEqual({kind: 'extended', rawAddress: 4, value: 16});
  });
});

describe('project files', () => {
  it('round-trips through JSON', () => {
    const project = sidingLayout();
    const result = loadProject(serializeProject(project));
    expect(result).toEqual({ok: true, project});
  });

  it('rejects other files and newer versions', () => {
    expect(loadProject('nope')).toMatchObject({
      ok: false,
      error: {code: 'notJson'},
    });
    expect(loadProject('{"a":1}')).toMatchObject({
      error: {code: 'notAProject'},
    });
    expect(
      loadProject(
        JSON.stringify({
          format: 'lever-project',
          schemaVersion: PROJECT_SCHEMA_VERSION + 1,
        }),
      ),
    ).toMatchObject({error: {code: 'newerVersion'}});
  });

  it('migrates step by step and reports where it started (PRJ-5)', () => {
    // A pretend version 1 → 2 → 3 chain, to test the mechanism.
    const project = createProject('Old');
    const v1 = {...project, schemaVersion: 1, name: undefined, title: 'Old'};
    const migrations = {
      1: (data: Record<string, unknown>) => ({
        ...data,
        name: data['title'],
        title: undefined,
      }),
      2: (data: Record<string, unknown>) => ({...data, schemaVersion: 1}),
    };
    const result = loadProject(JSON.stringify(v1), migrations, 3);
    // Version 3 does not exist in the real schema, so validation fails at the
    // end; what matters is that both steps ran.
    expect(result).toMatchObject({ok: false, error: {code: 'invalid'}});
    expect(
      loadProject(JSON.stringify(v1), {1: migrations[1]}, 3),
    ).toMatchObject({
      error: {code: 'missingMigration', version: 2},
    });
  });
});

describe('topology', () => {
  it('given a siding layout, joins track and turnout legs into one graph', () => {
    const topology = buildViewTopology(sidingLayout().views[0]);
    const nodeAt = (x: number, y: number) => `v:${x},${y}`;
    expect(connectionCount(topology, nodeAt(2, 0))).toBe(2); // track + turnout tip
    expect(connectionCount(topology, nodeAt(4, 1))).toBe(2); // diverging leg + siding
    expect(connectionCount(topology, nodeAt(10, 0))).toBe(1); // buffer stop end
    const turnoutEdges = topology.edges.filter(
      (edge) => edge.kind === 'turnout',
    );
    expect(
      turnoutEdges.map((edge) => edge.kind === 'turnout' && edge.positions),
    ).toEqual([['straight'], ['diverging']]);
  });

  it('splits track at signals and virtual points', () => {
    const project = projectWith(track('t', [0, 0], [6, 0]), {
      kind: 'virtualPoint',
      id: 'vp',
      name: '',
      at: point(3, 0),
    });
    const edges = buildViewTopology(project.views[0]).edges;
    expect(edges.map((edge) => [edge.from, edge.to])).toEqual([
      ['v:0,0', 'v:3,0'],
      ['v:3,0', 'v:6,0'],
    ]);
  });
});

describe('validation (EDT-5)', () => {
  const codes = (project = sidingLayout()) =>
    validateProject(project).map(
      (problem) => `${problem.severity}:${problem.code}`,
    );

  it('given a complete siding, reports only informational notes', () => {
    expect(codes()).toEqual([
      'info:manualTurnout',
      'info:trackWithoutFeedback',
    ]);
  });

  it('warns about open track ends, but not at buffer stops or connectors', () => {
    const project = projectWith(
      track('t', [0, 0], [5, 0]),
      bufferStop('b', [5, 0], 'W'),
    );
    expect(
      validateProject(project).filter((p) => p.code === 'openTrackEnd'),
    ).toMatchObject([{elementIds: ['t'], params: {x: 0, y: 0}}]);
  });

  it('warns about duplicate addresses and missing addresses', () => {
    const project = projectWith(
      turnout('A', [0, 0], {
        control: {kind: 'dcc', addresses: [7], invert: false},
      }),
      turnout('B', [10, 0], {
        control: {kind: 'dcc', addresses: [7], invert: false},
      }),
      turnout('C', [20, 0], {
        type: 'threeWay',
        control: {kind: 'dcc', addresses: [8], invert: false},
      }),
    );
    const problems = validateProject(project);
    expect(problems.find((p) => p.code === 'duplicateAddress')).toMatchObject({
      elementIds: ['A', 'B'],
      params: {address: 7},
    });
    expect(problems.find((p) => p.code === 'missingAddress')).toMatchObject({
      elementIds: ['C'],
      params: {required: 2, count: 1},
    });
  });

  it('warns about junctions without a turnout', () => {
    const project = projectWith(
      track('a', [0, 0], [5, 0]),
      track('b', [5, 0], [10, 0]),
      track('c', [5, 0], [6, 1]),
    );
    expect(codes(project)).toContain('warning:junctionWithoutTurnout');
  });

  it('flags a signal that does not face along its track', () => {
    const project = projectWith(track('t', [0, 0], [5, 0]), {
      kind: 'signal',
      id: 's',
      name: '',
      at: point(2, 0),
      facing: 'N',
      side: 'right',
      signalTypeId: 'builtin:main2',
      control: {kind: 'manual'},
    });
    expect(codes(project)).toContain('error:signalFacingAcrossTrack');
  });

  it('notes tracks that cross without a connection', () => {
    const project = projectWith(
      track('a', [0, 0], [4, 0]),
      track('b', [2, -2], [2, 2]),
    );
    expect(codes(project)).toContain('info:tracksCrossWithoutConnection');
  });
});

describe('editing', () => {
  it('cuts a drawn line when a turnout is dropped onto it', () => {
    const project = projectWith(track('line', [0, 0], [10, 0]));
    const result = insertTurnout(project, 'v', turnout('T', [5, 0]));
    const tracks = result.views[0].elements.filter(
      (element): element is Track => element.kind === 'track',
    );
    expect(tracks.map((t) => t.points)).toEqual([
      [point(0, 0), point(4, 0)],
      [point(6, 0), point(10, 0)],
    ]);
    expect(
      validateProject(result).filter((p) => p.code === 'openTrackEnd'),
    ).toHaveLength(3);
  });

  it('splits a track at a point', () => {
    const parts = splitTrack(
      track('t', [0, 0], [4, 0], [6, 2]) as Track,
      point(4, 0),
    );
    expect(parts.map((part) => part.points)).toEqual([
      [point(0, 0), point(4, 0)],
      [point(4, 0), point(6, 2)],
    ]);
  });

  it('moves, rotates and deletes elements, cleaning up references', () => {
    let project = sidingLayout();
    project = moveElements(project, 'v', ['T1'], point(1, 1));
    expect(project.views[0].elements.find((e) => e.id === 'T1')).toMatchObject({
      at: point(4, 1),
    });
    project = rotateElements(project, 'v', ['T1']);
    expect(project.views[0].elements.find((e) => e.id === 'T1')).toMatchObject({
      orientation: 'SE',
    });
    project = deleteElements(project, ['T1']);
    expect(project.views[0].elements.some((e) => e.id === 'T1')).toBe(false);
  });

  it('pastes copies with new ids and without addresses', () => {
    const original = turnout('T', [0, 0], {
      control: {kind: 'dcc', addresses: [3], invert: false},
    });
    const [copy] = cloneForPaste([original], point(2, 2));
    expect(copy.id).not.toBe('T');
    expect(copy).toMatchObject({
      at: point(2, 2),
      control: {kind: 'dcc', addresses: []},
    });
  });
});

describe('address table (EDT-6)', () => {
  it('lists accessory addresses with decoder address and port, and conflicts', () => {
    const project = projectWith(
      turnout('A', [0, 0], {
        name: 'W1',
        control: {kind: 'dcc', addresses: [5], invert: false},
      }),
      turnout('B', [10, 0], {
        name: 'W2',
        control: {kind: 'dcc', addresses: [5], invert: false},
      }),
    );
    expect(buildAddressTable(project)).toMatchObject([
      {name: 'W1', address: 5, dccAddress: 1, port: 0, conflict: true},
      {name: 'W2', address: 5, conflict: true},
    ]);
  });
});
