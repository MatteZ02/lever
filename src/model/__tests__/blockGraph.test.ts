import {describe, expect, it} from 'vitest';
import {
  buildBlockGraph,
  exitBetween,
  nextBlock,
  passageState,
} from '../blockGraph';
import {DiagramElement} from '../elements';
import {nodeId, buildProjectTopology} from '../topology';
import {projectWith, track, turnout} from './testLayouts';

// main1 (block A) → T1 at (3,0) → straight: main2 (block B, to a dead end
// at x=10); diverging: siding (block C).
const layout = (...extra: DiagramElement[]) => {
  const project = projectWith(
    {...track('main1', [0, 0], [2, 0]), blockId: 'A'} as DiagramElement,
    turnout('T1', [3, 0], {
      control: {kind: 'dcc', addresses: [1], invert: false},
    }),
    {...track('main2', [4, 0], [10, 0]), blockId: 'B'} as DiagramElement,
    {
      ...track('siding', [4, 1], [5, 2], [10, 2]),
      blockId: 'C',
    } as DiagramElement,
    ...extra,
  );
  return {
    ...project,
    blocks: ['A', 'B', 'C'].map((id) => ({id, name: id, inputs: []})),
  };
};
const graphOf = (project = layout()) =>
  buildBlockGraph(project, buildProjectTopology(project));
const node = (x: number, y: number) => nodeId('v', {x, y});

describe('block graph', () => {
  it('finds the next block through a turnout, per position', () => {
    const exits = graphOf()
      .exits.get('A')!
      .filter((e) => e.to !== null);
    expect(
      exits
        .map((e) => ({to: e.to, turnouts: e.turnouts}))
        .sort((a, b) => a.to!.localeCompare(b.to!)),
    ).toEqual([
      {to: 'B', turnouts: [{turnoutId: 'T1', positions: ['straight']}]},
      {to: 'C', turnouts: [{turnoutId: 'T1', positions: ['diverging']}]},
    ]);
  });

  it('a track that ends leads nowhere', () => {
    const exits = graphOf().exits.get('B')!;
    expect(exits.find((e) => e.exitNode === node(10, 0))?.to).toBeNull();
  });

  it('given the direction of travel and the turnout, the next block is known', () => {
    const graph = graphOf();
    const straight = () => 'straight';
    // Entered A at its west end, running east.
    expect(nextBlock(graph, 'A', node(0, 0), straight)).toMatchObject({
      kind: 'block',
      exit: {to: 'B'},
    });
    expect(nextBlock(graph, 'A', node(0, 0), () => 'diverging')).toMatchObject({
      kind: 'block',
      exit: {to: 'C'},
    });
    // Position unknown, or direction unknown.
    expect(nextBlock(graph, 'A', node(0, 0), () => undefined).kind).toBe(
      'unknown',
    );
    expect(nextBlock(graph, 'A', undefined, straight).kind).toBe('unknown');
    // Running east in B: the track ends.
    expect(nextBlock(graph, 'B', node(4, 0), straight).kind).toBe('end');
  });

  it('a trailing turnout set the other way blocks the way', () => {
    const graph = graphOf();
    // Westwards from C: T1 must lie diverging.
    expect(nextBlock(graph, 'C', node(10, 2), () => 'straight').kind).toBe(
      'blocked',
    );
    const exit = exitBetween(graph, 'C', 'A', () => 'diverging')!;
    expect(passageState(exit, () => 'diverging')).toBe('open');
  });

  it('records signals facing the direction of travel', () => {
    const graph = graphOf(
      layout({
        kind: 'signal',
        id: 'S1',
        name: 'S1',
        at: {x: 2, y: 0},
        facing: 'E',
        side: 'right',
        signalTypeId: 'builtin:main2',
        control: {kind: 'manual'},
      }),
    );
    const east = graph.exits.get('A')!.find((e) => e.to === 'B')!;
    const west = graph.exits.get('B')!.find((e) => e.to === 'A')!;
    expect(east.signals).toEqual(['S1']);
    expect(west.signals).toEqual([]);
  });
});
