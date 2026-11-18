// Full layout view (FULL-1, FULL-2, FULL-5): station views as panels on one
// canvas, each placed and scaled on its own. A panel draws its view's own
// grid coordinates through `translate(x, y) scale(scale)`, so editing a
// station never moves its panel.
import {Bounds, GridPoint} from './geometry';
import {Arrangement, newId, Project, StationView} from './project';

export type Panel = Arrangement['panels'][number];

// Space around a station's drawing inside its panel frame (view units).
export const PANEL_MARGIN = 2;
// Space between panels in a new arrangement (full-view units).
const PANEL_GAP = 4;
export const MIN_PANEL_SCALE = 0.2;
export const MAX_PANEL_SCALE = 5;

const EMPTY_BOUNDS: Bounds = {minX: 0, minY: 0, maxX: 12, maxY: 6};

// Where a view has something drawn (labels count by their anchor).
export const viewBounds = (view: StationView): Bounds => {
  const points: GridPoint[] = view.elements.flatMap((element) =>
    element.kind === 'track'
      ? element.points
      : element.kind === 'platform'
        ? [
            element.at,
            {x: element.at.x + element.width, y: element.at.y + element.height},
          ]
        : [element.at],
  );
  if (points.length === 0) {
    return EMPTY_BOUNDS;
  }
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
};

export type Rect = {x: number; y: number; width: number; height: number};

// A panel's frame in full-view units.
export const panelFrame = (panel: Panel, view: StationView): Rect => {
  const bounds = viewBounds(view);
  return {
    x: panel.x + (bounds.minX - PANEL_MARGIN) * panel.scale,
    y: panel.y + (bounds.minY - PANEL_MARGIN) * panel.scale,
    width: (bounds.maxX - bounds.minX + 2 * PANEL_MARGIN) * panel.scale,
    height: (bounds.maxY - bounds.minY + 2 * PANEL_MARGIN) * panel.scale,
  };
};

// A point of the view in full-view units.
export const toFullView = (panel: Panel, point: GridPoint): GridPoint => ({
  x: panel.x + point.x * panel.scale,
  y: panel.y + point.y * panel.scale,
});

// Panel placed with its frame's top-left corner at (left, top).
const placePanel = (
  view: StationView,
  left: number,
  top: number,
  scale = 1,
): Panel => {
  const bounds = viewBounds(view);
  return {
    viewId: view.id,
    x: left - (bounds.minX - PANEL_MARGIN) * scale,
    y: top - (bounds.minY - PANEL_MARGIN) * scale,
    scale,
  };
};

// Bottom edge of the lowest panel (0 for none).
const bottomOf = (project: Project, panels: Panel[]): number =>
  Math.max(
    0,
    ...panels.flatMap((panel) => {
      const view = project.views.find((v) => v.id === panel.viewId);
      if (!view) {
        return [];
      }
      const frame = panelFrame(panel, view);
      return [frame.y + frame.height];
    }),
  );

// Every station, one below the other, at full size.
export const defaultArrangement = (
  project: Project,
  name: string,
): Arrangement => {
  const panels: Panel[] = [];
  let top = 0;
  for (const view of project.views) {
    const panel = placePanel(view, 0, top);
    panels.push(panel);
    top = bottomOf(project, [panel]) + PANEL_GAP;
  }
  return {id: newId('arrangement'), name, panels, showConnectorLines: true};
};

// The arrangement with a panel for every view: new stations go below the
// others; panels of deleted stations are dropped.
export const syncArrangement = (
  project: Project,
  arrangement: Arrangement,
): Arrangement => {
  const viewIds = new Set(project.views.map((view) => view.id));
  const panels = arrangement.panels.filter((panel) =>
    viewIds.has(panel.viewId),
  );
  const placed = new Set(panels.map((panel) => panel.viewId));
  const missing = project.views.filter((view) => !placed.has(view.id));
  if (missing.length === 0 && panels.length === arrangement.panels.length) {
    return arrangement;
  }
  for (const view of missing) {
    const top = panels.length > 0 ? bottomOf(project, panels) + PANEL_GAP : 0;
    panels.push(placePanel(view, 0, top));
  }
  return {...arrangement, panels};
};

// The arrangements to show: the saved ones (kept in step with the views), or
// a default one that is saved only once it is changed.
export const arrangementsOf = (
  project: Project,
  defaultName: string,
): Arrangement[] =>
  project.arrangements.length > 0
    ? project.arrangements.map((a) => syncArrangement(project, a))
    : [defaultArrangement(project, defaultName)];

// Applies a change to one arrangement and saves all of them (the default
// one too, the first time).
export const updateArrangement = (
  project: Project,
  defaultName: string,
  arrangementId: string,
  change: (arrangement: Arrangement) => Arrangement,
): Project => ({
  ...project,
  arrangements: arrangementsOf(project, defaultName).map((arrangement) =>
    arrangement.id === arrangementId ? change(arrangement) : arrangement,
  ),
});

export const movePanel = (
  arrangement: Arrangement,
  viewId: string,
  dx: number,
  dy: number,
): Arrangement => ({
  ...arrangement,
  panels: arrangement.panels.map((panel) =>
    panel.viewId === viewId
      ? {...panel, x: panel.x + dx, y: panel.y + dy}
      : panel,
  ),
});

// Scales a panel about its frame's top-left corner, so it grows to the
// right and down.
export const scalePanel = (
  project: Project,
  arrangement: Arrangement,
  viewId: string,
  scale: number,
): Arrangement => {
  const view = project.views.find((v) => v.id === viewId);
  const clamped =
    Math.round(
      Math.min(MAX_PANEL_SCALE, Math.max(MIN_PANEL_SCALE, scale)) * 100,
    ) / 100;
  return {
    ...arrangement,
    panels: arrangement.panels.map((panel) => {
      if (panel.viewId !== viewId || !view) {
        return panel;
      }
      const frame = panelFrame(panel, view);
      return placePanel(view, frame.x, frame.y, clamped);
    }),
  };
};
