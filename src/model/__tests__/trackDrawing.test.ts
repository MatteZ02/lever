// Drawing and reshaping track: reaching a connection exactly, moving a
// corner along 45° lines, and joining pieces drawn one after the other.
import {describe, expect, it} from 'vitest';
import {Track} from '../elements';
import {isValidPolyline} from '../geometry';
import {StationView} from '../project';
import {
  addTrackJoined,
  dragCorner,
  nextDrawingPoints,
  pathTo,
} from '../trackDrawing';
import {validateProject} from '../validation';
import {point, projectWith, track, turnout} from './testLayouts';

const viewOf = (...elements: Parameters<typeof projectWith>) =>
  projectWith(...elements).views[0];

const asTrack = (id: string, ...points: [number, number][]) =>
  track(id, ...points) as Track;

describe('reaching a connection exactly', () => {
  it('adds one 45° bend when the target is not in line', () => {
    const path = pathTo(point(0, 0), point(7, -3));
    expect(path).toHaveLength(2);
    expect(path[1]).toEqual(point(7, -3));
    expect(isValidPolyline([point(0, 0), ...path])).toBe(true);
  });

  it('arrives in line with the track it joins', () => {
    // The existing track goes on to the east from (7, -3).
    const path = pathTo(point(0, 0), point(7, -3), undefined, 'E');
    expect(path).toEqual([point(3, -3), point(7, -3)]);
    // It goes on to the north-east: arrive diagonally.
    expect(pathTo(point(0, 0), point(7, -3), undefined, 'NE')).toEqual([
      point(4, 0),
      point(7, -3),
    ]);
  });

  it('a click on a track end connects to it although it is not in line', () => {
    const view = viewOf(track('t', [10, 4], [20, 4]));
    const added = nextDrawingPoints(
      view,
      [point(0, 0)],
      {x: 10.2, y: 4.1},
      point(10, 4),
    );
    expect(added[added.length - 1]).toEqual(point(10, 4));
    expect(isValidPolyline([point(0, 0), ...added])).toBe(true);
  });

  it('elsewhere, a click snaps to the nearest of the 8 directions', () => {
    const view = viewOf();
    expect(
      nextDrawingPoints(view, [point(0, 0)], {x: 5.2, y: 0.4}, point(5, 0)),
    ).toEqual([point(5, 0)]);
  });
});

describe('moving a corner', () => {
  const diagonal = asTrack('d', [0, 0], [4, 4]);

  it('makes a diagonal longer or shorter along its line', () => {
    const view = viewOf(diagonal);
    // The pointer is a little off the line; the nearest grid point (7, 6)
    // is not at 45°.
    expect(
      dragCorner(view, diagonal, 1, {x: 6.6, y: 6.2}, point(7, 6)),
    ).toEqual([point(0, 0), point(6, 6)]);
    expect(
      dragCorner(view, diagonal, 1, {x: 2.2, y: 1.8}, point(2, 2)),
    ).toEqual([point(0, 0), point(2, 2)]);
    // The start end too.
    expect(
      dragCorner(view, diagonal, 0, {x: -1.8, y: -2.3}, point(-2, -2)),
    ).toEqual([point(-2, -2), point(4, 4)]);
  });

  it('dropped on a turnout leg, an end connects there with a bend', () => {
    const t = turnout('T', [10, 2]);
    const view = viewOf(diagonal, t);
    // The turnout's tip is at (9, 2).
    const points = dragCorner(view, diagonal, 1, {x: 9.1, y: 2}, point(9, 2))!;
    expect(points[points.length - 1]).toEqual(point(9, 2));
    expect(isValidPolyline(points)).toBe(true);
  });

  it('moves an inner corner only where both sides stay straight or 45°', () => {
    const bent = asTrack('b', [0, 0], [4, 0], [8, 4]);
    const view = viewOf(bent);
    const points = dragCorner(view, bent, 1, {x: 3.3, y: 0.6}, point(3, 1))!;
    expect(isValidPolyline(points)).toBe(true);
    expect(points[0]).toEqual(point(0, 0));
    expect(points[points.length - 1]).toEqual(point(8, 4));
  });
});

describe('joining pieces drawn one after the other', () => {
  const view = (): StationView =>
    viewOf(track('a', [0, 0], [6, 0]), track('far', [0, 8], [6, 8]));

  it('a new piece from a free end becomes one track with it', () => {
    const next = addTrackJoined(view(), asTrack('new', [6, 0], [10, 4]));
    const tracks = next.elements.filter((e) => e.kind === 'track');
    expect(tracks.map((t) => t.id).sort()).toEqual(['a', 'far']);
    expect(tracks.find((t) => t.id === 'a')).toMatchObject({
      points: [point(0, 0), point(6, 0), point(10, 4)],
    });
  });

  it('a piece between two free ends joins all three', () => {
    const next = addTrackJoined(view(), asTrack('new', [6, 0], [6, 8]));
    const tracks = next.elements.filter((e) => e.kind === 'track');
    expect(tracks).toHaveLength(1);
    expect(isValidPolyline((tracks[0] as Track).points)).toBe(true);
    expect(
      validateProject({...projectWith(), views: [next]}).filter(
        (p) => p.code === 'junctionWithoutTurnout',
      ),
    ).toEqual([]);
  });

  it('stays separate at a turnout leg, a signal, or a track with a block', () => {
    const withTurnout = viewOf(
      turnout('T', [3, 0]),
      track('a', [4, 0], [8, 0]),
    );
    expect(
      addTrackJoined(withTurnout, asTrack('new', [2, 0], [0, 0])).elements,
    ).toHaveLength(3);

    const withBlock: StationView = {
      ...view(),
      elements: view().elements.map((e) =>
        e.id === 'a' ? {...e, blockId: 'B1'} : e,
      ),
    };
    const next = addTrackJoined(withBlock, asTrack('new', [6, 0], [10, 0]));
    expect(next.elements.filter((e) => e.kind === 'track')).toHaveLength(3);
  });
});
