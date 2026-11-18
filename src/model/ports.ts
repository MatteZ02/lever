// Geometry of turnouts, crossings and slips: where their legs end (ports) and
// which leg-to-leg passages each position opens. The topology and the
// renderer both use these tables, so drawing and routing always agree.
//
// A turnout sits on a grid point P. Each port is one grid step away from P;
// track segments connect where their end points lie on a port. Example: a
// right-hand turnout at P with orientation E has its tip at P+W, its straight
// leg at P+E and its diverging leg at P+SE.
import {Turnout, TurnoutType} from './elements';
import {Direction, GridPoint, rotateDirection, step} from './geometry';

export type PortSpec = {name: string; direction: Direction};

export type Transition = {
  from: string;
  to: string;
  // Positions in which this passage is open; empty = always (crossings).
  positions: string[];
  // Through the diverging (non-straight) path (RTE-2 cost).
  diverging: boolean;
};

export type TurnoutGeometry = {
  ports: PortSpec[];
  // In the order an operator cycles through them; first = default.
  positions: string[];
  // Each passage once; passages work in both directions.
  transitions: Transition[];
  // Number of DCC addresses needed by default (ACC-1). Double slips may
  // also use 2.
  addressCount: number;
};

const left = (d: Direction) => rotateDirection(d, 1);
const right = (d: Direction) => rotateDirection(d, -1);
const back = (d: Direction) => rotateDirection(d, 4);

const crossingPorts = (d: Direction): PortSpec[] => [
  {name: 'a1', direction: back(d)},
  {name: 'a2', direction: d},
  {name: 'b1', direction: back(left(d))},
  {name: 'b2', direction: left(d)},
];

export const turnoutGeometry = (
  type: TurnoutType,
  d: Direction,
): TurnoutGeometry => {
  switch (type) {
    case 'left':
    case 'right':
      return {
        ports: [
          {name: 'tip', direction: back(d)},
          {name: 'straight', direction: d},
          {name: 'diverging', direction: type === 'left' ? left(d) : right(d)},
        ],
        positions: ['straight', 'diverging'],
        transitions: [
          {
            from: 'tip',
            to: 'straight',
            positions: ['straight'],
            diverging: false,
          },
          {
            from: 'tip',
            to: 'diverging',
            positions: ['diverging'],
            diverging: true,
          },
        ],
        addressCount: 1,
      };
    case 'wye':
      return {
        ports: [
          {name: 'tip', direction: back(d)},
          {name: 'left', direction: left(d)},
          {name: 'right', direction: right(d)},
        ],
        positions: ['left', 'right'],
        // Both legs of a wye turn; count both as diverging.
        transitions: [
          {from: 'tip', to: 'left', positions: ['left'], diverging: true},
          {from: 'tip', to: 'right', positions: ['right'], diverging: true},
        ],
        addressCount: 1,
      };
    case 'threeWay':
      return {
        ports: [
          {name: 'tip', direction: back(d)},
          {name: 'left', direction: left(d)},
          {name: 'straight', direction: d},
          {name: 'right', direction: right(d)},
        ],
        positions: ['straight', 'left', 'right'],
        transitions: [
          {
            from: 'tip',
            to: 'straight',
            positions: ['straight'],
            diverging: false,
          },
          {from: 'tip', to: 'left', positions: ['left'], diverging: true},
          {from: 'tip', to: 'right', positions: ['right'], diverging: true},
        ],
        addressCount: 2,
      };
    case 'crossing':
      return {
        ports: crossingPorts(d),
        positions: [],
        transitions: [
          {from: 'a1', to: 'a2', positions: [], diverging: false},
          {from: 'b1', to: 'b2', positions: [], diverging: false},
        ],
        addressCount: 0,
      };
    case 'singleSlip':
      // The slip connects a1 and b2. Rotate by 180° for the other side.
      return {
        ports: crossingPorts(d),
        positions: ['straight', 'diverging'],
        transitions: [
          {from: 'a1', to: 'a2', positions: ['straight'], diverging: false},
          {from: 'b1', to: 'b2', positions: ['straight'], diverging: false},
          {from: 'a1', to: 'b2', positions: ['diverging'], diverging: true},
        ],
        addressCount: 1,
      };
    case 'doubleSlip':
      // One position switches both ends together: straight = both straight
      // lines, diverging = both slip curves. This is how the club's double
      // slips work (one address, decided by the user), and also what two
      // motors moved together do: mixed positions open no through route.
      return {
        ports: crossingPorts(d),
        positions: ['straight', 'diverging'],
        transitions: [
          {from: 'a1', to: 'a2', positions: ['straight'], diverging: false},
          {from: 'b1', to: 'b2', positions: ['straight'], diverging: false},
          {from: 'a1', to: 'b2', positions: ['diverging'], diverging: true},
          {from: 'b1', to: 'a2', positions: ['diverging'], diverging: true},
        ],
        addressCount: 1,
      };
  }
};

export type PlacedPort = PortSpec & {at: GridPoint};

export const turnoutPorts = (turnout: Turnout): PlacedPort[] =>
  turnoutGeometry(turnout.type, turnout.orientation).ports.map((port) => ({
    ...port,
    at: step(turnout.at, port.direction),
  }));

export const turnoutPositions = (turnout: Pick<Turnout, 'type'>): string[] =>
  turnoutGeometry(turnout.type, 'E').positions;

// For the operator: the next position when a turnout is clicked, in the
// order of its positions. Undefined for crossings (nothing to switch).
export const nextTurnoutPosition = (
  turnout: Pick<Turnout, 'type'>,
  current?: string,
): string | undefined => {
  const positions = turnoutPositions(turnout);
  if (positions.length === 0) {
    return undefined;
  }
  const index = current ? positions.indexOf(current) : -1;
  return positions[(index + 1) % positions.length];
};
