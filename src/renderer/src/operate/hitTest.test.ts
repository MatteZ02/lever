import {describe, expect, it} from 'vitest';
import {track, turnout} from '../../../model/__tests__/testLayouts';
import {DiagramElement, Signal} from '../../../model/elements';
import {elementAt} from './hitTest';

// A right-hand turnout at (3,0) facing east: tip leg to (2,0), straight to
// (4,0), diverging to (4,1).
const T1 = turnout('T1', [3, 0]);
const all = () => true;
const idAt = (
  elements: DiagramElement[],
  x: number,
  y: number,
  clickable: (element: DiagramElement) => boolean = all,
) => elementAt(elements, {x, y}, clickable)?.id;

const signal = (id: string, at: [number, number]): Signal => ({
  kind: 'signal',
  id,
  name: id,
  at: {x: at[0], y: at[1]},
  facing: 'E',
  side: 'right',
  signalTypeId: 'main',
  control: {kind: 'manual'},
});

describe('operating-mode hit test', () => {
  it('given a click anywhere on a turnout, its legs included, the turnout is hit', () => {
    expect(idAt([T1], 3, 0)).toBe('T1');
    expect(idAt([T1], 2.1, 0)).toBe('T1'); // end of the tip leg
    expect(idAt([T1], 3.9, 0.1)).toBe('T1'); // end of the straight leg
    expect(idAt([T1], 3.9, 0.9)).toBe('T1'); // end of the diverging leg
  });

  it('given nothing else clickable close by, a click beside it counts too', () => {
    // Half a grid step past the straight leg's end: outside the turnout,
    // inside its shape scaled 1.5 times.
    expect(idAt([T1], 4.4, 0)).toBe('T1');
    expect(idAt([T1], 3, -0.55)).toBe('T1');
    // Too far.
    expect(idAt([T1], 5.2, 0)).toBeUndefined();
    expect(idAt([T1], 3, -1)).toBeUndefined();
  });

  it('given another clickable element close by, a click between them hits neither', () => {
    const T2 = turnout('T2', [6, 0], {orientation: 'W'});
    // Between the straight legs' ends (4,0) and (5,0): on neither turnout,
    // inside both scaled shapes.
    expect(idAt([T1, T2], 4.5, -0.3)).toBeUndefined();
    // On either one still works.
    expect(idAt([T1, T2], 3.6, 0)).toBe('T1');
    expect(idAt([T1, T2], 5.4, 0)).toBe('T2');
  });

  it('elements that do nothing on a click do not conflict', () => {
    const T2 = turnout('T2', [6, 0], {orientation: 'W'});
    expect(idAt([T1, T2], 4.5, -0.3, (e) => e.id === 'T1')).toBe('T1');
  });

  it('given a turnout on a clickable track, the turnout wins on the turnout', () => {
    const main = track('main', [0, 0], [10, 0]);
    expect(idAt([main, T1], 3.2, 0)).toBe('T1');
    expect(idAt([main, T1], 7, 0)).toBe('main');
  });

  it('a track is hit on its line only, never beside it', () => {
    const main = track('main', [0, 0], [10, 0]);
    expect(idAt([main], 7, 0.3)).toBe('main');
    expect(idAt([main], 7, 0.45)).toBeUndefined();
  });

  it('a signal is hit where it is drawn, beside the track', () => {
    const S1 = signal('S1', [6, 0]);
    // Right-hand side of eastward travel is below the line (+y).
    expect(idAt([S1], 6, 0.45)).toBe('S1');
    expect(idAt([S1], 6, 1)).toBe('S1'); // beside: scaled shape
    expect(idAt([S1], 6, -0.6)).toBeUndefined();
  });
});
