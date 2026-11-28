// Automation areas (section 9.1): which level applies to an element, and
// where the boundaries between levels are in a view (MIX-1, MIX-3).
import {DiagramElement} from './elements';
import {Direction, GridPoint} from './geometry';
import {AutomationArea, AutomationLevel, Project, StationView} from './project';
import {buildViewTopology, edgeElementId, TopologyEdge} from './topology';

// The area an element belongs to: its own, else its view's default area
// (MIX-1). Undefined if neither exists.
export const areaOf = (
  project: Project,
  view: StationView,
  element: Pick<DiagramElement, 'areaId'>,
): AutomationArea | undefined =>
  project.areas.find((area) => area.id === (element.areaId ?? view.areaId));

// The level for an element; the project default when it has no area.
export const levelOf = (
  project: Project,
  view: StationView,
  element: Pick<DiagramElement, 'areaId'>,
): AutomationLevel =>
  areaOf(project, view, element)?.level ?? project.settings.defaultLevel;

export type AreaBoundary = {
  at: GridPoint;
  // Along the track at this point (for drawing a tick across it).
  direction: Direction;
  areas: [string, string];
  levels: [AutomationLevel, AutomationLevel];
};

// Points where track of two different areas meets (MIX-3). Turnouts count
// with their own area.
export const areaBoundaries = (
  project: Project,
  view: StationView,
): AreaBoundary[] => {
  const topology = buildViewTopology(view);
  const byId = new Map(view.elements.map((element) => [element.id, element]));
  const areaIdOf = (edge: TopologyEdge) => {
    const element = byId.get(edgeElementId(edge));
    return element?.areaId ?? view.areaId;
  };
  const levelOfArea = (id: string) =>
    project.areas.find((area) => area.id === id)?.level ??
    project.settings.defaultLevel;

  const boundaries: AreaBoundary[] = [];
  for (const node of topology.nodes.values()) {
    const edges = (topology.edgesAt.get(node.id) ?? []).map((id) =>
      topology.edgeById.get(id)!,
    );
    const areas = [...new Set(edges.map(areaIdOf))];
    if (areas.length < 2) {
      continue;
    }
    const track = edges.find((edge) => edge.kind === 'track');
    const direction =
      track?.kind === 'track'
        ? track.from === node.id
          ? track.fromDirection
          : track.toDirection
        : 'E';
    boundaries.push({
      at: node.at,
      direction,
      areas: [areas[0], areas[1]],
      levels: [levelOfArea(areas[0]), levelOfArea(areas[1])],
    });
  }
  return boundaries;
};

// The level of every element, and of every block (a block in several areas
// counts at its highest level), for checks per segment (MIX-4).
export const levelMaps = (
  project: Project,
): {
  elements: Map<string, AutomationLevel>;
  blocks: Map<string, AutomationLevel>;
} => {
  const elements = new Map<string, AutomationLevel>();
  const blocks = new Map<string, AutomationLevel>();
  for (const view of project.views) {
    for (const element of view.elements) {
      const level = levelOf(project, view, element);
      elements.set(element.id, level);
      if (element.kind === 'track' && element.blockId) {
        const known = blocks.get(element.blockId) ?? 1;
        blocks.set(element.blockId, Math.max(known, level) as AutomationLevel);
      }
    }
  }
  return {elements, blocks};
};
