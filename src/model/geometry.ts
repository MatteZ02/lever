// Grid geometry for track diagrams (LOOK-1). Everything sits on integer grid
// points; track runs horizontally, vertically or at 45°. Screen convention:
// x grows to the right, y grows downwards, so "N" is negative y.
import {z} from 'zod';

export const gridPointSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});
export type GridPoint = z.infer<typeof gridPointSchema>;

// The eight directions, counter-clockwise from east. Rotating by one step is
// a 45° turn to the left.
export const DIRECTIONS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'] as const;
export const directionSchema = z.enum(DIRECTIONS);
export type Direction = z.infer<typeof directionSchema>;

const VECTORS: Record<Direction, GridPoint> = {
  E: {x: 1, y: 0},
  NE: {x: 1, y: -1},
  N: {x: 0, y: -1},
  NW: {x: -1, y: -1},
  W: {x: -1, y: 0},
  SW: {x: -1, y: 1},
  S: {x: 0, y: 1},
  SE: {x: 1, y: 1},
};

export const vector = (direction: Direction): GridPoint => VECTORS[direction];

// Rotates by `steps` × 45°, positive = counter-clockwise (to the left).
export const rotateDirection = (
  direction: Direction,
  steps: number,
): Direction =>
  DIRECTIONS[(((DIRECTIONS.indexOf(direction) + steps) % 8) + 8) % 8];

export const opposite = (direction: Direction): Direction =>
  rotateDirection(direction, 4);

export const add = (
  point: GridPoint,
  offset: GridPoint,
  times = 1,
): GridPoint => ({
  x: point.x + offset.x * times,
  y: point.y + offset.y * times,
});

export const step = (point: GridPoint, direction: Direction, times = 1) =>
  add(point, vector(direction), times);

export const samePoint = (a: GridPoint, b: GridPoint): boolean =>
  a.x === b.x && a.y === b.y;

export const pointKey = (point: GridPoint): string => `${point.x},${point.y}`;

// The direction from a to b if they lie on one 8-direction line, else
// undefined (also for a === b).
export const directionBetween = (
  a: GridPoint,
  b: GridPoint,
): Direction | undefined => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return undefined;
  }
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) {
    return undefined;
  }
  const unit = {x: Math.sign(dx), y: Math.sign(dy)};
  return DIRECTIONS.find(
    (direction) =>
      VECTORS[direction].x === unit.x && VECTORS[direction].y === unit.y,
  );
};

// Number of grid steps between two points on one line (diagonal steps count
// as one).
export const stepCount = (a: GridPoint, b: GridPoint): number =>
  Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));

// Length for routing costs: diagonal steps are √2 long.
export const geometricLength = (a: GridPoint, b: GridPoint): number =>
  Math.hypot(b.x - a.x, b.y - a.y);

// The nearest point to `target` that lies on one of the 8 directions from
// `from` (for drawing track with the mouse). Returns `from` itself only if
// target === from.
export const snapToDirection = (
  from: GridPoint,
  target: GridPoint,
): GridPoint => {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  if (dx === 0 && dy === 0) {
    return from;
  }
  const angle = Math.atan2(-dy, dx); // screen y is down
  const index = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
  const direction = DIRECTIONS[index];
  const v = VECTORS[direction];
  // Project the target onto the chosen direction.
  const length =
    v.x !== 0 && v.y !== 0
      ? Math.round((Math.abs(dx) + Math.abs(dy)) / 2)
      : Math.abs(v.x !== 0 ? dx : dy);
  return add(from, v, Math.max(1, length));
};

// Every grid point of a polyline, including the corners (each step is one
// grid point apart).
export const expandPolyline = (points: GridPoint[]): GridPoint[] => {
  if (points.length === 0) {
    return [];
  }
  const result: GridPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const direction = directionBetween(points[i - 1], points[i]);
    if (!direction) {
      continue;
    }
    const count = stepCount(points[i - 1], points[i]);
    for (let n = 1; n <= count; n++) {
      result.push(step(points[i - 1], direction, n));
    }
  }
  return result;
};

// Removes repeated points and merges collinear runs, so a polyline keeps only
// its end points and corners.
export const simplifyPolyline = (points: GridPoint[]): GridPoint[] => {
  const unique = points.filter(
    (point, index) => index === 0 || !samePoint(point, points[index - 1]),
  );
  if (unique.length <= 2) {
    return unique;
  }
  const result: GridPoint[] = [unique[0]];
  for (let i = 1; i < unique.length - 1; i++) {
    const before = directionBetween(result[result.length - 1], unique[i]);
    const after = directionBetween(unique[i], unique[i + 1]);
    if (before !== after) {
      result.push(unique[i]);
    }
  }
  result.push(unique[unique.length - 1]);
  return result;
};

// True if every step of the polyline is horizontal, vertical or 45°.
export const isValidPolyline = (points: GridPoint[]): boolean =>
  points.length >= 2 &&
  points.every(
    (point, index) =>
      index === 0 || directionBetween(points[index - 1], point) !== undefined,
  );

// Rotates a point 90° clockwise (on screen) around a pivot, times 1..3.
export const rotatePoint90 = (
  point: GridPoint,
  pivot: GridPoint,
  times = 1,
): GridPoint => {
  let x = point.x - pivot.x;
  let y = point.y - pivot.y;
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) {
    [x, y] = [-y, x];
  }
  return {x: pivot.x + x, y: pivot.y + y};
};

export type Bounds = {minX: number; minY: number; maxX: number; maxY: number};

export const boundsOf = (points: GridPoint[]): Bounds | undefined =>
  points.length === 0
    ? undefined
    : points.reduce(
        (bounds, point) => ({
          minX: Math.min(bounds.minX, point.x),
          minY: Math.min(bounds.minY, point.y),
          maxX: Math.max(bounds.maxX, point.x),
          maxY: Math.max(bounds.maxY, point.y),
        }),
        {
          minX: points[0].x,
          minY: points[0].y,
          maxX: points[0].x,
          maxY: points[0].y,
        },
      );
