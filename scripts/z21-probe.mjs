// Probes a Z21-compatible central unit (or Z21Sim) for what Lever needs:
// accessory commands and replies, broadcasts to a second client, feedback
// requests, extended accessories. Prints a timestamped log of what each client
// sends and receives. Use it on Z21Sim, the z21 start and the DR5000 and
// compare the output (docs/dummy-server.md, docs/hardware-notes.md).
//
//   node scripts/z21-probe.mjs [host] [port] [--switch-address=<FAdr>]
//
// It switches ONE accessory output pair (default FAdr 0 = turnout #1 in Roco
// numbering) to both positions and back. Make sure that is harmless on a real
// layout, or choose an unused address. Nothing else is changed; track power is
// not touched.
import dgram from 'node:dgram';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const match = args.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.split('=')[1] : fallback;
};
const positional = args.filter((arg) => !arg.startsWith('--'));
const HOST = positional[0] ?? '127.0.0.1';
const PORT = Number(positional[1] ?? 21105);
const FADR = Number(option('switch-address', '0'));

// --- encoding helpers ------------------------------------------------------

const hex = (bytes) =>
  [...bytes]
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
const dataset = (header, data = []) => {
  const length = 4 + data.length;
  return Buffer.from([
    length & 0xff,
    length >> 8,
    header & 0xff,
    header >> 8,
    ...data,
  ]);
};
const xbus = (bytes) =>
  dataset(0x40, [...bytes, bytes.reduce((x, b) => x ^ b, 0)]);
const u16le = (value) => [value & 0xff, value >> 8];
const u32le = (value) => [
  value & 0xff,
  (value >> 8) & 0xff,
  (value >> 16) & 0xff,
  (value >>> 24) & 0xff,
];

const cmd = {
  setFlags: (flags) => dataset(0x50, u32le(flags)),
  getFlags: () => dataset(0x51),
  getStatus: () => xbus([0x21, 0x24]),
  hwInfo: () => dataset(0x1a),
  logoff: () => dataset(0x30),
  // §5.1 / §5.2: FAdr big-endian, 10Q0A00P
  getTurnout: (fadr) => xbus([0x43, fadr >> 8, fadr & 0xff]),
  setTurnout: (fadr, output, activate, queue = false) =>
    xbus([
      0x53,
      fadr >> 8,
      fadr & 0xff,
      0x80 | (queue ? 0x20 : 0) | (activate ? 0x08 : 0) | output,
    ]),
  // §5.4 / §5.5
  setExt: (raw, value) => xbus([0x54, raw >> 8, raw & 0xff, value, 0x00]),
  getExt: (raw) => xbus([0x44, raw >> 8, raw & 0xff, 0x00]),
  // §7.2, §9.5, §10.1
  rbusGetData: (group) => dataset(0x81, [group]),
  loconetDetector: (type, address) => dataset(0xa4, [type, ...u16le(address)]),
  canDetector: (networkId) => dataset(0xc4, [0x00, ...u16le(networkId)]),
};

// --- decoding (only enough to label the log) -------------------------------

const describe = (header, data) => {
  if (header === 0x40) {
    const x = data[0];
    if (x === 0x43)
      return `TURNOUT_INFO FAdr=${(data[1] << 8) | data[2]} ZZ=${data[3] & 0x03}`;
    if (x === 0x44)
      return `EXT_ACCESSORY_INFO raw=${(data[1] << 8) | data[2]} value=${data[3]} status=0x${data[4].toString(16)}`;
    if (x === 0x61 && data[1] === 0x82) return 'UNKNOWN_COMMAND';
    if (x === 0x61) return `BC track (0x${data[1].toString(16)})`;
    if (x === 0x62) return `STATUS_CHANGED 0x${data[2].toString(16)}`;
    if (x === 0x81) return 'BC_STOPPED';
    if (x === 0xef) return 'LOCO_INFO';
    return `X-Bus 0x${x.toString(16)}`;
  }
  if (header === 0x80)
    return `RMBUS_DATACHANGED group=${data[0]} ${hex(data.subarray(1))}`;
  if (header === 0xa4)
    return `LOCONET_DETECTOR type=0x${data[0].toString(16)} addr=${data[1] | (data[2] << 8)} info=${hex(data.subarray(3))}`;
  if (header === 0xc4)
    return `CAN_DETECTOR nid=0x${(data[0] | (data[1] << 8)).toString(16)} addr=${data[2] | (data[3] << 8)} port=${data[4]} type=0x${data[5].toString(16)} v1=0x${(data[6] | (data[7] << 8)).toString(16)} v2=0x${(data[8] | (data[9] << 8)).toString(16)}`;
  if (header === 0x51)
    return `BROADCASTFLAGS 0x${(data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24)) >>> 0}`.replace(
      /0x(\d+)$/,
      (_, n) => `0x${Number(n).toString(16).padStart(8, '0')}`,
    );
  if (header === 0x1a)
    return `HWINFO type=0x${(data[0] | (data[1] << 8)).toString(16)} fw=${data[5].toString(16)}.${data[4].toString(16).padStart(2, '0')}`;
  return `header 0x${header.toString(16)}`;
};

const split = (buffer) => {
  const out = [];
  for (let offset = 0; buffer.length - offset >= 4;) {
    const length = buffer[offset] | (buffer[offset + 1] << 8);
    if (length < 4 || offset + length > buffer.length) break;
    out.push({
      header: buffer[offset + 2] | (buffer[offset + 3] << 8),
      data: buffer.subarray(offset + 4, offset + length),
    });
    offset += length;
  }
  return out;
};

// --- clients ---------------------------------------------------------------

const t0 = Date.now();
const stamp = () => String(Date.now() - t0).padStart(6, ' ') + 'ms';

const client = async (name) => {
  const socket = dgram.createSocket('udp4');
  socket.on('message', (message) => {
    for (const {header, data} of split(message)) {
      console.log(
        `${stamp()} ${name} << ${hex([...message.subarray(0, 0)])}${describe(header, data)}   [${hex(data)}]`,
      );
    }
  });
  await new Promise((resolve) => socket.connect(PORT, HOST, resolve));
  return {
    send: (label, buffer) => {
      console.log(`${stamp()} ${name} >> ${hex(buffer)}   (${label})`);
      socket.send(buffer);
    },
    close: () => {
      socket.send(cmd.logoff());
      setTimeout(() => socket.close(), 50);
    },
  };
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const step = (title) => console.log(`\n--- ${title}`);

const RBUS = 0x00000002;
const BASIC = 0x00000001;
const LOCONET_DETECTOR = 0x08000000;
const CAN_DETECTOR = 0x00080000;

console.log(
  `Probing ${HOST}:${PORT}, switching FAdr ${FADR} (turnout #${FADR + 1} in Roco numbering)`,
);
const a = await client('A');
const b = await client('B');
const c = await client('C');

step('Login: A and B with basic + feedback flags, C with basic only');
a.send(
  'set flags',
  cmd.setFlags(BASIC | RBUS | LOCONET_DETECTOR | CAN_DETECTOR),
);
b.send(
  'set flags',
  cmd.setFlags(BASIC | RBUS | LOCONET_DETECTOR | CAN_DETECTOR),
);
c.send('set flags', cmd.setFlags(BASIC));
a.send('get status', cmd.getStatus());
a.send('hwinfo', cmd.hwInfo());
a.send('get flags', cmd.getFlags());
await wait(500);

step('Turnout info before switching');
a.send('get turnout info', cmd.getTurnout(FADR));
a.send('get turnout info (other address)', cmd.getTurnout(FADR + 1));
await wait(400);

step('A switches output 2 (P=1), Q=0: activate, 150 ms, deactivate');
a.send('activate P=1', cmd.setTurnout(FADR, 1, true));
await wait(150);
a.send('deactivate P=1', cmd.setTurnout(FADR, 1, false));
await wait(600);
a.send('get turnout info', cmd.getTurnout(FADR));
await wait(400);

step('B switches output 1 (P=0), Q=0');
b.send('activate P=0', cmd.setTurnout(FADR, 0, true));
await wait(150);
b.send('deactivate P=0', cmd.setTurnout(FADR, 0, false));
await wait(600);

step('A switches output 2 with Q=1 (queued; FW >= 1.24)');
a.send('activate P=1 Q', cmd.setTurnout(FADR, 1, true, true));
await wait(150);
a.send('deactivate P=1 Q', cmd.setTurnout(FADR, 1, false, true));
await wait(600);

step(
  'Back to output 1, activate only (no deactivate) - then deactivate after 1 s',
);
a.send('activate P=0', cmd.setTurnout(FADR, 0, true));
await wait(1000);
a.send('deactivate P=0', cmd.setTurnout(FADR, 0, false));
await wait(600);

step('Extended accessory (FW >= 1.40): get, set value 5, get');
a.send('get ext raw 4', cmd.getExt(4));
await wait(300);
a.send('set ext raw 4 = 5', cmd.setExt(4, 5));
await wait(300);
a.send('get ext raw 4', cmd.getExt(4));
await wait(400);

step('Feedback requests');
a.send('R-Bus group 0', cmd.rbusGetData(0));
a.send('R-Bus group 1', cmd.rbusGetData(1));
await wait(400);
a.send('LocoNet detector SIC', cmd.loconetDetector(0x80, 0));
await wait(400);
a.send('CAN detector all', cmd.canDetector(0xd000));
await wait(800);

step('Several datasets in one datagram');
a.send(
  'two turnout info requests',
  Buffer.concat([cmd.getTurnout(FADR), cmd.getTurnout(FADR + 1)]),
);
await wait(500);

step('Idle 3 s: anything unsolicited (e.g. feedback emulation)?');
await wait(3000);

a.close();
b.close();
c.close();
await wait(200);
console.log('\nDone.');
