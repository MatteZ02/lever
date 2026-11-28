// Which element a click in operating mode is meant for. Geometric, not the
// SVG hit areas: a click on a turnout's legs, anywhere on the object, counts,
// and so does a click just beside an element when no other clickable element
// is that close (its shape scaled by EXTENDED_SCALE around its centre).
//
// The editor keeps the exact SVG hit areas: there, a near miss must not pick
// the wrong element.
import {DiagramElement} from '../../../model/elements';
import {
  Direction,
  GridPoint,
  rotateDirection,
  vector,
} from '../../../model/geometry';
import {turnoutPorts} from '../../../model/ports';

// The object itself: how far from its lines or centre a click still hits.
const TURNOUT_HALF_WIDTH = 0.4;
const TURNOUT_CENTRE_RADIUS = 0.5;
const SIGNAL_HALF_WIDTH = 0.4;
const POINT_RADIUS = 0.5;
const TRACK_HALF_WIDTH = 0.35;
// Around an element with no other clickable element close by.
export const EXTENDED_SCALE = 1.5;

type Segment = {a: GridPoint; b: GridPoint; halfWidth: number};
type Shape = {centre: GridPoint; segments: Segment[]; extends: boolean};

const unit = (direction: Direction): GridPoint => {
  const v = vector(direction);
  const length = Math.hypot(v.x, v.y);
  return {x: v.x / length, y: v.y / length};
};

const along = (
  point: GridPoint,
  direction: Direction,
  distance: number,
): GridPoint => {
  const u = unit(direction);
  return {x: point.x + u.x * distance, y: point.y + u.y * distance};
};

const disc = (centre: GridPoint, radius: number): Segment => ({
  a: centre,
  b: centre,
  halfWidth: radius,
});

// The clickable shape, as thick line segments (a disc is a segment of length
// zero). Tracks never extend: they are long, and lie next to everything.
const shapeOf = (element: DiagramElement): Shape | null => {
  switch (element.kind) {
    case 'turnout': {
      const centre = element.at;
      return {
        centre,
        extends: true,
        segments: [
          disc(centre, TURNOUT_CENTRE_RADIUS),
          ...turnoutPorts(element).map((port) => ({
            a: centre,
            b: port.at,
            halfWidth: TURNOUT_HALF_WIDTH,
          })),
        ],
      };
    }
    case 'signal': {
      // As drawn: beside the track, on its side of the direction of travel.
      const side = rotateDirection(
        element.facing,
        element.side === 'right' ? -2 : 2,
      );
      const base = along(element.at, side, 0.45);
      return {
        centre: base,
        extends: true,
        segments: [
          {
            a: along(base, element.facing, -0.25),
            b: along(base, element.facing, 0.35),
            halfWidth: SIGNAL_HALF_WIDTH,
          },
        ],
      };
    }
    case 'accessory':
    case 'connector':
    case 'virtualPoint':
      return {
        centre: element.at,
        extends: true,
        segments: [disc(element.at, POINT_RADIUS)],
      };
    case 'track':
      return {
        centre: element.points[0],
        extends: false,
        segments: element.points.slice(1).map((b, index) => ({
          a: element.points[index],
          b,
          halfWidth: TRACK_HALF_WIDTH,
        })),
      };
    default:
      return null;
  }
};

const distanceToSegment = (p: GridPoint, a: GridPoint, b: GridPoint) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared),
        );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

// How deep inside the shape the point is: below 1 inside, 0 on its lines.
const closeness = (shape: Shape, p: GridPoint): number =>
  Math.min(
    ...shape.segments.map((s) => distanceToSegment(p, s.a, s.b) / s.halfWidth),
  );

// The point as seen by the shape scaled by `scale` around its centre.
const scaledPoint = (shape: Shape, p: GridPoint, scale: number): GridPoint => ({
  x: shape.centre.x + (p.x - shape.centre.x) / scale,
  y: shape.centre.y + (p.y - shape.centre.y) / scale,
});

// The element a click at `p` (station grid units) is for, among those
// `clickable` accepts:
// 1. On an element: that one; a point element wins over a track under it,
//    otherwise the closest.
// 2. Beside elements: the one whose enlarged shape holds the point, if no
//    other clickable element's enlarged shape does too.
export const elementAt = (
  elements: readonly DiagramElement[],
  p: GridPoint,
  clickable: (element: DiagramElement) => boolean,
): DiagramElement | undefined => {
  const shapes = elements.flatMap((element) => {
    const shape = clickable(element) ? shapeOf(element) : null;
    return shape && shape.segments.length > 0 ? [{element, shape}] : [];
  });

  let best: {element: DiagramElement; rank: number} | undefined;
  for (const {element, shape} of shapes) {
    const inside = closeness(shape, p);
    if (inside > 1) {
      continue;
    }
    const rank = (element.kind === 'track' ? 10 : 0) + inside;
    if (!best || rank < best.rank) {
      best = {element, rank};
    }
  }
  if (best) {
    return best.element;
  }

  const near = shapes.filter(
    ({shape}) =>
      shape.extends &&
      closeness(shape, scaledPoint(shape, p, EXTENDED_SCALE)) <= 1,
  );
  return near.length === 1 ? near[0].element : undefined;
};
