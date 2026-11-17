// Pure editing operations on a project (EDT-3). The editor calls these and
// keeps the results in its undo history; nothing here knows about the UI.
import {DiagramElement, Track, Turnout} from './elements';
import {
  add,
  boundsOf,
  Direction,
  directionBetween,
  expandPolyline,
  GridPoint,
  opposite,
  pointKey,
  rotateDirection,
  rotatePoint90,
  samePoint,
  simplifyPolyline,
  step,
} from './geometry';
import {turnoutGeometry} from './ports';
import {newId, Project, StationView} from './project';

export const updateView = (
  project: Project,
  viewId: string,
  update: (view: StationView) => StationView,
): Project => ({
  ...project,
  views: project.views.map((view) =>
    view.id === viewId ? update(view) : view,
  ),
});

export const addElements = (
  project: Project,
  viewId: string,
  elements: DiagramElement[],
): Project =>
  updateView(project, viewId, (view) => ({
    ...view,
    elements: [...view.elements, ...elements],
  }));

export const replaceElement = (
  project: Project,
  element: DiagramElement,
): Project => ({
  ...project,
  views: project.views.map((view) =>
    view.elements.some((candidate) => candidate.id === element.id)
      ? {
          ...view,
          elements: view.elements.map((candidate) =>
            candidate.id === element.id ? element : candidate,
          ),
        }
      : view,
  ),
});

// Deletes elements and every reference to them (distant signals, connector
// pairings, saved routes).
export const deleteElements = (project: Project, ids: string[]): Project => {
  const removed = new Set(ids);
  const views = project.views.map((view) => ({
    ...view,
    elements: view.elements
      .filter((element) => !removed.has(element.id))
      .map((element): DiagramElement => {
        if (
          element.kind === 'signal' &&
          element.distantFor !== undefined &&
          removed.has(element.distantFor)
        ) {
          return {...element, distantFor: undefined};
        }
        if (
          element.kind === 'connector' &&
          element.pairedWith &&
          removed.has(element.pairedWith.connectorId)
        ) {
          return {...element, pairedWith: undefined};
        }
        return element;
      }),
  }));
  return {
    ...project,
    views,
    routes: project.routes.filter(
      (route) =>
        !removed.has(route.from) &&
        !removed.has(route.to) &&
        !route.via.some((id) => removed.has(id)),
    ),
  };
};

// --- geometry of whole elements --------------------------------------------

export const elementPoints = (element: DiagramElement): GridPoint[] => {
  switch (element.kind) {
    case 'track':
      return element.points;
    case 'platform':
      return [
        element.at,
        {x: element.at.x + element.width, y: element.at.y + element.height},
      ];
    default:
      return [element.at];
  }
};

const translate = (
  element: DiagramElement,
  offset: GridPoint,
): DiagramElement => {
  switch (element.kind) {
    case 'track':
      return {...element, points: element.points.map((p) => add(p, offset))};
    default:
      return {...element, at: add(element.at, offset)};
  }
};

export const moveElements = (
  project: Project,
  viewId: string,
  ids: string[],
  offset: GridPoint,
): Project => {
  const moving = new Set(ids);
  return updateView(project, viewId, (view) => ({
    ...view,
    elements: view.elements.map((element) =>
      moving.has(element.id) ? translate(element, offset) : element,
    ),
  }));
};

// Rotates the selection. A single point element turns by 45° clockwise (a
// signal reverses its facing instead, so it stays along its track). Anything
// else turns 90° clockwise around the centre of the selection.
export const rotateElements = (
  project: Project,
  viewId: string,
  ids: string[],
): Project => {
  const view = project.views.find((candidate) => candidate.id === viewId);
  if (!view) {
    return project;
  }
  const selected = view.elements.filter((element) => ids.includes(element.id));
  if (selected.length === 1 && selected[0].kind !== 'track') {
    const element = selected[0];
    switch (element.kind) {
      case 'turnout':
        return replaceElement(project, {
          ...element,
          orientation: rotateDirection(element.orientation, -1),
        });
      case 'signal':
        return replaceElement(project, {
          ...element,
          facing: opposite(element.facing),
        });
      case 'bufferStop':
      case 'connector':
        return replaceElement(project, {
          ...element,
          direction: rotateDirection(element.direction, -1),
        });
      default:
        break;
    }
  }
  const bounds = boundsOf(selected.flatMap(elementPoints));
  if (!bounds) {
    return project;
  }
  const pivot = {
    x: Math.round((bounds.minX + bounds.maxX) / 2),
    y: Math.round((bounds.minY + bounds.maxY) / 2),
  };
  const turn = (point: GridPoint) => rotatePoint90(point, pivot);
  const turnDirection = (direction: Direction) =>
    rotateDirection(direction, -2);
  const rotated = selected.map((element): DiagramElement => {
    switch (element.kind) {
      case 'track':
        return {...element, points: element.points.map(turn)};
      case 'turnout':
        return {
          ...element,
          at: turn(element.at),
          orientation: turnDirection(element.orientation),
        };
      case 'signal':
        return {
          ...element,
          at: turn(element.at),
          facing: turnDirection(element.facing),
        };
      case 'bufferStop':
      case 'connector':
        return {
          ...element,
          at: turn(element.at),
          direction: turnDirection(element.direction),
        };
      case 'platform': {
        // The corner that ends up top-left after turning.
        const corner = turn({
          x: element.at.x,
          y: element.at.y + element.height,
        });
        return {
          ...element,
          at: corner,
          width: element.height,
          height: element.width,
        };
      }
      default:
        return {...element, at: turn(element.at)};
    }
  });
  return rotated.reduce(replaceElement, project);
};

// Copies for pasting: new ids, moved by `offset`. Addresses, blocks and
// pairings are not copied, because a copy is a different physical object.
export const cloneForPaste = (
  elements: DiagramElement[],
  offset: GridPoint,
): DiagramElement[] => {
  const idMap = new Map(
    elements.map((element) => [element.id, newId(element.kind)]),
  );
  return elements.map((element): DiagramElement => {
    const copy = {...translate(element, offset), id: idMap.get(element.id)!};
    switch (copy.kind) {
      case 'track':
        return {...copy, blockId: undefined};
      case 'turnout':
        return {
          ...copy,
          control:
            copy.control.kind === 'dcc'
              ? {...copy.control, addresses: []}
              : copy.control,
          positionFeedback: undefined,
        };
      case 'signal':
        return {
          ...copy,
          control:
            copy.control.kind === 'dcc'
              ? {...copy.control, addresses: []}
              : copy.control,
          distantFor:
            copy.distantFor !== undefined
              ? idMap.get(copy.distantFor)
              : undefined,
        };
      case 'accessory':
        return {
          ...copy,
          control:
            copy.control.kind === 'dcc'
              ? {...copy.control, addresses: []}
              : copy.control,
        };
      case 'connector':
        return {...copy, pairedWith: undefined};
      default:
        return copy;
    }
  });
};

// --- inserting turnouts into drawn track -------------------------------------

// Splits a track at a grid point that lies on it. Returns the pieces (one if
// the point is an end point or not on the track).
export const splitTrack = (track: Track, at: GridPoint): Track[] => {
  const points = expandPolyline(track.points);
  const index = points.findIndex((point) => samePoint(point, at));
  if (index <= 0 || index >= points.length - 1) {
    return [track];
  }
  return [
    {...track, points: simplifyPolyline(points.slice(0, index + 1))},
    {
      ...track,
      id: newId('track'),
      points: simplifyPolyline(points.slice(index)),
    },
  ];
};

// The straight lines through a turnout's centre that existing track can be
// cut along: pairs of ports opposite each other.
const throughLines = (turnout: Turnout): [Direction, Direction][] => {
  const ports = turnoutGeometry(turnout.type, turnout.orientation).ports;
  const lines: [Direction, Direction][] = [];
  for (const port of ports) {
    const other = ports.find(
      (candidate) => candidate.direction === opposite(port.direction),
    );
    if (
      other &&
      !lines.some(([a, b]) => a === other.direction && b === port.direction)
    ) {
      lines.push([port.direction, other.direction]);
    }
  }
  return lines;
};

// Adds a turnout and, where existing track runs straight through its centre
// along one of its through lines, cuts that track so it ends at the ports.
// Track that ends exactly at the centre is shortened to end at the port.
// This is how a ladder is drawn: draw the line, drop turnouts onto it.
export const insertTurnout = (
  project: Project,
  viewId: string,
  turnout: Turnout,
): Project =>
  updateView(project, viewId, (view) => {
    const lines = throughLines(turnout);
    const centre = turnout.at;
    const portPoints = new Set(
      turnoutGeometry(turnout.type, turnout.orientation).ports.map((port) =>
        pointKey(step(centre, port.direction)),
      ),
    );
    const elements: DiagramElement[] = [];
    for (const element of view.elements) {
      if (element.kind !== 'track') {
        elements.push(element);
        continue;
      }
      const points = expandPolyline(element.points);
      const index = points.findIndex((point) => samePoint(point, centre));
      if (index < 0) {
        elements.push(element);
        continue;
      }
      const before =
        index > 0 ? directionBetween(centre, points[index - 1]) : undefined;
      const after =
        index < points.length - 1
          ? directionBetween(centre, points[index + 1])
          : undefined;
      const alongLine = lines.some(
        ([a, b]) =>
          (before === undefined || before === a || before === b) &&
          (after === undefined || after === a || after === b),
      );
      if (!alongLine) {
        elements.push(element);
        continue;
      }
      // Keep the parts outside the turnout: up to the port before the centre
      // and from the port after it.
      const head = index > 0 ? points.slice(0, index) : [];
      const tail = index < points.length - 1 ? points.slice(index + 1) : [];
      if (head.length >= 2 && portPoints.has(pointKey(head[head.length - 1]))) {
        elements.push({...element, points: simplifyPolyline(head)});
      }
      if (tail.length >= 2 && portPoints.has(pointKey(tail[0]))) {
        elements.push({
          ...element,
          id: head.length >= 2 ? newId('track') : element.id,
          points: simplifyPolyline(tail),
        });
      }
    }
    return {...view, elements: [...elements, turnout]};
  });

// Appends one step-validated point to a track being drawn; merges collinear
// runs. Returns undefined if the new point is not on one of the 8 directions.
export const extendPolyline = (
  points: GridPoint[],
  next: GridPoint,
): GridPoint[] | undefined => {
  const last = points[points.length - 1];
  if (!directionBetween(last, next)) {
    return undefined;
  }
  return simplifyPolyline([...points, next]);
};
