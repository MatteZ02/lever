// Creating elements where the user clicks (EDT-2): sensible directions from
// the track under the cursor, and a refusal where an element cannot go.
import {DiagramElement, TurnoutType} from './elements';
import {
  Direction,
  directionBetween,
  expandPolyline,
  GridPoint,
  opposite,
  rotateDirection,
  samePoint,
  vector,
} from './geometry';
import {newId, StationView} from './project';
import {DEFAULT_SIGNAL_TYPE_ID} from './signalTypes';

export type PlaceKind =
  | 'turnout'
  | 'signal'
  | 'bufferStop'
  | 'virtualPoint'
  | 'connector'
  | 'accessory'
  | 'label'
  | 'platform';

export type PlaceOptions = {
  turnoutType?: TurnoutType;
  // Extra 45° steps the user added with "rotate" while placing.
  rotation?: number;
  labelText?: string;
};

export type PlaceResult =
  | {ok: true; element: DiagramElement}
  | {ok: false; reason: 'notOnTrack' | 'notAtTrackEnd'};

// Directions in which drawn track leaves a grid point, and whether the point
// is an end of a track.
export const trackAt = (
  view: StationView,
  at: GridPoint,
): {directions: Direction[]; isEnd: boolean} => {
  const directions: Direction[] = [];
  let ends = 0;
  let throughs = 0;
  for (const element of view.elements) {
    if (element.kind !== 'track') {
      continue;
    }
    const points = expandPolyline(element.points);
    const index = points.findIndex((point) => samePoint(point, at));
    if (index < 0) {
      continue;
    }
    if (index > 0) {
      directions.push(directionBetween(at, points[index - 1])!);
    }
    if (index < points.length - 1) {
      directions.push(directionBetween(at, points[index + 1])!);
    }
    if (index === 0 || index === points.length - 1) {
      ends++;
    } else {
      throughs++;
    }
  }
  return {directions, isEnd: ends === 1 && throughs === 0};
};

// Prefer directions pointing right (east), then up, so new elements on a
// horizontal line face east by default.
const preferEastward = (direction: Direction): Direction => {
  const v = vector(direction);
  return v.x < 0 || (v.x === 0 && v.y > 0) ? opposite(direction) : direction;
};

export const placeElement = (
  view: StationView,
  kind: PlaceKind,
  at: GridPoint,
  options: PlaceOptions = {},
): PlaceResult => {
  const rotation = options.rotation ?? 0;
  const track = trackAt(view, at);
  const base = {name: '', at};
  switch (kind) {
    case 'turnout': {
      const along = track.directions[0];
      const orientation = rotateDirection(
        along ? preferEastward(along) : 'E',
        rotation,
      );
      return {
        ok: true,
        element: {
          ...base,
          kind: 'turnout',
          id: newId('turnout'),
          type: options.turnoutType ?? 'right',
          orientation,
          control: {kind: 'manual'},
        },
      };
    }
    case 'signal': {
      if (track.directions.length === 0) {
        return {ok: false, reason: 'notOnTrack'};
      }
      // Rotating cycles through the directions along the track.
      const choices = [
        ...new Set([
          preferEastward(track.directions[0]),
          ...track.directions.map(preferEastward),
          ...track.directions,
        ]),
      ];
      const facing =
        choices[
          ((rotation % choices.length) + choices.length) % choices.length
        ];
      return {
        ok: true,
        element: {
          ...base,
          kind: 'signal',
          id: newId('signal'),
          facing,
          side: 'right',
          signalTypeId: DEFAULT_SIGNAL_TYPE_ID,
          control: {kind: 'manual'},
        },
      };
    }
    case 'bufferStop':
    case 'connector': {
      if (!track.isEnd) {
        return {ok: false, reason: 'notAtTrackEnd'};
      }
      const intoTrack = track.directions[0];
      return {
        ok: true,
        element:
          kind === 'bufferStop'
            ? {...base, kind, id: newId('stop'), direction: intoTrack}
            : {
                ...base,
                kind,
                id: newId('connector'),
                direction: opposite(intoTrack),
              },
      };
    }
    case 'virtualPoint':
      if (track.directions.length === 0) {
        return {ok: false, reason: 'notOnTrack'};
      }
      return {ok: true, element: {...base, kind, id: newId('point')}};
    case 'accessory':
      return {
        ok: true,
        element: {
          ...base,
          kind,
          id: newId('accessory'),
          role: 'uncoupler',
          buttonType: 'momentary',
          control: {kind: 'manual'},
        },
      };
    case 'label':
      return {
        ok: true,
        element: {
          ...base,
          kind,
          id: newId('label'),
          text: options.labelText ?? 'Label',
          size: 'normal',
        },
      };
    case 'platform':
      return {
        ok: true,
        element: {...base, kind, id: newId('platform'), width: 6, height: 1},
      };
  }
};
