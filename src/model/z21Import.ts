// Converts a Roco Z21 app control station ("schematic" layout in a .z21
// export) into a Lever project. PURE: the main process reads the file and
// passes the rows in.
//
// The Z21 format is not documented. What is used here was worked out from
// a real export (docs/hardware-notes.md, "Z21 app export"):
// - A page is a grid of tiles. `angle` is clockwise from north (0 = N,
//   90 = E) in steps of 45°.
// - Control types: 0 straight, 28 curve (joins angle+135° to angle),
//   1 right turnout, 2 left turnout (angle = from the tip towards the frog),
//   23 double slip (one address; first line along angle, second 45° to its
//   left), 24 sharp 90° curve (joins angle to angle+90°), 11 two-aspect
//   signal (facing angle), 14 track end (angle points out of the track).
// - Each controlled tile has states 0 and 1. State 0 is straight (turnouts,
//   slips) and proceed (signals: checked on a real layout);
//   `address1_value` is the output (0 = output 1, 1 = output 2).
// - Route buttons list turnout states. Lever calculates routes itself
//   (Level 2), so they are not imported; their caption notes are skipped.
//
// One Z21 tile becomes 2 × 2 Lever grid steps: tracks one tile apart become
// two rows apart (the drawing rule), and turnout legs, one grid step long,
// end on the tile edges where the neighbouring tiles' tracks begin.
import {
  DiagramElement,
  Signal,
  StationConnector,
  Track,
  Turnout,
  TurnoutType,
} from './elements';
import {
  add,
  Direction,
  directionBetween,
  GridPoint,
  opposite,
  pointKey,
  simplifyPolyline,
  step,
} from './geometry';
import {turnoutPorts} from './ports';
import {
  AutomationArea,
  newId,
  PROJECT_FORMAT,
  PROJECT_SCHEMA_VERSION,
  Project,
  projectSchema,
  StationView,
} from './project';
import {DEFAULT_SIGNAL_TYPE_ID} from './signalTypes';

export type Z21Page = {id: number; position: number; name: string};
export type Z21Control = {
  id: number;
  pageId: number;
  x: number;
  y: number;
  angle: number;
  type: number;
  address1: number;
  address2: number;
  address3: number;
};
export type Z21ControlState = {
  controlId: number;
  state: number;
  address1Value: number;
};
export type Z21Note = {
  pageId: number;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  // 1 = text, 2 = small rotated text (track numbers).
  type: number;
};
export type Z21RouteButton = {id: number; pageId: number; x: number; y: number};

export type Z21Export = {
  layoutName: string;
  pages: Z21Page[];
  controls: Z21Control[];
  states: Z21ControlState[];
  notes: Z21Note[];
  routes: Z21RouteButton[];
};

export type Z21ImportIssue =
  // Page whose turnouts all appear on another page (e.g. a close-up).
  | {code: 'duplicatePage'; page: string; of: string}
  | {code: 'unknownControl'; type: number; count: number}
  | {code: 'oddAngle'; page: string; count: number}
  | {code: 'invalidAddress'; page: string; address: number}
  | {code: 'routesNotImported'; count: number}
  | {code: 'signalsAssumed'; count: number};

export type Z21ImportResult = {project: Project; issues: Z21ImportIssue[]};

const ANGLE_DIRECTIONS: Record<number, Direction> = {
  0: 'N',
  45: 'NE',
  90: 'E',
  135: 'SE',
  180: 'S',
  225: 'SW',
  270: 'W',
  315: 'NW',
};

const directionOf = (angle: number): Direction | undefined =>
  ANGLE_DIRECTIONS[(((Math.round(angle) % 360) + 360) % 360) as number];

const T = {
  straight: 0,
  right: 1,
  left: 2,
  signal: 11,
  end: 14,
  doubleSlip: 23,
  corner: 24,
  curve: 28,
} as const;

const TURNOUT_TYPES: Record<number, TurnoutType> = {
  [T.right]: 'right',
  [T.left]: 'left',
  [T.doubleSlip]: 'doubleSlip',
};

const KNOWN_TYPES = new Set<number>(Object.values(T));
const MAX_ADDRESS = 2048;
// Grid margin around an imported page.
const MARGIN = 2;

// Rotates a Z21 angle by `degrees` clockwise.
const turn = (angle: number, degrees: number) => angle + degrees;

export const importZ21 = (data: Z21Export): Z21ImportResult => {
  const issues: Z21ImportIssue[] = [];
  const statesByControl = new Map<number, Z21ControlState[]>();
  for (const state of data.states) {
    statesByControl.set(state.controlId, [
      ...(statesByControl.get(state.controlId) ?? []),
      state,
    ]);
  }

  const unknown = new Map<number, number>();
  for (const control of data.controls) {
    if (!KNOWN_TYPES.has(control.type)) {
      unknown.set(control.type, (unknown.get(control.type) ?? 0) + 1);
    }
  }
  unknown.forEach((count, type) =>
    issues.push({code: 'unknownControl', type, count}),
  );

  const pages = [...data.pages].sort((a, b) => a.position - b.position);
  const addressesOf = (page: Z21Page) =>
    new Set(
      data.controls
        .filter((c) => c.pageId === page.id && c.address1 > 0)
        .map((c) => c.address1),
    );
  const views: StationView[] = [];
  const areas: AutomationArea[] = [];
  let signals = 0;

  for (const page of pages) {
    const own = addressesOf(page);
    const copyOf = pages.find(
      (other) =>
        other !== page &&
        own.size > 0 &&
        addressesOf(other).size > own.size &&
        [...own].every((address) => addressesOf(other).has(address)),
    );
    if (copyOf) {
      issues.push({code: 'duplicatePage', page: page.name, of: copyOf.name});
      continue;
    }
    const result = importPage(
      page,
      data.controls.filter((c) => c.pageId === page.id),
      data.notes.filter((n) => n.pageId === page.id),
      data.routes.filter((r) => r.pageId === page.id),
      statesByControl,
      issues,
    );
    signals += result.signals;
    const area = {id: newId('area'), name: page.name, level: 1 as const};
    areas.push(area);
    views.push({
      id: newId('view'),
      name: page.name,
      areaId: area.id,
      elements: result.elements,
    });
  }

  if (data.routes.length > 0) {
    issues.push({code: 'routesNotImported', count: data.routes.length});
  }
  if (signals > 0) {
    issues.push({code: 'signalsAssumed', count: signals});
  }

  const project = projectSchema.parse({
    format: PROJECT_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: newId('project'),
    name: data.layoutName || 'Imported layout',
    views,
    areas,
  });
  return {project, issues};
};

// --- one page ---------------------------------------------------------------

const importPage = (
  page: Z21Page,
  controls: Z21Control[],
  notes: Z21Note[],
  routes: Z21RouteButton[],
  statesByControl: Map<number, Z21ControlState[]>,
  issues: Z21ImportIssue[],
): {elements: DiagramElement[]; signals: number} => {
  const shownNotes = notes.filter(
    (note) => note.type !== 1 || !isRouteCaption(note, notes, routes),
  );
  const cells = [...controls, ...shownNotes];
  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  const crossovers = findDoubleCrossovers(controls);
  // Two columns are inserted after each double crossover's first column.
  const column = (x: number) =>
    x + 2 * crossovers.filter((xo) => xo.column < x).length;
  const moved = new Map<number, number>();
  for (const xo of crossovers) {
    moved.set(xo.bottomLeft.id, column(xo.column) + 2);
    moved.set(xo.bottomRight.id, column(xo.column) + 1);
  }
  // Centre of a tile in Lever grid points.
  const centre = (x: number, y: number, id?: number): GridPoint => ({
    x:
      ((id !== undefined ? moved.get(id) : undefined) ?? column(x)) * 2 -
      minX * 2 +
      MARGIN,
    y: (y - minY) * 2 + MARGIN,
  });

  const elements: DiagramElement[] = [];
  const edges: [GridPoint, GridPoint][] = [];
  const ends: {at: GridPoint; out: Direction; tile: Z21Control}[] = [];
  let oddAngles = 0;
  let signals = 0;

  const line = (c: GridPoint, from: Direction, to: Direction) => {
    edges.push([step(c, from), c], [c, step(c, to)]);
  };
  // State 0 (straight, or stop) on output 2 means "swap outputs" in Lever,
  // whose default is output 1 for straight and stop.
  const invertOf = (control: Z21Control) => {
    const state0 = statesByControl
      .get(control.id)
      ?.find((state) => state.state === 0);
    return state0?.address1Value === 1;
  };
  // State 0 is straight for turnouts but proceed for signals, whose first
  // Lever aspect is stop: a signal's outputs are the other way round.
  const dccControl = (control: Z21Control, isSignal = false) => {
    const address = control.address1;
    if (address > MAX_ADDRESS) {
      issues.push({code: 'invalidAddress', page: page.name, address});
    }
    return {
      kind: 'dcc' as const,
      addresses: address >= 1 && address <= MAX_ADDRESS ? [address] : [],
      invert: invertOf(control) !== isSignal,
    };
  };

  for (const control of controls) {
    if (!KNOWN_TYPES.has(control.type) || isDecoration(control, controls)) {
      continue;
    }
    const d = directionOf(control.angle);
    if (!d) {
      oddAngles++;
      continue;
    }
    const c = centre(control.x, control.y, control.id);
    switch (control.type) {
      case T.straight:
        line(c, opposite(d), d);
        break;
      case T.curve: {
        const from = directionOf(turn(control.angle, 135));
        if (from) {
          line(c, from, d);
        }
        break;
      }
      case T.corner: {
        const to = directionOf(turn(control.angle, 90));
        if (to) {
          line(c, d, to);
        }
        break;
      }
      case T.signal: {
        line(c, opposite(d), d);
        signals++;
        const signal: Signal = {
          id: newId('signal'),
          kind: 'signal',
          name: '',
          at: c,
          facing: d,
          side: 'right',
          signalTypeId: DEFAULT_SIGNAL_TYPE_ID,
          control: dccControl(control, true),
        };
        elements.push(signal);
        break;
      }
      case T.end:
        edges.push([c, step(c, opposite(d))]);
        ends.push({at: c, out: d, tile: control});
        break;
      default: {
        const type = TURNOUT_TYPES[control.type];
        const turnout: Turnout = {
          id: newId('turnout'),
          kind: 'turnout',
          name: '',
          type,
          at: c,
          orientation: d,
          control: dccControl(control),
        };
        elements.push(turnout);
      }
    }
  }
  if (oddAngles > 0) {
    issues.push({code: 'oddAngle', page: page.name, count: oddAngles});
  }

  // Track ends: a station exit where a caption sits just beyond the end
  // (one or two tiles; it becomes the exit's name), otherwise a buffer stop.
  const usedNotes = new Set<Z21Note>();
  for (const end of ends) {
    const tile = {x: end.tile.x, y: end.tile.y};
    const caption = [step(tile, end.out), step(tile, end.out, 2)]
      .map((beyond) =>
        shownNotes.find(
          (note) =>
            note.type === 1 &&
            !usedNotes.has(note) &&
            note.x === beyond.x &&
            note.y === beyond.y,
        ),
      )
      .find((note) => note !== undefined);
    if (caption) {
      usedNotes.add(caption);
      const connector: StationConnector = {
        id: newId('connector'),
        kind: 'connector',
        name: caption.text.trim().slice(0, 100),
        at: end.at,
        direction: end.out,
      };
      elements.push(connector);
    } else {
      elements.push({
        id: newId('stop'),
        kind: 'bufferStop',
        name: '',
        at: end.at,
        direction: opposite(end.out),
      });
    }
  }

  for (const note of shownNotes) {
    if (usedNotes.has(note) || !note.text.trim()) {
      continue;
    }
    const c = centre(note.x, note.y);
    elements.push({
      id: newId('label'),
      kind: 'label',
      name: '',
      // Captions start at the tile's left edge; track numbers sit just
      // above their track.
      at: note.type === 2 ? add(c, {x: 0, y: -1}) : add(c, {x: -1, y: 0}),
      text: note.text.trim().slice(0, 200),
      size: note.type === 2 || note.fontSize < 20 ? 'small' : 'normal',
    });
  }

  const turnouts = elements.filter(
    (element): element is Turnout => element.kind === 'turnout',
  );
  // Where tracks and turnout legs end, and from which side.
  const touching = (point: GridPoint, side: (x: number) => boolean) =>
    edges.some(
      ([a, b]) =>
        (a.x === point.x && a.y === point.y && side(b.x)) ||
        (b.x === point.x && b.y === point.y && side(a.x)),
    ) ||
    turnouts.some(
      (t) =>
        side(t.at.x) &&
        turnoutPorts(t).some((p) => p.at.x === point.x && p.at.y === point.y),
    );
  const bridge = (from: GridPoint, to: GridPoint) => {
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    for (let p = from; p.x !== to.x || p.y !== to.y;) {
      const next = {x: p.x + dx, y: p.y + dy};
      edges.push([p, next]);
      p = next;
    }
  };

  // Double crossovers: two crossovers in a row (see findDoubleCrossovers),
  // and every other line across the inserted columns lengthened.
  const ys = [...edges.flat(), ...turnouts.map((t) => t.at)].map((p) => p.y);
  for (const xo of crossovers) {
    const left = centre(xo.column, xo.row).x + 1;
    const right = left + 4;
    const top = centre(xo.column, xo.row).y;
    bridge({x: left, y: top}, {x: right, y: top});
    bridge({x: left - 2, y: top + 2}, {x: left, y: top + 2});
    bridge({x: right, y: top + 2}, {x: right + 2, y: top + 2});
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
      if (y >= top && y <= top + 2) {
        continue;
      }
      if (
        touching({x: left, y}, (x) => x < left) &&
        touching({x: right, y}, (x) => x > right)
      ) {
        bridge({x: left, y}, {x: right, y});
      }
    }
  }

  // A note placed on a track (track numbers) replaces its tile: carry the
  // track through when it continues on both sides.
  const occupied = new Set(controls.map((c) => `${c.x},${c.y}`));
  for (const note of shownNotes) {
    if (occupied.has(`${note.x},${note.y}`)) {
      continue;
    }
    const c = centre(note.x, note.y);
    for (const d of ['E', 'N', 'NE', 'NW'] as Direction[]) {
      const a = step(c, d);
      const b = step(c, opposite(d));
      if (touching(a, () => true) && touching(b, () => true)) {
        line(c, opposite(d), d);
        break;
      }
    }
  }

  // A line that just stops (no end tile) continues beyond the drawing, like
  // the passing tracks into the hidden spiral: a station exit.
  const degree = new Map<string, {count: number; from: GridPoint}>();
  for (const [a, b] of edges) {
    for (const [p, q] of [
      [a, b],
      [b, a],
    ]) {
      const entry = degree.get(pointKey(p));
      degree.set(pointKey(p), {count: (entry?.count ?? 0) + 1, from: q});
    }
  }
  const anchored = new Set([
    ...turnouts.flatMap((t) =>
      turnoutPorts(t).map((port) => pointKey(port.at)),
    ),
    ...ends.map((end) => pointKey(end.at)),
  ]);
  for (const [key, {count, from}] of degree) {
    if (count !== 1 || anchored.has(key)) {
      continue;
    }
    const [x, y] = key.split(',').map(Number);
    const at = {x, y};
    const direction = directionBetween(from, at);
    if (direction) {
      elements.push({
        id: newId('connector'),
        kind: 'connector',
        name: '',
        at,
        direction,
      });
    }
  }

  elements.unshift(
    ...tracksFrom(
      edges,
      turnouts,
      ends.map((end) => end.at),
    ),
  );
  return {elements, signals};
};

// A double crossover drawn as an X in four tiles: the diverging legs of all
// four turnouts meet in the tile corner, where Lever would need a crossing
// with legs of its own. Only the usual shape is recognised: main lines
// left to right, top-left and bottom-right turnouts diverging towards each
// other (backslash), bottom-left and top-right ("/"). It is redrawn as two
// crossovers in a row with the same connections: top-left with bottom-right
// first, then bottom-left with top-right; two columns are inserted for it.
type DoubleCrossover = {
  column: number;
  row: number;
  bottomLeft: Z21Control;
  bottomRight: Z21Control;
};

const findDoubleCrossovers = (controls: Z21Control[]): DoubleCrossover[] => {
  const at = (x: number, y: number) =>
    controls.find((c) => c.x === x && c.y === y);
  const is = (c: Z21Control | undefined, type: number, angle: number) =>
    c !== undefined &&
    c.type === type &&
    directionOf(c.angle) === directionOf(angle);
  const found: DoubleCrossover[] = [];
  for (const topLeft of controls) {
    const {x, y} = topLeft;
    const bottomLeft = at(x, y + 1);
    const bottomRight = at(x + 1, y + 1);
    if (
      is(topLeft, T.right, 90) &&
      is(at(x + 1, y), T.left, 270) &&
      is(bottomLeft, T.left, 90) &&
      is(bottomRight, T.right, 270)
    ) {
      found.push({
        column: x,
        row: y,
        bottomLeft: bottomLeft!,
        bottomRight: bottomRight!,
      });
    }
  }
  return found;
};

// A straight piece with nothing on either side, e.g. a separator line drawn
// between route captions.
const isDecoration = (control: Z21Control, controls: Z21Control[]) => {
  if (control.type !== T.straight) {
    return false;
  }
  const d = directionOf(control.angle);
  if (!d) {
    return false;
  }
  return [d, opposite(d)].every((side) => {
    const next = step({x: control.x, y: control.y}, side);
    return !controls.some((c) => c.x === next.x && c.y === next.y);
  });
};

// Captions of the route button table: on a button's row to its left, above
// a button's column, or next to such a caption on the same row.
const isRouteCaption = (
  note: Z21Note,
  notes: Z21Note[],
  routes: Z21RouteButton[],
): boolean => {
  const direct = (n: Z21Note) =>
    routes.some(
      (r) =>
        (r.y === n.y && r.x > n.x && r.x - n.x <= 12) ||
        (r.x === n.x && r.y > n.y && r.y - n.y <= 3),
    );
  if (direct(note)) {
    return true;
  }
  return notes.some(
    (other) =>
      other !== note &&
      other.type === 1 &&
      other.y === note.y &&
      Math.abs(other.x - note.x) <= 3 &&
      direct(other),
  );
};

// Joins the unit track pieces of the tiles into polylines that end at
// turnout legs, track ends and junctions (as drawn tracks do in Lever).
const tracksFrom = (
  edges: [GridPoint, GridPoint][],
  turnouts: Turnout[],
  endPoints: GridPoint[],
): Track[] => {
  const neighbours = new Map<string, GridPoint[]>();
  const link = (a: GridPoint, b: GridPoint) => {
    const list = neighbours.get(pointKey(a)) ?? [];
    if (!list.some((p) => p.x === b.x && p.y === b.y)) {
      list.push(b);
    }
    neighbours.set(pointKey(a), list);
  };
  for (const [a, b] of edges) {
    link(a, b);
    link(b, a);
  }
  const anchors = new Set<string>([
    ...turnouts.flatMap((t) => turnoutPorts(t).map((p) => pointKey(p.at))),
    ...endPoints.map(pointKey),
  ]);
  const isStop = (p: GridPoint) =>
    anchors.has(pointKey(p)) ||
    (neighbours.get(pointKey(p))?.length ?? 0) !== 2;

  const used = new Set<string>();
  const edgeKey = (a: GridPoint, b: GridPoint) =>
    [pointKey(a), pointKey(b)].sort().join('|');
  const tracks: Track[] = [];
  const walk = (start: GridPoint, next: GridPoint) => {
    const points = [start];
    let previous = start;
    let current = next;
    used.add(edgeKey(start, next));
    for (;;) {
      points.push(current);
      if (isStop(current)) {
        break;
      }
      const onward = (neighbours.get(pointKey(current)) ?? []).find(
        (p) =>
          !(p.x === previous.x && p.y === previous.y) &&
          !used.has(edgeKey(current, p)),
      );
      if (!onward) {
        break;
      }
      used.add(edgeKey(current, onward));
      previous = current;
      current = onward;
    }
    tracks.push({
      id: newId('track'),
      kind: 'track',
      name: '',
      points: simplifyPolyline(points),
    });
  };
  // Start from stops first, then whatever is left (closed loops).
  const starts = [...neighbours.keys()]
    .map((key) => {
      const [x, y] = key.split(',').map(Number);
      return {x, y};
    })
    .sort((a, b) => Number(isStop(b)) - Number(isStop(a)));
  for (const start of starts) {
    for (const next of neighbours.get(pointKey(start)) ?? []) {
      if (!used.has(edgeKey(start, next))) {
        walk(start, next);
      }
    }
  }
  return tracks;
};
