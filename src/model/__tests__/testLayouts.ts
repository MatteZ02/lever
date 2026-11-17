// Small layouts for model tests.
import {DiagramElement, Turnout} from '../elements';
import {GridPoint} from '../geometry';
import {createProject, Project} from '../project';

export const track = (
  id: string,
  ...points: [number, number][]
): DiagramElement => ({
  kind: 'track',
  id,
  name: '',
  points: points.map(([x, y]) => ({x, y})),
});

export const turnout = (
  id: string,
  at: [number, number],
  overrides: Partial<Turnout> = {},
): Turnout => ({
  kind: 'turnout',
  id,
  name: id,
  type: 'right',
  at: {x: at[0], y: at[1]},
  orientation: 'E',
  control: {kind: 'manual'},
  ...overrides,
});

export const bufferStop = (
  id: string,
  at: [number, number],
  direction: 'E' | 'W',
): DiagramElement => ({
  kind: 'bufferStop',
  id,
  name: '',
  at: {x: at[0], y: at[1]},
  direction,
});

export const point = (x: number, y: number): GridPoint => ({x, y});

// A project with one view holding the given elements.
export const projectWith = (...elements: DiagramElement[]): Project => {
  const project = createProject('Test');
  return {
    ...project,
    views: [{...project.views[0], id: 'v', elements}],
  };
};

// Siding layout: main line 0..10 on y=0 with a right-hand turnout at x=3
// (tip at 2, straight at 4, diverging at (4,1)), a siding from (4,1) to
// (5,2) and on to (10,2), buffer stops at both line ends and at the siding.
export const sidingLayout = (): Project =>
  projectWith(
    bufferStop('stopW', [0, 0], 'E'),
    track('main1', [0, 0], [2, 0]),
    turnout('T1', [3, 0]),
    track('main2', [4, 0], [10, 0]),
    bufferStop('stopE', [10, 0], 'W'),
    track('siding', [4, 1], [5, 2], [10, 2]),
    bufferStop('stopS', [10, 2], 'W'),
  );
