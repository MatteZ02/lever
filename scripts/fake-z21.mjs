// Test-only fake Z21 central unit. NOT for use on a layout.
//
// Z21Sim (the dummy server) does not answer feedback requests, so this small
// responder fills the gap (docs/dummy-server.md). It answers the subset of the
// Z21 LAN protocol that Lever uses, keeps several clients with their own
// broadcast flags, and lets you switch feedback inputs from the keyboard:
//
//   node scripts/fake-z21.mjs [--port=21107] [--firmware=1.33] [--hardware=0x204]
//                             [--turnout-info-on=activate|deactivate|both]
//                             [--unsupported=unknown-command|silent]
//                             [--never-switched=output1|notSwitched] [--verbose]
//
// Then type `help`. Use a port other than 21105 while Z21Sim is running.
//
// It is written independently of packages/z21-protocol on purpose: a test
// double that shares Lever's encoders would hide Lever's encoding bugs. Byte
// layouts follow the spec (docs/reference/z21-lan-protokoll-en_1.13.pdf).
import dgram from 'node:dgram';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';

// Clients are forgotten after this long without a datagram (spec §1.1).
const CLIENT_TIMEOUT_MS = 60000;

const FLAG = {
  BASIC: 0x00000001,
  RBUS: 0x00000002,
  CAN_DETECTOR: 0x00080000,
  LOCONET_DETECTOR: 0x08000000,
};

const CENTRAL = {EMERGENCY_STOP: 0x01, POWER_OFF: 0x02, SHORT_CIRCUIT: 0x04};

// --- encoding ----------------------------------------------------------------

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

const u16le = (value) => [value & 0xff, (value >> 8) & 0xff];
const u32le = (value) => [
  value & 0xff,
  (value >> 8) & 0xff,
  (value >> 16) & 0xff,
  (value >>> 24) & 0xff,
];

// "1.33" → [0x01, 0x33] (BCD bytes).
const bcd = (version) => {
  const [major, minor] = version.split('.');
  return [parseInt(major, 16), parseInt(minor.padEnd(2, '0'), 16)];
};
const versionNumber = (version) => {
  const [major, minor] = version.split('.');
  return Number(major) * 100 + Number(minor.padEnd(2, '0'));
};

const splitDatagram = (buffer) => {
  const out = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const length = buffer[offset] | (buffer[offset + 1] << 8);
    if (length < 4 || offset + length > buffer.length) {
      break;
    }
    out.push({
      header: buffer[offset + 2] | (buffer[offset + 3] << 8),
      data: buffer.subarray(offset + 4, offset + length),
    });
    offset += length;
  }
  return out;
};

// --- the fake central unit ---------------------------------------------------

/**
 * Starts a fake Z21. Resolves when it is listening.
 * See scripts/fake-z21.d.mts for the options and the returned controls.
 */
export const createFakeZ21 = async (options = {}) => {
  const host = options.host ?? '127.0.0.1';
  const firmware = options.firmware ?? '1.33';
  const hardwareType = options.hardwareType ?? 0x204;
  const turnoutInfoOn = options.turnoutInfoOn ?? 'activate';
  const unsupported = options.unsupported ?? 'unknown-command';
  // ZZ for never-switched addresses: 1 (output 1) like the z21 start, or 0
  // ("not switched yet") as the spec describes.
  const neverSwitched = options.neverSwitched === 'notSwitched' ? 0 : 1;
  const log = options.log ?? (() => {});
  const fw = versionNumber(firmware);

  const socket = dgram.createSocket('udp4');
  const clients = new Map(); // "ip:port" → {address, port, flags, lastSeen}
  let centralState = CENTRAL.POWER_OFF;
  const turnouts = new Map(); // FAdr → ZZ
  const extAccessories = new Map(); // raw → value
  let activeOutput = null; // FAdr of an output activated with Q=0
  const violations = [];
  const rbus = new Array(20).fill(0); // one byte per module
  const loconet = new Map(); // feedback address → occupied
  const can = new Map(); // "module:port" → {networkId, module, port, value1, locos}
  const received = [];

  const clientKey = (address, port) => `${address}:${port}`;

  const sendTo = (client, buffer) => {
    log(`<< ${client.port} ${hex(buffer)}`);
    socket.send(buffer, client.port, client.address);
  };

  const broadcast = (flag, buffer) => {
    const now = Date.now();
    for (const [key, client] of clients) {
      if (now - client.lastSeen > CLIENT_TIMEOUT_MS) {
        clients.delete(key);
      } else if ((client.flags & flag) !== 0) {
        sendTo(client, buffer);
      }
    }
  };

  const unknownCommand = (client) => {
    if (unsupported === 'unknown-command') {
      sendTo(client, xbus([0x61, 0x82]));
    }
  };

  const status = () => xbus([0x62, 0x22, centralState]);
  const turnoutInfo = (fAdr) =>
    xbus([0x43, fAdr >> 8, fAdr & 0xff, turnouts.get(fAdr) ?? neverSwitched]);
  const extInfo = (raw) => {
    const known = extAccessories.has(raw);
    return xbus([
      0x44,
      raw >> 8,
      raw & 0xff,
      known ? extAccessories.get(raw) : 0,
      known ? 0x00 : 0xff,
    ]);
  };
  const rbusData = (group) =>
    dataset(0x80, [group, ...rbus.slice(group * 10, group * 10 + 10)]);
  const loconetReport = (type, address, info) =>
    dataset(0xa4, [type, ...u16le(address), ...info]);
  const canReport = (input, type, value1, value2) =>
    dataset(0xc4, [
      ...u16le(input.networkId),
      ...u16le(input.module),
      input.port,
      type,
      ...u16le(value1),
      ...u16le(value2),
    ]);
  const canLocoReports = (input) => {
    // Type 0x11..: two addresses each, ended by address 0.
    const values = input.locos.map(
      ({address, forward}) =>
        (address & 0x3fff) |
        (forward === undefined ? 0 : forward ? 0x8000 : 0xc000),
    );
    values.push(0);
    if (values.length % 2 === 1) {
      values.push(0);
    }
    const reports = [];
    for (let i = 0; i < values.length; i += 2) {
      reports.push(canReport(input, 0x11 + i / 2, values[i], values[i + 1]));
    }
    return reports;
  };

  const handleXBus = (client, data) => {
    if (data.length < 2) {
      return;
    }
    const body = data.subarray(0, data.length - 1);
    if (body.reduce((x, b) => x ^ b, 0) !== data[data.length - 1]) {
      log(`!! checksum error from ${client.port}: ${hex(data)}`);
      return;
    }
    const [x, db0, db1, db2, db3] = body;
    const key = `${x.toString(16)} ${db0?.toString(16)}`;
    switch (true) {
      case key === '21 24': // LAN_X_GET_STATUS
        sendTo(client, status());
        return;
      case key === '21 21': // LAN_X_GET_VERSION
        sendTo(client, xbus([0x63, 0x21, 0x30, 0x12]));
        return;
      case key === '21 80': // LAN_X_SET_TRACK_POWER_OFF
        centralState |= CENTRAL.POWER_OFF;
        broadcast(FLAG.BASIC, xbus([0x61, 0x00]));
        return;
      case key === '21 81': // LAN_X_SET_TRACK_POWER_ON
        centralState = 0;
        broadcast(FLAG.BASIC, xbus([0x61, 0x01]));
        return;
      case key === '80 80': // LAN_X_SET_STOP
        centralState |= CENTRAL.EMERGENCY_STOP;
        broadcast(FLAG.BASIC, xbus([0x81, 0x00]));
        return;
      case key === 'f1 a': // LAN_X_GET_FIRMWARE_VERSION
        sendTo(client, xbus([0xf3, 0x0a, ...bcd(firmware)]));
        return;
      case x === 0xe3 && db0 === 0xf0: // LAN_X_GET_LOCO_INFO: standing loco
        sendTo(client, xbus([0xef, db1, db2, 0x04, 0x00, 0, 0, 0, 0]));
        return;
      case x === 0x43 && body.length >= 3: // LAN_X_GET_TURNOUT_INFO
        sendTo(client, turnoutInfo((db0 << 8) | db1));
        return;
      case x === 0x53 && body.length >= 4: {
        // LAN_X_SET_TURNOUT 10Q0A00P
        const fAdr = (db0 << 8) | db1;
        const queued = (db2 & 0x20) !== 0;
        const activate = (db2 & 0x08) !== 0;
        if (activate) {
          if (!queued && activeOutput !== null && activeOutput !== fAdr) {
            const violation = `activate FAdr ${fAdr} while FAdr ${activeOutput} is still active (Q=0)`;
            violations.push(violation);
            log(`!! ${violation}`);
          }
          activeOutput = queued ? activeOutput : fAdr;
          turnouts.set(fAdr, (db2 & 0x01) + 1);
        } else if (activeOutput === fAdr) {
          activeOutput = null;
        }
        if (
          turnoutInfoOn === 'both' ||
          (turnoutInfoOn === 'activate') === activate
        ) {
          broadcast(FLAG.BASIC, turnoutInfo(fAdr));
        }
        return;
      }
      case x === 0x54 && body.length >= 5: {
        // LAN_X_SET_EXT_ACCESSORY (FW 1.40)
        if (fw < 140) {
          unknownCommand(client);
          return;
        }
        const raw = (db0 << 8) | db1;
        extAccessories.set(raw, db2);
        broadcast(FLAG.BASIC, extInfo(raw));
        return;
      }
      case x === 0x44 && body.length >= 4: // LAN_X_GET_EXT_ACCESSORY_INFO
        if (fw < 140) {
          unknownCommand(client);
          return;
        }
        sendTo(client, extInfo((db0 << 8) | db1));
        return;
      default:
        void db3;
        unknownCommand(client);
    }
  };

  const handleDataset = (client, {header, data}) => {
    switch (header) {
      case 0x10: // LAN_GET_SERIAL_NUMBER
        sendTo(client, dataset(0x10, u32le(4242)));
        return;
      case 0x18: // LAN_GET_CODE: unlocked
        sendTo(client, dataset(0x18, [0x02]));
        return;
      case 0x1a: // LAN_GET_HWINFO
        sendTo(
          client,
          dataset(0x1a, [
            ...u32le(hardwareType),
            ...bcd(firmware).reverse(),
            0,
            0,
          ]),
        );
        return;
      case 0x30: // LAN_LOGOFF
        clients.delete(clientKey(client.address, client.port));
        return;
      case 0x40:
        handleXBus(client, data);
        return;
      case 0x50: // LAN_SET_BROADCASTFLAGS
        if (data.length >= 4) {
          client.flags =
            (data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24)) >>>
            0;
        }
        return;
      case 0x51: // LAN_GET_BROADCASTFLAGS
        sendTo(client, dataset(0x51, u32le(client.flags)));
        return;
      case 0x85: // LAN_SYSTEMSTATE_GETDATA
        sendTo(
          client,
          dataset(0x84, [...new Array(12).fill(0), centralState, 0, 0, 0]),
        );
        return;
      case 0x81: // LAN_RMBUS_GETDATA
        if (data[0] === 0 || data[0] === 1) {
          sendTo(client, rbusData(data[0]));
        }
        return;
      case 0xa4: // LAN_LOCONET_DETECTOR (FW 1.22): report every known input
        if (fw < 122) {
          return;
        }
        for (const [address, occupied] of loconet) {
          sendTo(client, loconetReport(0x01, address, [occupied ? 1 : 0]));
        }
        return;
      case 0xc4: // LAN_CAN_DETECTOR (FW 1.30)
        if (fw < 130) {
          return;
        }
        for (const input of can.values()) {
          sendTo(client, canReport(input, 0x01, input.value1, 0));
        }
        return;
      default:
      // Unknown LAN headers are ignored, as a Z21 does.
    }
  };

  socket.on('message', (message, remote) => {
    const key = clientKey(remote.address, remote.port);
    let client = clients.get(key);
    if (!client) {
      client = {address: remote.address, port: remote.port, flags: 0};
      clients.set(key, client);
    }
    client.lastSeen = Date.now();
    log(`>> ${remote.port} ${hex(message)}`);
    for (const item of splitDatagram(message)) {
      received.push({
        port: remote.port,
        header: item.header,
        data: hex(item.data),
      });
      handleDataset(client, item);
    }
  });

  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(options.port ?? 21105, host, () => {
      socket.off('error', reject);
      resolve();
    });
  });

  const canInput = (module, port, networkId) => {
    const key = `${module}:${port}`;
    let input = can.get(key);
    if (!input) {
      input = {
        networkId: networkId ?? 0x1000 + module,
        module,
        port,
        value1: 0x0100,
        locos: [],
      };
      can.set(key, input);
    }
    return input;
  };

  return {
    port: socket.address().port,
    clientCount: () => clients.size,
    received,
    violations,

    setTrackPower(on) {
      centralState = on ? 0 : centralState | CENTRAL.POWER_OFF;
      broadcast(FLAG.BASIC, xbus([0x61, on ? 0x01 : 0x00]));
    },
    // As a z21 start reports it: short circuit, then power off at once.
    shortCircuit() {
      centralState = CENTRAL.POWER_OFF | CENTRAL.SHORT_CIRCUIT;
      broadcast(FLAG.BASIC, xbus([0x61, 0x08]));
      broadcast(FLAG.BASIC, xbus([0x61, 0x00]));
    },
    // A turnout switched elsewhere (handset, other bus).
    setTurnout(fAdr, output) {
      turnouts.set(fAdr, output + 1);
      broadcast(FLAG.BASIC, turnoutInfo(fAdr));
    },
    // R-Bus module 1..20, input 1..8.
    setRbusInput(module, input, occupied) {
      const index = module - 1;
      const bit = 1 << (input - 1);
      rbus[index] = occupied ? rbus[index] | bit : rbus[index] & ~bit;
      broadcast(FLAG.RBUS, rbusData(index < 10 ? 0 : 1));
    },
    setLocoNetOccupancy(address, occupied) {
      loconet.set(address, occupied);
      broadcast(
        FLAG.LOCONET_DETECTOR,
        loconetReport(0x01, address, [occupied ? 1 : 0]),
      );
    },
    setLocoNetTransponder(address, loco, enters) {
      broadcast(
        FLAG.LOCONET_DETECTOR,
        loconetReport(enters ? 0x02 : 0x03, address, u16le(loco)),
      );
    },
    setCanOccupancy(module, port, occupied, {networkId, overload = 0} = {}) {
      const input = canInput(module, port, networkId);
      input.value1 =
        overload > 0 ? 0x1200 | overload : occupied ? 0x1100 : 0x0100;
      broadcast(FLAG.CAN_DETECTOR, canReport(input, 0x01, input.value1, 0));
    },
    // locos: [{address, forward?}]
    setCanLocos(module, port, locos, {networkId} = {}) {
      const input = canInput(module, port, networkId);
      input.locos = locos;
      for (const report of canLocoReports(input)) {
        broadcast(FLAG.CAN_DETECTOR, report);
      }
    },
    close: () =>
      new Promise((resolve) => {
        socket.close(() => resolve());
      }),
  };
};

// --- command line ------------------------------------------------------------

const HELP = `Commands:
  rbus <module 1-20> <input 1-8> on|off       R-Bus feedback input
  loconet <address> on|off                    LocoNet occupancy detector
  transponder <address> enter|exit <loco>     LocoNet transponder report
  can <module> <port 0-7> on|off [overload]   CAN occupancy detector
  can-locos <module> <port> <loco>[+|-] ...   CAN RailCom list (+ forward, - backwards)
  turnout <number> 1|2                        turnout switched elsewhere (Roco number)
  power on|off                                track power
  short                                       short circuit
  clients                                     number of clients
  violations                                  Q=0 overlaps seen (two outputs active)
  help, quit`;

const runCli = async () => {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .filter((arg) => arg.startsWith('--'))
      .map((arg) => {
        const [name, value] = arg.slice(2).split('=');
        return [name, value ?? 'true'];
      }),
  );
  const verbose = args.verbose === 'true';
  const fake = await createFakeZ21({
    host: args.host ?? '0.0.0.0',
    port: Number(args.port ?? 21105),
    firmware: args.firmware,
    hardwareType: args.hardware ? Number(args.hardware) : undefined,
    turnoutInfoOn: args['turnout-info-on'],
    unsupported: args.unsupported,
    neverSwitched: args['never-switched'],
    log: verbose ? (line) => console.log(line) : undefined,
  });
  console.log(
    `Fake Z21 (TEST ONLY) listening on UDP ${fake.port}. Type "help".`,
  );

  const lines = createInterface({input: process.stdin});
  lines.on('line', (line) => {
    const [command, ...rest] = line.trim().split(/\s+/);
    const n = (index) => Number(rest[index]);
    const on = (index) => rest[index] === 'on';
    try {
      switch (command) {
        case 'rbus':
          fake.setRbusInput(n(0), n(1), on(2));
          break;
        case 'loconet':
          fake.setLocoNetOccupancy(n(0), on(1));
          break;
        case 'transponder':
          fake.setLocoNetTransponder(n(0), n(2), rest[1] === 'enter');
          break;
        case 'can':
          fake.setCanOccupancy(n(0), n(1), on(2), {overload: n(3) || 0});
          break;
        case 'can-locos':
          fake.setCanLocos(
            n(0),
            n(1),
            rest.slice(2).map((token) => ({
              address: parseInt(token, 10),
              forward: token.endsWith('+')
                ? true
                : token.endsWith('-')
                  ? false
                  : undefined,
            })),
          );
          break;
        case 'turnout':
          fake.setTurnout(n(0) - 1, n(1) - 1);
          break;
        case 'power':
          fake.setTrackPower(on(0));
          break;
        case 'short':
          fake.shortCircuit();
          break;
        case 'clients':
          console.log(fake.clientCount());
          break;
        case 'violations':
          console.log(
            fake.violations.length ? fake.violations.join('\n') : 'none',
          );
          break;
        case 'help':
          console.log(HELP);
          break;
        case 'quit':
        case 'exit':
          void fake.close().then(() => process.exit(0));
          return;
        case '':
        case undefined:
          return;
        default:
          console.log(`Unknown command "${command}". Type "help".`);
          return;
      }
      console.log('ok');
    } catch (error) {
      console.log(`error: ${error.message}`);
    }
  });
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void runCli();
}
