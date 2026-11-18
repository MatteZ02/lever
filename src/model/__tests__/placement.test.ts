import {describe, expect, it} from 'vitest';
import {placeReplacing} from '../editing';
import {DiagramElement} from '../elements';
import {
  elementsReplacedBy,
  holdsUserData,
  placeElement,
  sameAsExisting,
  trackAt,
} from '../placement';
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

describe('placing where an element already is', () => {
  const place = (
    elements: DiagramElement[],
    kind: Parameters<typeof placeElement>[1],
    at: {x: number; y: number},
  ) => {
    const project = projectWith(track('line', [0, 0], [6, 0]));
    const withElements = {
      ...project,
      views: [
        {
          ...project.views[0],
          elements: [...project.views[0].elements, ...elements],
        },
      ],
    };
    const result = placeElement(withElements.views[0], kind, at);
    if (!result.ok) {
      throw new Error(result.reason);
    }
    return {project: withElements, element: result.element};
  };
  const exit: DiagramElement = {
    kind: 'connector',
    id: 'exit',
    name: '',
    at: point(0, 0),
    direction: 'W',
  };

  it('given a station exit at a track end, when a buffer stop is placed there, then it replaces the exit', () => {
    const {project, element} = place([exit], 'bufferStop', point(0, 0));
    const replaced = elementsReplacedBy(project.views[0], element);
    expect(replaced.map((e) => e.id)).toEqual(['exit']);
    expect(holdsUserData(replaced[0])).toBe(false);

    const after = placeReplacing(project, project.views[0].id, element, [
      'exit',
    ]);
    const ends = after.views[0].elements.filter(
      (e) => e.kind === 'bufferStop' || e.kind === 'connector',
    );
    expect(ends).toEqual([element]);
  });

  it('given a named or paired station exit, then replacing it needs a confirmation', () => {
    expect(holdsUserData({...exit, name: 'Nebenbahn'})).toBe(true);
    expect(
      holdsUserData({...exit, pairedWith: {viewId: 'v', connectorId: 'c'}}),
    ).toBe(true);
  });

  it('given a turnout, when another turnout is placed on it, then it is replaced after a confirmation', () => {
    const {project, element: first} = place([], 'turnout', point(3, 0));
    const withFirst = placeReplacing(project, project.views[0].id, first, []);
    const second = placeElement(withFirst.views[0], 'turnout', point(3, 0), {
      turnoutType: 'left',
    });
    if (!second.ok) {
      throw new Error(second.reason);
    }
    const replaced = elementsReplacedBy(withFirst.views[0], second.element);
    expect(replaced.map((e) => e.id)).toEqual([first.id]);
    expect(holdsUserData(replaced[0])).toBe(true);
  });

  it('given a signal, a signal for the other direction is added beside it', () => {
    const {project, element: east} = place([], 'signal', point(3, 0));
    const withEast = placeReplacing(project, project.views[0].id, east, []);
    const west = placeElement(withEast.views[0], 'signal', point(3, 0), {
      rotation: 1,
    });
    if (!west.ok) {
      throw new Error(west.reason);
    }
    expect(elementsReplacedBy(withEast.views[0], west.element)).toEqual([]);
    const again = placeElement(withEast.views[0], 'signal', point(3, 0));
    if (!again.ok) {
      throw new Error(again.reason);
    }
    expect(
      elementsReplacedBy(withEast.views[0], again.element).map((e) => e.id),
    ).toEqual([east.id]);
  });

  it('given a turnout, the same turnout placed again on it changes nothing', () => {
    const {project, element: first} = place([], 'turnout', point(3, 0));
    const withFirst = placeReplacing(project, project.views[0].id, first, []);
    const same = placeElement(withFirst.views[0], 'turnout', point(3, 0));
    const left = placeElement(withFirst.views[0], 'turnout', point(3, 0), {
      turnoutType: 'left',
    });
    if (!same.ok || !left.ok) {
      throw new Error('not placed');
    }
    expect(sameAsExisting(same.element, first)).toBe(true);
    expect(sameAsExisting(left.element, first)).toBe(false);
  });

  it('labels never replace anything', () => {
    const {project, element: first} = place([], 'label', point(3, 2));
    const withLabel = placeReplacing(project, project.views[0].id, first, []);
    const {element: second} = place([], 'label', point(3, 2));
    expect(elementsReplacedBy(withLabel.views[0], second)).toEqual([]);
  });
});
