// Drawing and reshaping track in the editor (EDT-2): getting exactly onto
// the end of another track or a turnout leg, moving a corner without
// breaking the 45° rule, and joining a new track to the free end of an
// existing one so that a line drawn in pieces is one track.
import {DiagramElement, Track} from './elements';
import {
  Direction,
  directionBetween,
  GridPoint,
  opposite,
  pointKey,
  samePoint,
  simplifyPolyline,
  snapToDirection,
} from './geometry';
import {turnoutPorts} from './ports';
import {StationView} from './project';

// Points a new or reshaped track can connect to, with the direction in which
// the existing track or turnout leg goes on from there (to arrive in line).
export const attachPoints = (
  view: StationView,
  excludeTrackId?: string,
): Map<string, Direction | undefined> => {
  const points = new Map<string, Direction | undefined>();
  for (const element of view.elements) {
    if (element.kind === 'track' && element.id !== excludeTrackId) {
      const p = element.points;
      points.set(pointKey(p[0]), directionBetween(p[0], p[1]));
      const last = p.length - 1;
      points.set(pointKey(p[last]), directionBetween(p[last], p[last - 1]));
    } else if (element.kind === 'turnout') {
      for (const port of turnoutPorts(element)) {
        // Into the turnout, towards its centre.
        points.set(pointKey(port.at), opposite(port.direction));
      }
    }
  }
  return points;
};

// The corners from `from` to exactly `to` (excluding `from`): one straight
// or 45° segment if possible, else two with one 45° bend. `before`: the
// direction of travel arriving at `from`; `onward`: the direction the
// existing track goes on from `to`. The bend is placed so that the new
// track runs on in line with them where it can.
export const pathTo = (
  from: GridPoint,
  to: GridPoint,
  before?: Direction,
  onward?: Direction,
): GridPoint[] => {
  if (samePoint(from, to)) {
    return [];
  }
  if (directionBetween(from, to)) {
    return [to];
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const m = Math.min(Math.abs(dx), Math.abs(dy));
  const diagonal = {x: Math.sign(dx) * m, y: Math.sign(dy) * m};
  // Diagonal first, then straight; or straight first, then diagonal.
  const variants = [
    {x: from.x + diagonal.x, y: from.y + diagonal.y},
    {x: to.x - diagonal.x, y: to.y - diagonal.y},
  ].map((corner) => {
    const first = directionBetween(from, corner);
    const last = directionBetween(corner, to);
    let score = 0;
    if (onward && last === onward) score += 2;
    if (onward && last === opposite(onward)) score -= 5;
    if (before && first === before) score += 1;
    if (before && first === opposite(before)) score -= 5;
    return {corner, score};
  });
  const best =
    variants[1].score > variants[0].score ? variants[1] : variants[0];
  return [best.corner, to];
};

// Where a dragged end of a track goes: onto a connection point near the
// pointer (with a bend if needed), or along the 8 directions from its
// neighbouring corner, so a diagonal can be made longer or shorter.
export const endpointPath = (
  neighbour: GridPoint,
  pointer: GridPoint,
  grid: GridPoint,
  attach: Map<string, Direction | undefined>,
  before?: Direction,
): GridPoint[] => {
  if (samePoint(grid, neighbour)) {
    return [];
  }
  if (attach.has(pointKey(grid))) {
    return pathTo(neighbour, grid, before, attach.get(pointKey(grid)));
  }
  if (directionBetween(neighbour, grid)) {
    return [grid];
  }
  const snapped = snapToDirection(neighbour, pointer);
  return samePoint(snapped, neighbour) ? [] : [snapped];
};

// Where a dragged inner corner can go: the grid point nearest the pointer
// from which both neighbouring corners are straight or 45° away.
export const innerCorner = (
  previous: GridPoint,
  next: GridPoint,
  pointer: GridPoint,
): GridPoint | undefined => {
  let best: GridPoint | undefined;
  let bestDistance = Infinity;
  const cx = Math.round(pointer.x);
  const cy = Math.round(pointer.y);
  const RADIUS = 4;
  for (let x = cx - RADIUS; x <= cx + RADIUS; x++) {
    for (let y = cy - RADIUS; y <= cy + RADIUS; y++) {
      const candidate = {x, y};
      if (
        !directionBetween(previous, candidate) ||
        !directionBetween(candidate, next)
      ) {
        continue;
      }
      const distance = Math.hypot(x - pointer.x, y - pointer.y);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  return best;
};

// The new points of a track while one of its corners is dragged.
export const dragCorner = (
  view: StationView,
  track: Track,
  index: number,
  pointer: GridPoint,
  grid: GridPoint,
): GridPoint[] | undefined => {
  const points = track.points;
  const last = points.length - 1;
  if (index === 0 || index === last) {
    const attach = attachPoints(view, track.id);
    // Work from the far side towards the dragged end.
    const ordered = index === 0 ? [...points].reverse() : points;
    const neighbour = ordered[last - 1];
    const before =
      last >= 2 ? directionBetween(ordered[last - 2], neighbour) : undefined;
    const tail = endpointPath(neighbour, pointer, grid, attach, before);
    if (tail.length === 0) {
      return undefined;
    }
    const result = simplifyPolyline([...ordered.slice(0, last), ...tail]);
    if (result.length < 2) {
      return undefined;
    }
    return index === 0 ? result.reverse() : result;
  }
  const corner = innerCorner(points[index - 1], points[index + 1], pointer);
  if (!corner) {
    return undefined;
  }
  return simplifyPolyline(
    points.map((point, i) => (i === index ? corner : point)),
  );
};

// The corners to add when the next click of the track tool is at `grid`:
// exactly onto a connection point (with a bend if needed), else along the
// nearest of the 8 directions.
export const nextDrawingPoints = (
  view: StationView,
  drawing: GridPoint[],
  pointer: GridPoint,
  grid: GridPoint,
): GridPoint[] => {
  const last = drawing[drawing.length - 1];
  const before =
    drawing.length >= 2
      ? directionBetween(drawing[drawing.length - 2], last)
      : undefined;
  const attach = attachPoints(view);
  if (attach.has(pointKey(grid))) {
    return pathTo(last, grid, before, attach.get(pointKey(grid)));
  }
  const snapped = snapToDirection(last, pointer);
  return samePoint(snapped, last) ? [] : [snapped];
};

// Something at a point that keeps tracks there separate: a turnout leg, or
// a signal, exit, buffer stop or route point.
const occupiedPoints = (view: StationView): Set<string> => {
  const points = new Set<string>();
  for (const element of view.elements) {
    if (element.kind === 'turnout') {
      turnoutPorts(element).forEach((port) => points.add(pointKey(port.at)));
    } else if (
      element.kind === 'signal' ||
      element.kind === 'connector' ||
      element.kind === 'bufferStop' ||
      element.kind === 'virtualPoint'
    ) {
      points.add(pointKey(element.at));
    }
  }
  return points;
};

// Adds a newly drawn track to a view, joined with an existing track that
// ends where it starts or ends, if that end is free (no turnout leg, signal,
// exit or other track there) and the existing track is not part of a
// feedback block (joining would add the new piece to the block). The joined
// track keeps the existing track's id, name and area.
export const addTrackJoined = (
  view: StationView,
  track: Track,
): StationView => {
  const occupied = occupiedPoints(view);
  let elements: DiagramElement[] = view.elements;
  let current = track;
  for (const end of ['start', 'end'] as const) {
    const at =
      end === 'start'
        ? current.points[0]
        : current.points[current.points.length - 1];
    if (occupied.has(pointKey(at))) {
      continue;
    }
    const touching = elements.filter(
      (element): element is Track =>
        element.kind === 'track' &&
        element.id !== current.id &&
        element.points.some((p) => samePoint(p, at)),
    );
    const [other] = touching;
    if (
      touching.length !== 1 ||
      other.blockId !== undefined ||
      // Must end there, not pass through.
      !(
        samePoint(other.points[0], at) ||
        samePoint(other.points[other.points.length - 1], at)
      )
    ) {
      continue;
    }
    // Orient both so that `other` comes first and ends at `at`.
    const otherPoints = samePoint(other.points[other.points.length - 1], at)
      ? other.points
      : [...other.points].reverse();
    const ownPoints = samePoint(current.points[0], at)
      ? current.points
      : [...current.points].reverse();
    const points = simplifyPolyline([...otherPoints, ...ownPoints.slice(1)]);
    // A closed loop cannot be one track (its two ends would be one point).
    if (samePoint(points[0], points[points.length - 1])) {
      continue;
    }
    const joined: Track = {...other, points};
    elements = elements
      .filter((element) => element.id !== current.id)
      .map((element) => (element.id === other.id ? joined : element));
    current = joined;
  }
  if (current === track) {
    elements = [...elements, track];
  }
  return {...view, elements};
};
