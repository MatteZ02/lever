// Generates a large test layout for the SVG performance check (STK-8): one
// station view with a 10 × 10 grid of station blocks (about 5,500 elements).
//
//   node scripts/make-stress-project.mjs <output.lever> [blocks per side]
//
// Not a real layout; only for measuring drawing speed.
import {writeFileSync} from 'node:fs';

const [output, sideArg] = process.argv.slice(2);
if (!output) {
  console.error(
    'Usage: node scripts/make-stress-project.mjs <output.lever> [blocks per side]',
  );
  process.exit(1);
}
const side = Number(sideArg ?? 10);
let counter = 0;
const id = (prefix) => `${prefix}-${++counter}`;
const elements = [];

const block = (ox, oy) => {
  const p = (x, y) => ({x: ox + x, y: oy + y});
  const track = (...points) =>
    elements.push({
      kind: 'track',
      id: id('t'),
      name: '',
      points: points.map(([x, y]) => p(x, y)),
    });
  const turnout = (type, [x, y], orientation) =>
    elements.push({
      kind: 'turnout',
      id: id('w'),
      name: `W${counter}`,
      type,
      at: p(x, y),
      orientation,
      control: {kind: 'dcc', addresses: [(counter % 2000) + 1], invert: false},
    });
  const stop = ([x, y], direction) =>
    elements.push({
      kind: 'bufferStop',
      id: id('b'),
      name: '',
      at: p(x, y),
      direction,
    });
  const signal = ([x, y], facing) =>
    elements.push({
      kind: 'signal',
      id: id('s'),
      name: '',
      at: p(x, y),
      facing,
      side: 'right',
      signalTypeId: 'builtin:main2',
      control: {kind: 'manual'},
    });
  // A Sissach-like block: two through tracks, two side tracks, crossovers.
  stop([0, 2], 'E');
  track([0, 2], [7, 2]);
  turnout('left', [8, 2], 'E');
  track([9, 2], [31, 2]);
  turnout('right', [32, 2], 'W');
  track([33, 2], [40, 2]);
  stop([40, 2], 'W');
  stop([5, 0], 'E');
  track([5, 0], [9, 0]);
  turnout('left', [10, 0], 'W');
  track([11, 0], [29, 0]);
  turnout('right', [30, 0], 'E');
  track([31, 0], [35, 0]);
  stop([35, 0], 'W');
  stop([0, 4], 'E');
  track([0, 4], [7, 4]);
  turnout('right', [8, 4], 'E');
  track([9, 4], [31, 4]);
  turnout('left', [32, 4], 'W');
  track([33, 4], [40, 4]);
  stop([40, 4], 'W');
  stop([5, 6], 'E');
  track([5, 6], [9, 6]);
  turnout('right', [10, 6], 'W');
  track([11, 6], [29, 6]);
  turnout('left', [30, 6], 'E');
  track([31, 6], [35, 6]);
  stop([35, 6], 'W');
  for (const [x, y, facing] of [
    [14, 0, 'E'],
    [26, 0, 'W'],
    [14, 2, 'E'],
    [26, 2, 'W'],
    [14, 4, 'E'],
    [26, 4, 'W'],
    [14, 6, 'E'],
    [26, 6, 'W'],
  ]) {
    signal([x, y], facing);
  }
  elements.push({
    kind: 'label',
    id: id('l'),
    name: '',
    at: p(18, -1),
    text: `Block ${ox},${oy}`,
    size: 'small',
  });
};

for (let row = 0; row < side; row++) {
  for (let column = 0; column < side; column++) {
    block(column * 46, row * 10);
  }
}

const project = {
  format: 'lever-project',
  schemaVersion: 1,
  id: 'stress',
  name: `Stress test (${elements.length} elements)`,
  views: [{id: 'v', name: 'Stress', areaId: 'a', elements}],
  areas: [{id: 'a', name: 'Stress', level: 1}],
};
writeFileSync(output, JSON.stringify(project));
console.log(`${elements.length} elements → ${output}`);
