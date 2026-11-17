import {describe, expect, it} from 'vitest';
import {placeElement, trackAt} from '../placement';
import {point, projectWith, track} from './testLayouts';

const view = projectWith(
  track('line', [0, 0], [6, 0]),
  track('diagonal', [6, 0], [9, -3]),
).views[0];

describe('placing elements', () => {
  it('knows which way track leaves a point', () => {
    expect(trackAt(view, point(3, 0))).toEqual({
      directions: ['W', 'E'],
      isEnd: false,
    });
    expect(trackAt(view, point(0, 0))).toEqual({
      directions: ['E'],
      isEnd: true,
    });
    expect(trackAt(view, point(6, 0)).isEnd).toBe(false);
  });

  it('given a horizontal line, a signal faces east; rotating reverses it', () => {
    expect(placeElement(view, 'signal', point(3, 0))).toMatchObject({
      ok: true,
      element: {facing: 'E'},
    });
    expect(
      placeElement(view, 'signal', point(3, 0), {rotation: 1}),
    ).toMatchObject({
      element: {facing: 'W'},
    });
  });

  it('refuses a signal away from track', () => {
    expect(placeElement(view, 'signal', point(3, 3))).toEqual({
      ok: false,
      reason: 'notOnTrack',
    });
  });

  it('points buffer stops into the track and connectors out of the view', () => {
    expect(placeElement(view, 'bufferStop', point(0, 0))).toMatchObject({
      element: {kind: 'bufferStop', direction: 'E'},
    });
    expect(placeElement(view, 'connector', point(9, -3))).toMatchObject({
      element: {kind: 'connector', direction: 'NE'},
    });
    expect(placeElement(view, 'bufferStop', point(3, 0))).toEqual({
      ok: false,
      reason: 'notAtTrackEnd',
    });
  });

  it('aligns a turnout with the line it is dropped on', () => {
    expect(
      placeElement(view, 'turnout', point(7, -1), {turnoutType: 'left'}),
    ).toMatchObject({
      element: {type: 'left', orientation: 'NE'},
    });
  });
});
