// Generates samples/club-layout.lever: a DRAFT of the club's stations olten,
// inselburg-dettingen and Sissach, from the Z21 control-station screenshots
// (docs/architecture.md, section 6). Addresses are left empty on purpose: the
// editor's problem list then shows every turnout still to configure.
//
//   node scripts/make-sample-project.mjs
//
// Tracks are two grid rows apart, so a crossover between neighbouring tracks
// fits with 45° legs. src/model/__tests__/sampleProject.test.ts checks that
// the result is valid and has no open ends or unconnected junctions.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

let counter = 0;
const id = (prefix) => `${prefix}-${(++counter).toString(36).padStart(3, '0')}`;
const p = (x, y) => ({x, y});

const station = (name) => {
  const elements = [];
  const add = (element) => {
    elements.push({name: '', ...element});
    return element;
  };
  return {
    name,
    elements,
    track: (...points) =>
      add({
        kind: 'track',
        id: id('track'),
        points: points.map(([x, y]) => p(x, y)),
      }),
    turnout: (type, [x, y], orientation, name = '') =>
      add({
        kind: 'turnout',
        id: id('turnout'),
        name,
        type,
        at: p(x, y),
        orientation,
        control: {kind: 'dcc', addresses: [], invert: false},
      }),
    stop: ([x, y], direction) =>
      add({kind: 'bufferStop', id: id('stop'), at: p(x, y), direction}),
    exit: ([x, y], direction, name) =>
      add({kind: 'connector', id: id('exit'), name, at: p(x, y), direction}),
    signal: ([x, y], facing, name) =>
      add({
        kind: 'signal',
        id: id('signal'),
        name,
        at: p(x, y),
        facing,
        side: 'right',
        signalTypeId: 'builtin:main2',
        control: {kind: 'dcc', addresses: [], invert: false},
      }),
    label: ([x, y], text, size = 'small') =>
      add({kind: 'label', id: id('label'), at: p(x, y), text, size}),
  };
};

// --- olten -------------------------------------------------------------------
// Platform tracks 1-4 and 7-12 (5 and 6 do not exist, as in the real Olten),
// main-line passing tracks at the bottom (joined to the station exits by a
// spiral that is not drawn).
const olten = (() => {
  const s = station('olten');
  s.label([0, -3], 'Olten (draft from the Z21 screenshot)', 'normal');
  // West: line on track 4 with the Nebenbahn spur, ladder to tracks 1/2.
  s.exit([0, 8], 'W', 'Line west');
  s.track([0, 8], [2, 8]);
  s.turnout('right', [3, 8], 'W');
  s.track([2, 7], [0, 5]);
  s.stop([0, 5], 'SE');
  s.label([0, 4], 'Nebenbahn');
  s.turnout('left', [5, 8], 'E');
  s.track([6, 7], [10, 3]);
  s.turnout('right', [11, 2], 'NE');
  s.track([12, 1], [13, 0], [40, 0], [42, -2]);
  s.exit([42, -2], 'NE', 'Nebenbahn (north)');
  s.track([12, 2], [48, 2]);
  s.exit([48, 2], 'E', 'Nebenbahn');
  // Track 4 and the double slip where the long diagonal from Päärata Pun
  // crosses it.
  s.track([6, 8], [13, 8]);
  s.turnout('doubleSlip', [14, 8], 'E');
  s.track([15, 8], [34, 8], [41, 15]);
  s.track([15, 7], [16, 6], [40, 6]);
  s.stop([40, 6], 'W');
  // Päärata Pun from the west and the diagonal up to tracks 7/8 and 3.
  s.exit([0, 18], 'W', 'Päärata Pun');
  s.track([0, 18], [3, 18]);
  s.turnout('left', [4, 18], 'E');
  s.track([5, 17], [7, 15]);
  s.turnout('right', [8, 14], 'NE');
  s.track([9, 13], [13, 9]);
  s.track([9, 14], [10, 14]);
  s.turnout('right', [11, 14], 'E');
  s.track([12, 14], [36, 14], [37, 15]);
  s.track([12, 15], [13, 16], [37, 16]);
  s.turnout('right', [38, 16], 'W');
  s.track([39, 16], [41, 16]);
  s.turnout('right', [42, 16], 'W');
  s.track([43, 16], [48, 16]);
  s.exit([48, 16], 'E', 'Päärata Pun');
  // Tracks 9 and 10 (Päärata Kel), with crossovers at both ends.
  s.track([5, 18], [7, 18]);
  s.turnout('left', [8, 18], 'W');
  s.track([9, 18], [41, 18]);
  s.turnout('left', [42, 18], 'W');
  s.track([43, 18], [48, 18]);
  s.exit([48, 18], 'E', 'Päärata Kel');
  s.exit([0, 20], 'W', 'Päärata Kel');
  s.track([0, 20], [5, 20]);
  s.turnout('left', [6, 20], 'E');
  s.track([7, 20], [9, 20]);
  s.turnout('right', [10, 20], 'E');
  s.track([11, 20], [39, 20]);
  s.turnout('left', [40, 20], 'E');
  s.track([41, 20], [42, 20]);
  s.stop([42, 20], 'W');
  // Tracks 11 and 12 (Nebenbahn), with a double slip on track 11.
  s.track([11, 21], [13, 23]);
  s.exit([0, 24], 'W', 'Nebenbahn');
  s.track([0, 24], [13, 24]);
  s.turnout('doubleSlip', [14, 24], 'NW');
  s.track([15, 24], [43, 24]);
  s.turnout('left', [44, 24], 'W');
  s.track([45, 24], [48, 24]);
  s.exit([48, 24], 'E', 'Nebenbahn');
  s.track([15, 25], [16, 26], [41, 26]);
  s.turnout('left', [42, 26], 'E');
  s.track([43, 26], [44, 26]);
  s.stop([44, 26], 'W');
  // Main-line passing tracks with two crossovers.
  s.exit([0, 32], 'W', 'Main line (spiral)');
  s.track([0, 32], [21, 32]);
  s.turnout('left', [22, 32], 'W');
  s.track([23, 32], [25, 32]);
  s.turnout('right', [26, 32], 'E');
  s.track([27, 32], [48, 32]);
  s.exit([48, 32], 'E', 'Main line (spiral)');
  s.exit([0, 34], 'W', 'Main line (spiral)');
  s.track([0, 34], [19, 34]);
  s.turnout('left', [20, 34], 'E');
  s.track([21, 34], [27, 34]);
  s.turnout('right', [28, 34], 'W');
  s.track([29, 34], [48, 34]);
  s.exit([48, 34], 'E', 'Main line (spiral)');
  // The two signals visible on the screenshot, east of tracks 3 and 4.
  s.signal([34, 6], 'W', 'Signal 3');
  s.signal([33, 8], 'W', 'Signal 4');
  for (const [number, y] of [
    [1, 0],
    [2, 2],
    [3, 6],
    [4, 8],
    [7, 14],
    [8, 16],
    [9, 18],
    [10, 20],
    [11, 24],
    [12, 26],
  ]) {
    s.label([24, y], String(number));
  }
  return s;
})();

// --- inselburg-dettingen -----------------------------------------------------------
// Two return loops on the west side lead the main lines to the bottom exits;
// they cross each other (drawn as an overpass until confirmed).
const inselburg = (() => {
  const s = station('inselburg-dettingen');
  s.label(
    [0, -6],
    'Inselburg-Dettingen (draft from the Z21 screenshot)',
    'normal',
  );
  // Outer loop: bottom exit → around → track 3 → east exit Päärata Kel.
  s.exit([16, 18], 'E', 'Päärata Pun (south)');
  s.track(
    [16, 18],
    [10, 18],
    [8, 20],
    [3, 20],
    [2, 19],
    [2, 9],
    [3, 8],
    [11, 8],
  );
  s.turnout('left', [12, 8], 'E');
  s.track([13, 8], [40, 8]);
  s.exit([40, 8], 'E', 'Päärata Kel');
  // Branch up to track 4 and the yard.
  s.track([13, 7], [16, 4], [20, 4]);
  s.turnout('left', [21, 4], 'E');
  s.track([22, 4], [34, 4]);
  s.stop([34, 4], 'W');
  s.turnout('right', [23, 2], 'NE');
  s.track([24, 2], [34, 2]);
  s.stop([34, 2], 'W');
  s.turnout('right', [25, 0], 'NE');
  s.track([26, 0], [34, 0]);
  s.stop([34, 0], 'W');
  s.turnout('right', [27, -2], 'NE');
  s.track([28, -2], [34, -2]);
  s.stop([34, -2], 'W');
  s.track([28, -3], [29, -4], [34, -4]);
  s.stop([34, -4], 'W');
  // Inner loop: bottom exit → around → track 2 → east exit Päärata Pun.
  s.exit([16, 20], 'E', 'Päärata Kel (south)');
  s.track(
    [16, 20],
    [10, 20],
    [8, 18],
    [5, 18],
    [4, 17],
    [4, 11],
    [5, 10],
    [9, 10],
  );
  s.turnout('right', [10, 10], 'E');
  s.track([11, 10], [29, 10]);
  s.turnout('left', [30, 10], 'W');
  s.track([31, 10], [40, 10]);
  s.exit([40, 10], 'E', 'Päärata Pun');
  // Track 1, joined to track 2 at both ends.
  s.exit([6, 12], 'W', 'Päärata Pun (west)');
  s.track([6, 12], [11, 12]);
  s.turnout('right', [12, 12], 'W');
  s.track([13, 12], [27, 12]);
  s.turnout('left', [28, 12], 'E');
  s.track([29, 12], [32, 12]);
  s.stop([32, 12], 'W');
  for (const [number, y] of [
    [1, 12],
    [2, 10],
    [3, 8],
    [4, 4],
  ]) {
    s.label([20, y], String(number));
  }
  return s;
})();

// --- Sissach -----------------------------------------------------------------------
// Four tracks; both main lines run through on tracks 2 and 3, with crossovers
// at the east end.
const sissach = (() => {
  const s = station('Sissach');
  s.label([0, -3], 'Sissach (draft from the Z21 screenshot)', 'normal');
  // Track 2: Päärata Pun.
  s.exit([0, 2], 'W', 'Päärata Pun');
  s.track([0, 2], [7, 2]);
  s.turnout('left', [8, 2], 'E');
  s.track([9, 2], [31, 2]);
  s.turnout('right', [32, 2], 'W');
  s.track([33, 2], [37, 2]);
  s.turnout('left', [38, 2], 'W');
  s.turnout('right', [40, 2], 'E');
  s.track([41, 2], [46, 2]);
  s.exit([46, 2], 'E', 'Päärata Pun');
  // Track 1 beside track 2.
  s.stop([5, 0], 'E');
  s.track([5, 0], [9, 0]);
  s.turnout('left', [10, 0], 'W');
  s.track([11, 0], [29, 0]);
  s.turnout('right', [30, 0], 'E');
  s.track([31, 0], [35, 0]);
  s.stop([35, 0], 'W');
  // Track 3: Päärata Kel.
  s.exit([0, 4], 'W', 'Päärata Kel');
  s.track([0, 4], [7, 4]);
  s.turnout('right', [8, 4], 'E');
  s.track([9, 4], [31, 4]);
  s.turnout('left', [32, 4], 'W');
  s.track([33, 4], [35, 4]);
  s.turnout('left', [36, 4], 'E');
  s.track([37, 4], [41, 4]);
  s.turnout('right', [42, 4], 'W');
  s.track([43, 4], [46, 4]);
  s.exit([46, 4], 'E', 'Päärata Kel');
  // Track 4 beside track 3.
  s.stop([5, 6], 'E');
  s.track([5, 6], [9, 6]);
  s.turnout('right', [10, 6], 'W');
  s.track([11, 6], [29, 6]);
  s.turnout('left', [30, 6], 'E');
  s.track([31, 6], [35, 6]);
  s.stop([35, 6], 'W');
  for (const [number, y] of [
    [1, 0],
    [2, 2],
    [3, 4],
    [4, 6],
  ]) {
    s.label([20, y], String(number));
  }
  return s;
})();

const stations = [olten, inselburg, sissach];
const project = {
  format: 'lever-project',
  schemaVersion: 1,
  id: 'club-layout-draft',
  name: 'Club layout (draft)',
  settings: {defaultLevel: 1},
  views: stations.map((s, index) => ({
    id: `view-${index + 1}`,
    name: s.name,
    areaId: `area-${index + 1}`,
    elements: s.elements,
  })),
  areas: stations.map((s, index) => ({
    id: `area-${index + 1}`,
    name: s.name,
    level: 1,
  })),
};

const target = join(import.meta.dirname, '..', 'samples', 'club-layout.lever');
writeFileSync(target, `${JSON.stringify(project, null, 2)}\n`);
console.log(`Wrote ${target}`);
