// The Z21 app import, on small hand-made control stations. Codes and angles
// as in a real export (see z21Import.ts).
import {describe, expect, it} from 'vitest';
import {Turnout} from '../elements';
import {validateProject} from '../validation';
import {
  importZ21,
  Z21Control,
  Z21ControlState,
  Z21Export,
  Z21Note,
  Z21RouteButton,
} from '../z21Import';

type Tile = [
  x: number,
  y: number,
  type: number,
  angle: number,
  address?: number,
];

let nextId = 1;
const station = (
  tiles: Tile[],
  options: {
    notes?: Partial<Z21Note>[];
    routes?: [number, number][];
    // Output of state 0 per address (default 0).
    state0?: Record<number, number>;
    pageId?: number;
    name?: string;
  } = {},
) => {
  const pageId = options.pageId ?? 1;
  const controls: Z21Control[] = tiles.map(([x, y, type, angle, address]) => ({
    id: nextId++,
    pageId,
    x,
    y,
    type,
    angle,
    address1: address ?? 0,
    address2: 0,
    address3: 0,
  }));
  const states: Z21ControlState[] = controls
    .filter((c) => c.address1 > 0)
    .flatMap((c) => {
      const v = options.state0?.[c.address1] ?? 0;
      return [
        {controlId: c.id, state: 0, address1Value: v},
        {controlId: c.id, state: 1, address1Value: 1 - v},
      ];
    });
  const notes: Z21Note[] = (options.notes ?? []).map((note) => ({
    pageId,
    x: 0,
    y: 0,
    text: '',
    fontSize: 30,
    type: 1,
    ...note,
  }));
  const routes: Z21RouteButton[] = (options.routes ?? []).map(([x, y]) => ({
    id: nextId++,
    pageId,
    x,
    y,
  }));
  return {
    page: {id: pageId, position: pageId, name: options.name ?? 'Station'},
    controls,
    states,
    notes,
    routes,
  };
};

const exportOf = (...stations: ReturnType<typeof station>[]): Z21Export => ({
  layoutName: 'My Layout',
  pages: stations.map((s) => s.page),
  controls: stations.flatMap((s) => s.controls),
  states: stations.flatMap((s) => s.states),
  notes: stations.flatMap((s) => s.notes),
  routes: stations.flatMap((s) => s.routes),
});

const STRAIGHT = 0;
const RIGHT = 1;
const LEFT = 2;
const SIGNAL = 11;
const END = 14;
const SLIP = 23;
const CORNER = 24;
const CURVE = 28;

const row = (y: number, from: number, to: number): Tile[] =>
  Array.from({length: to - from + 1}, (_, i) => [from + i, y, STRAIGHT, 90]);

const warnings = (result: ReturnType<typeof importZ21>) =>
  validateProject(result.project)
    .filter((problem) => problem.severity !== 'info')
    .map((problem) => `${problem.code} ${JSON.stringify(problem.params)}`);

const elementsOf = (result: ReturnType<typeof importZ21>, index = 0) =>
  result.project.views[index].elements;

const turnouts = (result: ReturnType<typeof importZ21>) =>
  elementsOf(result).filter((e): e is Turnout => e.kind === 'turnout');

describe('Z21 app import', () => {
  it('turns tiles into connected tracks, turnouts and a named exit', () => {
    // Two tracks with a crossover; the top one ends at "Pun", the bottom
    // one at a buffer stop; the west ends run off the drawing.
    const result = importZ21(
      exportOf(
        station(
          [
            ...row(0, 0, 0),
            [1, 0, RIGHT, 90, 5],
            ...row(0, 2, 2),
            [3, 0, END, 90],
            ...row(1, 0, 1),
            [2, 1, RIGHT, 270, 6],
            [3, 1, END, 90],
          ],
          {notes: [{x: 4, y: 0, text: 'Pun'}], state0: {6: 1}},
        ),
      ),
    );

    expect(warnings(result)).toEqual([]);
    expect(turnouts(result)).toMatchObject([
      {
        type: 'right',
        orientation: 'E',
        control: {kind: 'dcc', addresses: [5], invert: false},
      },
      {
        type: 'right',
        orientation: 'W',
        control: {kind: 'dcc', addresses: [6], invert: true},
      },
    ]);
    const kinds = elementsOf(result).map((e) =>
      e.kind === 'connector' ? `connector:${e.name}` : e.kind,
    );
    expect(kinds.filter((k) => k.startsWith('connector'))).toEqual([
      'connector:Pun',
      'connector:',
      'connector:',
    ]);
    expect(kinds).toContain('bufferStop');
    // The caption became the exit's name, not a separate label.
    expect(kinds).not.toContain('label');
    // One tile is two grid steps: neighbouring tracks two rows apart.
    const [top, bottom] = turnouts(result);
    expect(bottom.at.x - top.at.x).toBe(2);
    expect(bottom.at.y - top.at.y).toBe(2);
  });

  it('redraws a double crossover (X) as two crossovers in a row', () => {
    const result = importZ21(
      exportOf(
        station([
          ...row(0, 0, 0),
          [1, 0, RIGHT, 90, 202],
          [2, 0, LEFT, 270, 201],
          ...row(0, 3, 3),
          ...row(1, 0, 0),
          [1, 1, LEFT, 90, 204],
          [2, 1, RIGHT, 270, 203],
          ...row(1, 3, 3),
        ]),
      ),
    );

    expect(warnings(result)).toEqual([]);
    // West to east on the bottom line: 203 first, then 204.
    const byAddress = (address: number) =>
      turnouts(result).find(
        (t) => t.control.kind === 'dcc' && t.control.addresses[0] === address,
      )!;
    expect(byAddress(202).at.x).toBeLessThan(byAddress(203).at.x);
    expect(byAddress(203).at.x).toBeLessThan(byAddress(204).at.x);
    expect(byAddress(204).at.x).toBeLessThan(byAddress(201).at.x);
    expect(byAddress(203).at.y).toBe(byAddress(204).at.y);
  });

  it('draws curves, 90° corners and slips', () => {
    // A loop with sharp corners, a 45° curve and a double slip on it.
    const result = importZ21(
      exportOf(
        station([
          [0, 0, CORNER, 90],
          ...row(0, 1, 2),
          [3, 0, CURVE, 270],
          [0, 1, STRAIGHT, 0],
          [0, 2, CORNER, 0],
          ...row(2, 1, 1),
          [2, 2, SLIP, 90, 9],
          [4, -1, STRAIGHT, 45],
          [1, 3, STRAIGHT, 45],
          [3, 1, STRAIGHT, 45],
          [3, 2, STRAIGHT, 90],
        ]),
      ),
    );
    const slip = turnouts(result)[0];
    expect(slip).toMatchObject({type: 'doubleSlip', orientation: 'E'});
    // Every line ends at the slip or runs off the drawing: no loose ends
    // inside, no junction without a turnout.
    expect(warnings(result)).toEqual([]);
  });

  it('carries a track through a track-number note and keeps the number', () => {
    const result = importZ21(
      exportOf(
        station([...row(0, 0, 1), ...row(0, 3, 4)], {
          notes: [{x: 2, y: 0, text: '3', type: 2, fontSize: 12}],
        }),
      ),
    );
    const tracks = elementsOf(result).filter((e) => e.kind === 'track');
    expect(tracks).toHaveLength(1);
    expect(elementsOf(result)).toContainEqual(
      expect.objectContaining({kind: 'label', text: '3', size: 'small'}),
    );
  });

  it('imports signals with the first state as proceed', () => {
    const result = importZ21(
      exportOf(
        station([...row(0, 0, 0), [1, 0, SIGNAL, 90, 803], ...row(0, 2, 2)], {
          state0: {803: 1},
        }),
      ),
    );
    expect(elementsOf(result)).toContainEqual(
      expect.objectContaining({
        kind: 'signal',
        facing: 'E',
        signalTypeId: 'builtin:main2',
        control: {kind: 'dcc', addresses: [803], invert: false},
      }),
    );
    expect(result.issues).toContainEqual({code: 'signalsAssumed', count: 1});
  });

  it('leaves out route buttons, their captions and separator lines', () => {
    const result = importZ21(
      exportOf(
        station([...row(5, 0, 3), [0, 1, STRAIGHT, 0]], {
          notes: [
            {x: 2, y: 0, text: 'Läpiajot'},
            {x: 4, y: 0, text: '1'},
            {x: 1, y: 1, text: 'Päärata Kel'},
            {x: 0, y: 6, text: 'Note on the diagram'},
          ],
          routes: [
            [4, 1],
            [4, 2],
          ],
        }),
      ),
    );
    const labels = elementsOf(result)
      .filter((e) => e.kind === 'label')
      .map((e) => (e.kind === 'label' ? e.text : ''));
    expect(labels).toEqual(['Note on the diagram']);
    expect(elementsOf(result).filter((e) => e.kind === 'track')).toHaveLength(
      1,
    );
    expect(result.issues).toContainEqual({code: 'routesNotImported', count: 2});
  });

  it('skips a page that only repeats turnouts of another page', () => {
    const big = station(
      [
        [0, 0, RIGHT, 90, 201],
        [1, 0, LEFT, 90, 202],
        [2, 0, RIGHT, 90, 203],
      ],
      {pageId: 1, name: 'inselburg-dettingen'},
    );
    const closeUp = station(
      [
        [0, 0, RIGHT, 90, 201],
        [1, 0, LEFT, 90, 202],
      ],
      {
        pageId: 2,
        name: 'dettingen',
      },
    );
    const result = importZ21(exportOf(big, closeUp));
    expect(result.project.views.map((v) => v.name)).toEqual([
      'inselburg-dettingen',
    ]);
    expect(result.project.areas.map((a) => a.name)).toEqual([
      'inselburg-dettingen',
    ]);
    expect(result.issues).toContainEqual({
      code: 'duplicatePage',
      page: 'dettingen',
      of: 'inselburg-dettingen',
    });
  });

  it('reports addresses Lever cannot use and unknown tiles', () => {
    const result = importZ21(
      exportOf(
        station([
          [0, 0, RIGHT, 90, 9999],
          [1, 0, 99, 90],
        ]),
      ),
    );
    expect(turnouts(result)[0].control).toMatchObject({addresses: []});
    expect(result.issues).toEqual(
      expect.arrayContaining([
        {code: 'invalidAddress', page: 'Station', address: 9999},
        {code: 'unknownControl', type: 99, count: 1},
      ]),
    );
  });
});
