// Layout views (FULL-1, FULL-2, FULL-5; reworked with the user 2026-11-20):
// a view is a blank canvas on which the user draws station frames and the
// lines between them. Each frame shows one station, fitted inside: the
// station's own grid coordinates are drawn through
// `translate(x, y) scale(scale) rotate(rotation)` (a FrameTransform), so
// editing a station never moves its frame. (Internally a view of this kind is
// an "arrangement", so it is not mixed up with StationView.)
import {Bounds, GridPoint, rotatePoint90} from './geometry';
import {
  Arrangement,
  LinePoint,
  newId,
  Project,
  StationFrame,
  StationView,
  ViewLine,
} from './project';

export type FrameRotation = StationFrame['rotation'];
export type Point = {x: number; y: number};
export type Rect = {x: number; y: number; width: number; height: number};
// Where a station's grid lands on the view.
export type FrameTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: FrameRotation;
};

const ORIGIN: GridPoint = {x: 0, y: 0};

// Space around a station's drawing inside its frame (station units).
export const FRAME_MARGIN = 2;
// The smallest frame that can be drawn (view units).
export const MIN_FRAME_SIZE = 3;

const EMPTY_BOUNDS: Bounds = {minX: 0, minY: 0, maxX: 12, maxY: 6};

// Where a station has something drawn (labels count by their anchor).
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

// The station's drawing with its margin, turned, before scaling.
const rotatedBounds = (view: StationView, rotation: FrameRotation): Bounds => {
  const bounds = viewBounds(view);
  const corners = [
    {x: bounds.minX - FRAME_MARGIN, y: bounds.minY - FRAME_MARGIN},
    {x: bounds.maxX + FRAME_MARGIN, y: bounds.maxY + FRAME_MARGIN},
  ].map((corner) => rotatePoint90(corner, ORIGIN, rotation / 90));
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxX: Math.max(...corners.map((c) => c.x)),
    maxY: Math.max(...corners.map((c) => c.y)),
  };
};

// The station fitted into its frame: as large as fits, centred.
export const frameTransform = (
  frame: StationFrame,
  view: StationView,
): FrameTransform => {
  const bounds = rotatedBounds(view, frame.rotation);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const scale = Math.min(frame.width / width, frame.height / height);
  return {
    x: frame.x + (frame.width - width * scale) / 2 - bounds.minX * scale,
    y: frame.y + (frame.height - height * scale) / 2 - bounds.minY * scale,
    scale,
    rotation: frame.rotation,
  };
};

// The rectangle a transform fills (the station with its margin).
export const transformBounds = (
  transform: FrameTransform,
  view: StationView,
): Rect => {
  const bounds = rotatedBounds(view, transform.rotation);
  return {
    x: transform.x + bounds.minX * transform.scale,
    y: transform.y + bounds.minY * transform.scale,
    width: (bounds.maxX - bounds.minX) * transform.scale,
    height: (bounds.maxY - bounds.minY) * transform.scale,
  };
};

// A point of the station on the view.
export const toView = (transform: FrameTransform, point: GridPoint): Point => {
  const turned = rotatePoint90(point, ORIGIN, transform.rotation / 90);
  return {
    x: transform.x + turned.x * transform.scale,
    y: transform.y + turned.y * transform.scale,
  };
};

// --- views ---------------------------------------------------------------

export const createArrangement = (name: string): Arrangement => ({
  id: newId('arrangement'),
  name,
  frames: [],
  lines: [],
});

// Frames of deleted stations are not shown, nor line points at them.
export const syncArrangement = (
  project: Project,
  arrangement: Arrangement,
): Arrangement => {
  const viewIds = new Set(project.views.map((view) => view.id));
  const frames = arrangement.frames.filter((frame) =>
    viewIds.has(frame.viewId),
  );
  if (frames.length === arrangement.frames.length) {
    return arrangement;
  }
  return withoutDeadLines({...arrangement, frames});
};

export const arrangementsOf = (project: Project): Arrangement[] =>
  project.arrangements.map((a) => syncArrangement(project, a));

// Applies a change to one view.
export const updateArrangement = (
  project: Project,
  arrangementId: string,
  change: (arrangement: Arrangement) => Arrangement,
): Project => ({
  ...project,
  arrangements: project.arrangements.map((arrangement) =>
    arrangement.id === arrangementId
      ? change(syncArrangement(project, arrangement))
      : arrangement,
  ),
});

// --- frames ----------------------------------------------------------------

// A rectangle between two corners, on whole grid units.
export const rectBetween = (a: Point, b: Point): Rect => {
  const x1 = Math.round(Math.min(a.x, b.x));
  const y1 = Math.round(Math.min(a.y, b.y));
  const x2 = Math.round(Math.max(a.x, b.x));
  const y2 = Math.round(Math.max(a.y, b.y));
  return {x: x1, y: y1, width: x2 - x1, height: y2 - y1};
};

export const isFrameSize = (rect: Rect): boolean =>
  rect.width >= MIN_FRAME_SIZE && rect.height >= MIN_FRAME_SIZE;

export const addFrame = (
  arrangement: Arrangement,
  viewId: string,
  rect: Rect,
  id: string = newId('frame'),
): Arrangement => ({
  ...arrangement,
  frames: [...arrangement.frames, {id, viewId, rotation: 0, ...rect}],
});

const changeFrame = (
  arrangement: Arrangement,
  frameId: string,
  change: (frame: StationFrame) => StationFrame,
): Arrangement => ({
  ...arrangement,
  frames: arrangement.frames.map((frame) =>
    frame.id === frameId ? change(frame) : frame,
  ),
});

export const moveFrame = (
  arrangement: Arrangement,
  frameId: string,
  dx: number,
  dy: number,
): Arrangement =>
  changeFrame(arrangement, frameId, (frame) => ({
    ...frame,
    x: frame.x + dx,
    y: frame.y + dy,
  }));

// Moves the frame's bottom-right corner to `corner` (whole grid units), never
// smaller than the minimum.
export const resizeFrame = (
  arrangement: Arrangement,
  frameId: string,
  corner: Point,
): Arrangement =>
  changeFrame(arrangement, frameId, (frame) => ({
    ...frame,
    width: Math.max(MIN_FRAME_SIZE, Math.round(corner.x - frame.x)),
    height: Math.max(MIN_FRAME_SIZE, Math.round(corner.y - frame.y)),
  }));

// The frame's station turned by quarter turns (1 = 90° clockwise).
export const rotateFrame = (
  arrangement: Arrangement,
  frameId: string,
  quarterTurns: number,
): Arrangement =>
  changeFrame(arrangement, frameId, (frame) => ({
    ...frame,
    rotation: (((((frame.rotation / 90 + quarterTurns) % 4) + 4) % 4) *
      90) as FrameRotation,
  }));

// Another station in the frame; lines at the old station's exits let go.
export const setFrameStation = (
  arrangement: Arrangement,
  frameId: string,
  viewId: string,
): Arrangement =>
  withoutDeadLines(
    changeFrame(arrangement, frameId, (frame) => ({...frame, viewId})),
    frameId,
  );

export const deleteFrame = (
  arrangement: Arrangement,
  frameId: string,
): Arrangement =>
  withoutDeadLines({
    ...arrangement,
    frames: arrangement.frames.filter((frame) => frame.id !== frameId),
  });

// Drops line points at frames that are gone (or at `releasedFrame`), and
// lines left with fewer than two points.
const withoutDeadLines = (
  arrangement: Arrangement,
  releasedFrame?: string,
): Arrangement => {
  const frameIds = new Set(arrangement.frames.map((frame) => frame.id));
  const lines = arrangement.lines
    .map((line) => ({
      ...line,
      points: line.points.filter(
        (point) =>
          !('frameId' in point) ||
          (frameIds.has(point.frameId) && point.frameId !== releasedFrame),
      ),
    }))
    .filter((line) => line.points.length >= 2);
  return {...arrangement, lines};
};

// --- lines -----------------------------------------------------------------

export const addLine = (
  arrangement: Arrangement,
  points: LinePoint[],
  id: string = newId('line'),
): Arrangement =>
  points.length < 2
    ? arrangement
    : {...arrangement, lines: [...arrangement.lines, {id, points}]};

export const deleteLine = (
  arrangement: Arrangement,
  lineId: string,
): Arrangement => ({
  ...arrangement,
  lines: arrangement.lines.filter((line) => line.id !== lineId),
});

// A station exit shown on the view, where a line can attach.
export type ExitOnView = {
  frameId: string;
  connectorId: string;
  at: Point;
};

export const exitsOnView = (
  project: Project,
  arrangement: Arrangement,
): ExitOnView[] =>
  arrangement.frames.flatMap((frame) => {
    const view = project.views.find((v) => v.id === frame.viewId);
    if (!view) {
      return [];
    }
    const transform = frameTransform(frame, view);
    return view.elements.flatMap((element) =>
      element.kind === 'connector'
        ? [
            {
              frameId: frame.id,
              connectorId: element.id,
              at: toView(transform, element.at),
            },
          ]
        : [],
    );
  });

// Where a line point lies now; undefined if its exit is gone.
export const resolveLinePoint = (
  project: Project,
  arrangement: Arrangement,
  point: LinePoint,
): Point | undefined => {
  if (!('frameId' in point)) {
    return point;
  }
  const frame = arrangement.frames.find((f) => f.id === point.frameId);
  const view = project.views.find((v) => v.id === frame?.viewId);
  const connector = view?.elements.find((e) => e.id === point.connectorId);
  return frame && view && connector && 'at' in connector
    ? toView(frameTransform(frame, view), connector.at)
    : undefined;
};

export const linePoints = (
  project: Project,
  arrangement: Arrangement,
  line: ViewLine,
): Point[] =>
  line.points.flatMap((point) => {
    const at = resolveLinePoint(project, arrangement, point);
    return at ? [at] : [];
  });

// How close (view units) a click must be to an exit to attach to it.
export const EXIT_SNAP = 1;

// The point to add for a click while drawing a line: a station exit if one
// is near, otherwise the nearest grid point.
export const linePointAt = (exits: ExitOnView[], at: Point): LinePoint => {
  let best: ExitOnView | undefined;
  let bestDistance = EXIT_SNAP;
  for (const exit of exits) {
    const distance = Math.hypot(exit.at.x - at.x, exit.at.y - at.y);
    if (distance <= bestDistance) {
      best = exit;
      bestDistance = distance;
    }
  }
  return best
    ? {frameId: best.frameId, connectorId: best.connectorId}
    : {x: Math.round(at.x), y: Math.round(at.y)};
};

export const sameLinePoint = (a: LinePoint, b: LinePoint): boolean =>
  'frameId' in a
    ? 'frameId' in b &&
      a.frameId === b.frameId &&
      a.connectorId === b.connectorId
    : !('frameId' in b) && a.x === b.x && a.y === b.y;

// Everything drawn on the view, for fitting it to the window.
export const arrangementBounds = (
  project: Project,
  arrangement: Arrangement,
): Bounds | undefined => {
  const points: Point[] = [
    ...arrangement.frames.flatMap((frame) => [
      {x: frame.x, y: frame.y},
      {x: frame.x + frame.width, y: frame.y + frame.height},
    ]),
    ...arrangement.lines.flatMap((line) =>
      linePoints(project, arrangement, line),
    ),
  ];
  if (points.length === 0) {
    return undefined;
  }
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
};
