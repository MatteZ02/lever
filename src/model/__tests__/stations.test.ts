// Phase 4 model: station connectors (FULL-3), the project topology across
// stations, and layout views with drawn frames and lines (FULL-2, FULL-5).
import {describe, expect, it} from 'vitest';
import {
  addFrame,
  addLine,
  arrangementsOf,
  createArrangement,
  deleteFrame,
  exitsOnView,
  frameTransform,
  linePointAt,
  linePoints,
  moveFrame,
  rectBetween,
  resizeFrame,
  rotateFrame,
  setFrameStation,
  toView,
  transformBounds,
} from '../arrangement';
import {pairConnectors, partnerOf, unpairConnector} from '../connectors';
import {deleteElements, moveLayoutView, moveStation, moveTo} from '../editing';
import {DiagramElement, StationConnector} from '../elements';
import {loadProject, serializeProject} from '../migrations';
import {Project} from '../project';
import {buildProjectTopology, edgesAtNode, nodeId} from '../topology';
import {validateProject} from '../validation';
import {track} from './testLayouts';

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

// Two stations: A's east exit and B's west entry, plus a spare exit in B.
const twoStations = (): Project => {
  const view = (id: string, elements: DiagramElement[]) => ({
    id,
    name: id,
    areaId: `area-${id}`,
    elements,
  });
  return {
    format: 'lever-project',
    schemaVersion: 2,
    id: 'p',
    name: 'Test',
    settings: {} as Project['settings'],
    views: [
      view('A', [track('a', [0, 0], [6, 0]), connector('A-east', [6, 0], 'E')]),
      view('B', [
        connector('B-west', [0, 4], 'W'),
        track('b', [0, 4], [8, 4]),
        connector('B-east', [8, 4], 'E'),
      ]),
    ],
    arrangements: [],
    areas: [
      {id: 'area-A', name: 'A', level: 1},
      {id: 'area-B', name: 'B', level: 1},
    ],
    blocks: [],
    signalTypes: [],
    routes: [],
    locos: [],
    schedules: [],
  };
};

const connectorById = (project: Project, id: string) =>
  project.views
    .flatMap((view) => view.elements)
    .find((e): e is StationConnector => e.kind === 'connector' && e.id === id)!;

describe('station connectors (FULL-3)', () => {
  it('pairs two exits with each other', () => {
    const project = pairConnectors(twoStations(), 'A-east', 'B-west');
    expect(connectorById(project, 'A-east').pairedWith).toEqual({
      viewId: 'B',
      connectorId: 'B-west',
    });
    expect(partnerOf(project, connectorById(project, 'B-west'))).toMatchObject({
      viewId: 'A',
      connector: {id: 'A-east'},
    });
  });

  it('given a pair, pairing one side elsewhere unpairs its old partner', () => {
    let project = pairConnectors(twoStations(), 'A-east', 'B-west');
    project = pairConnectors(project, 'A-east', 'B-east');
    expect(connectorById(project, 'B-west').pairedWith).toBeUndefined();
    expect(connectorById(project, 'B-east').pairedWith?.connectorId).toBe(
      'A-east',
    );
    expect(
      validateProject(project).filter((p) => p.code === 'brokenConnectorPair'),
    ).toEqual([]);
  });

  it('unpairs both sides, and deleting one side unpairs the other', () => {
    const paired = pairConnectors(twoStations(), 'A-east', 'B-west');
    const unpaired = unpairConnector(paired, 'B-west');
    expect(connectorById(unpaired, 'A-east').pairedWith).toBeUndefined();
    const deleted = deleteElements(paired, ['A-east']);
    expect(connectorById(deleted, 'B-west').pairedWith).toBeUndefined();
  });

  it('reports a pairing that is not mutual', () => {
    const project = twoStations();
    connectorById(project, 'A-east').pairedWith = {
      viewId: 'B',
      connectorId: 'B-west',
    };
    expect(
      validateProject(project)
        .filter((p) => p.code === 'brokenConnectorPair')
        .map((p) => p.elementIds),
    ).toEqual([['A-east']]);
  });

  it('joins the stations into one graph through a pair', () => {
    const before = buildProjectTopology(twoStations());
    expect(before.edges.filter((e) => e.kind === 'link')).toEqual([]);

    const topology = buildProjectTopology(
      pairConnectors(twoStations(), 'A-east', 'B-west'),
    );
    const links = topology.edges.filter((e) => e.kind === 'link');
    expect(links).toHaveLength(1);
    // From A's exit node, the link leads into B's entry node.
    const atExit = edgesAtNode(topology, nodeId('A', {x: 6, y: 0}));
    expect(atExit.map((e) => e.kind).sort()).toEqual(['link', 'track']);
    const link = atExit.find((e) => e.kind === 'link')!;
    expect([link.from, link.to]).toContain(nodeId('B', {x: 0, y: 4}));
  });
});

describe('layout views (FULL-2, FULL-5)', () => {
  // A view with A in a wide frame and B in a tall one.
  const twoFrames = () => {
    let view = createArrangement('Main');
    view = addFrame(view, 'A', {x: 0, y: 0, width: 20, height: 10}, 'fA');
    view = addFrame(view, 'B', {x: 30, y: 0, width: 10, height: 20}, 'fB');
    return view;
  };

  it('starts empty: no station is shown until a frame is drawn for it', () => {
    const view = createArrangement('Main');
    expect(view.frames).toEqual([]);
    expect(view.lines).toEqual([]);
  });

  it('draws frames between two corners on whole grid steps', () => {
    expect(rectBetween({x: 5.4, y: 8.6}, {x: 1.2, y: 2.4})).toEqual({
      x: 1,
      y: 2,
      width: 4,
      height: 7,
    });
  });

  it('given a frame, fits its station inside, centred and as large as fits', () => {
    const project = twoStations();
    for (const frame of twoFrames().frames) {
      const view = project.views.find((v) => v.id === frame.viewId)!;
      const filled = transformBounds(frameTransform(frame, view), view);
      // Touches the frame on one axis, centred on both.
      const fitsWidth = Math.abs(filled.width - frame.width) < 1e-9;
      const fitsHeight = Math.abs(filled.height - frame.height) < 1e-9;
      expect(fitsWidth || fitsHeight).toBe(true);
      expect(filled.x + filled.width / 2).toBeCloseTo(
        frame.x + frame.width / 2,
      );
      expect(filled.y + filled.height / 2).toBeCloseTo(
        frame.y + frame.height / 2,
      );
    }
  });

  it('turns the station inside its frame by quarter turns, the frame staying', () => {
    const project = twoStations();
    let arrangement = rotateFrame(twoFrames(), 'fB', 1);
    const frame = arrangement.frames[1];
    expect(frame).toMatchObject({rotation: 90, x: 30, width: 10});
    const transform = frameTransform(frame, project.views[1]);
    // B runs along x; turned 90° clockwise it runs down the tall frame.
    const west = toView(transform, {x: 0, y: 4});
    const east = toView(transform, {x: 8, y: 4});
    expect(east.x).toBeCloseTo(west.x);
    expect(east.y).toBeGreaterThan(west.y);
    for (let i = 0; i < 3; i++) arrangement = rotateFrame(arrangement, 'fB', 1);
    expect(arrangement.frames[1].rotation).toBe(0);
  });

  it('moves and resizes frames, never below the minimum size', () => {
    let arrangement = moveFrame(twoFrames(), 'fA', 2, -1);
    expect(arrangement.frames[0]).toMatchObject({x: 2, y: -1});
    arrangement = resizeFrame(arrangement, 'fA', {x: 12.4, y: 0});
    expect(arrangement.frames[0]).toMatchObject({width: 10, height: 3});
  });

  it('attaches line ends to nearby exits, which then follow their frame', () => {
    const project = twoStations();
    let arrangement = twoFrames();
    const exits = exitsOnView(project, arrangement);
    const aEast = exits.find((e) => e.connectorId === 'A-east')!;
    const start = linePointAt(exits, {x: aEast.at.x + 0.3, y: aEast.at.y});
    expect(start).toEqual({frameId: 'fA', connectorId: 'A-east'});
    // Away from exits: the nearest grid point.
    expect(linePointAt(exits, {x: 25.4, y: 2.6})).toEqual({x: 25, y: 3});
    const end = linePointAt(
      exits,
      exits.find((e) => e.connectorId === 'B-west')!.at,
    );
    arrangement = addLine(arrangement, [start, {x: 25, y: 3}, end], 'L');
    const before = linePoints(project, arrangement, arrangement.lines[0]);
    const moved = moveFrame(arrangement, 'fA', 0, 5);
    const after = linePoints(project, moved, moved.lines[0]);
    expect(after[0]).toEqual({x: before[0].x, y: before[0].y + 5});
    expect(after[1]).toEqual(before[1]);
    expect(after[2]).toEqual(before[2]);
  });

  it('drops line ends at a deleted frame, and lines left with one point', () => {
    let arrangement = addLine(
      twoFrames(),
      [
        {frameId: 'fA', connectorId: 'A-east'},
        {frameId: 'fB', connectorId: 'B-west'},
      ],
      'short',
    );
    arrangement = addLine(
      arrangement,
      [
        {frameId: 'fA', connectorId: 'A-east'},
        {x: 25, y: 3},
        {x: 25, y: 8},
      ],
      'long',
    );
    const withoutB = deleteFrame(arrangement, 'fB');
    expect(withoutB.lines.map((line) => line.id)).toEqual(['long']);
    // Another station in A's frame: A's exits are not there any more.
    const swapped = setFrameStation(arrangement, 'fA', 'B');
    expect(swapped.lines.map((line) => line.points.length)).toEqual([2]);
    expect(swapped.lines[0].id).toBe('long');
  });

  it('hides frames of deleted stations', () => {
    const project = twoStations();
    const withView: Project = {
      ...project,
      arrangements: [twoFrames()],
      views: [project.views[1]],
    };
    expect(arrangementsOf(withView)[0].frames.map((f) => f.id)).toEqual(['fB']);
  });

  it('given a version 1 file, keeps each arrangement looking the same', () => {
    const project = pairConnectors(twoStations(), 'A-east', 'B-west');
    const v1 = {
      ...JSON.parse(serializeProject(project)),
      schemaVersion: 1,
      arrangements: [
        {
          id: 'arr',
          name: 'Full layout',
          panels: [
            {viewId: 'A', x: 0, y: 0, scale: 1, rotation: 0},
            {viewId: 'B', x: 3, y: 10, scale: 0.5, rotation: 90},
          ],
          showConnectorLines: true,
        },
      ],
    };
    const result = loadProject(JSON.stringify(v1));
    expect(result).toMatchObject({ok: true, migratedFrom: 1});
    if (!result.ok) {
      return;
    }
    const [arrangement] = result.project.arrangements;
    expect(arrangement.name).toBe('Full layout');
    const frameB = arrangement.frames[1];
    const transform = frameTransform(frameB, result.project.views[1]);
    expect(transform.scale).toBeCloseTo(0.5);
    expect(transform.x).toBeCloseTo(3);
    expect(transform.y).toBeCloseTo(10);
    expect(transform.rotation).toBe(90);
    // The automatic line between the linked exits is now a drawn one.
    expect(arrangement.lines).toHaveLength(1);
    expect(arrangement.lines[0].points).toEqual([
      {frameId: arrangement.frames[0].id, connectorId: 'A-east'},
      {frameId: frameB.id, connectorId: 'B-west'},
    ]);
  });
});

describe('tab order', () => {
  it('moves an item to a place, the others keeping their order', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => ({id}));
    const ids = (list: {id: string}[]) => list.map((item) => item.id);
    expect(ids(moveTo(items, 'a', 2))).toEqual(['b', 'c', 'a', 'd']);
    expect(ids(moveTo(items, 'd', 0))).toEqual(['d', 'a', 'b', 'c']);
    expect(ids(moveTo(items, 'b', 99))).toEqual(['a', 'c', 'd', 'b']);
    // Nothing to do: the same list, so no undo step is made.
    expect(moveTo(items, 'b', 1)).toBe(items);
    expect(moveTo(items, 'x', 0)).toBe(items);
  });

  it('given stations and views, reorders each list on its own', () => {
    const project: Project = {
      ...twoStations(),
      arrangements: [
        {id: 'V1', name: 'V1', frames: [], lines: []},
        {id: 'V2', name: 'V2', frames: [], lines: []},
      ],
    };
    const stations = moveStation(project, 'B', 0);
    expect(stations.views.map((v) => v.id)).toEqual(['B', 'A']);
    expect(stations.arrangements).toBe(project.arrangements);
    const views = moveLayoutView(project, 'V2', 0);
    expect(views.arrangements.map((a) => a.id)).toEqual(['V2', 'V1']);
    expect(views.views).toBe(project.views);
    expect(moveStation(project, 'A', 0)).toBe(project);
  });
});
