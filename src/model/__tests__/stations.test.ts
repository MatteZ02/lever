// Phase 4 model: station connectors (FULL-3), the project topology across
// stations, and full-view arrangements (FULL-2, FULL-5).
import {describe, expect, it} from 'vitest';
import {
  arrangementsOf,
  defaultArrangement,
  panelFrame,
  scalePanel,
  syncArrangement,
  toFullView,
} from '../arrangement';
import {pairConnectors, partnerOf, unpairConnector} from '../connectors';
import {deleteElements} from '../editing';
import {DiagramElement, StationConnector} from '../elements';
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
    schemaVersion: 1,
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

describe('full layout arrangements (FULL-2, FULL-5)', () => {
  it('stacks stations without overlap by default', () => {
    const project = twoStations();
    const arrangement = defaultArrangement(project, 'Full layout');
    const [a, b] = arrangement.panels.map((panel, i) =>
      panelFrame(panel, project.views[i]),
    );
    expect(a.x).toBe(0);
    expect(b.x).toBe(0);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
  });

  it('is not saved until changed, and keeps up with added and deleted stations', () => {
    const project = twoStations();
    expect(arrangementsOf(project, 'Full layout')).toHaveLength(1);
    // Stable until saved, so a change can find it again.
    expect(arrangementsOf(project, 'Full layout')[0].id).toBe(
      arrangementsOf(project, 'Full layout')[0].id,
    );
    expect(project.arrangements).toEqual([]);

    const saved = defaultArrangement(project, 'Full layout');
    const withC: Project = {
      ...project,
      views: [
        project.views[1],
        {id: 'C', name: 'C', areaId: 'area-B', elements: []},
      ],
    };
    const synced = syncArrangement(withC, saved);
    expect(synced.panels.map((panel) => panel.viewId)).toEqual(['B', 'C']);
  });

  it('scales a panel about its top-left corner', () => {
    const project = twoStations();
    const arrangement = defaultArrangement(project, 'Full layout');
    const before = panelFrame(arrangement.panels[1], project.views[1]);
    const scaled = scalePanel(project, arrangement, 'B', 0.5);
    const panel = scaled.panels[1];
    const after = panelFrame(panel, project.views[1]);
    expect(panel.scale).toBe(0.5);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(after.width).toBeCloseTo(before.width / 2);
    // A point of the station follows the panel.
    expect(toFullView(panel, {x: 2, y: 4})).toEqual({
      x: panel.x + 1,
      y: panel.y + 2,
    });
  });
});
