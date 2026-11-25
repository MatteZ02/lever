// Adapted from Throttle's ConnectionManager tests (see ../COPIED_FROM.md):
// Jest timers became Vitest timers, and the loco tests were removed with the
// loco code.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  CONNECT_TIMEOUT_MS,
  ConnectionManager,
  ConnectionState,
  CONNECTION_LOST_AFTER_MS,
  DEVICE_INFO_TIMEOUT_MS,
  FLAGS_REPLY_TIMEOUT_MS,
  KEEPALIVE_IDLE_MS,
  MIN_STATUS_POLL_MS,
  PROBE_TIMEOUT_MS,
  RECONNECT_DELAYS_MS,
  STATUS_REFRESH_MIN_AGE_MS,
} from '../ConnectionManager';
import {FakeTransport} from '../testUtils/fakeTransport';
import {TrackStatus} from '../trackStatus';

// Login: ask which broadcast flags are set, and the status (§2.17, §2.12).
const LOGIN = '04 00 51 00 07 00 40 00 21 24 05';
const SET_FLAGS_1 = '08 00 50 00 01 00 00 00';
// LAN_GET_BROADCASTFLAGS reply: none set (a new client on a Z21).
const FLAGS_NONE = '08 00 51 00 00 00 00 00';
const GET_STATUS = '07 00 40 00 21 24 05';
const DEVICE_INFO_REQUESTS = '04 00 1A 00 04 00 18 00 04 00 10 00';
const GET_FIRMWARE_VERSION = '07 00 40 00 F1 0A FB';
const LOGOFF = '04 00 30 00';
const STATUS_NORMAL = '08 00 40 00 62 22 00 40';
const HWINFO_FW_143 = '0C 00 1A 00 04 02 00 00 43 01 00 00';

const setup = (
  options: {combineDatasets?: boolean; broadcastFlags?: number} = {},
) => {
  const transports: FakeTransport[] = [];
  const manager = new ConnectionManager({
    createTransport: () => {
      const transport = new FakeTransport();
      transports.push(transport);
      return transport;
    },
    ...options,
  });
  const states: ConnectionState[] = [];
  const trackStatuses: TrackStatus[] = [];
  const interruptions: boolean[] = [];
  manager.on('state', (state) => states.push(state));
  manager.on('trackStatus', (status) => trackStatuses.push(status));
  manager.on('interrupted', (interrupted) => interruptions.push(interrupted));
  const current = () => transports[transports.length - 1];
  return {manager, transports, current, states, trackStatuses, interruptions};
};

// Lets the async socket open complete.
const settle = () => vi.advanceTimersByTimeAsync(0);

const connected = async (options?: {combineDatasets?: boolean}) => {
  const context = setup(options);
  context.manager.connect('192.168.0.111');
  await settle();
  context.current().receive(STATUS_NORMAL);
  context.current().receive(FLAGS_NONE);
  context.current().takeSent();
  return context;
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('connecting', () => {
  it('logs in by asking the broadcast flags and the status in one datagram', async () => {
    const {manager, current, states} = setup();
    manager.connect('192.168.0.111');
    await settle();

    expect(current().host).toBe('192.168.0.111');
    expect(current().port).toBe(21105);
    expect(current().sent).toEqual([LOGIN]);
    expect(states).toEqual(['connecting']);
  });

  it('is connected on the first reply and then asks for device info', async () => {
    const {manager, current, states, trackStatuses} = setup();
    manager.connect('192.168.0.111');
    await settle();
    current().takeSent();

    current().receive(STATUS_NORMAL);

    expect(manager.getState()).toBe('connected');
    expect(states).toEqual(['connecting', 'connected']);
    expect(trackStatuses).toEqual(['normal']);
    expect(current().takeSent()).toEqual([DEVICE_INFO_REQUESTS]);
  });

  it('collects device info', async () => {
    const {manager, current} = await connected();
    current().receive(HWINFO_FW_143);
    current().receive('05 00 18 00 02');
    current().receive('08 00 10 00 39 30 00 00');

    expect(manager.getDeviceInfo()).toEqual({
      hardwareType: 0x204,
      firmwareVersion: '1.43',
      lockCode: 2,
      serialNumber: 12345,
    });
  });

  it('falls back to LAN_X_GET_FIRMWARE_VERSION when HWINFO is not answered', async () => {
    const {manager, current} = await connected();
    vi.advanceTimersByTime(DEVICE_INFO_TIMEOUT_MS);
    expect(current().takeSent()).toEqual([GET_FIRMWARE_VERSION]);

    current().receive('09 00 40 00 F3 0A 01 23 DB');
    expect(manager.getDeviceInfo().firmwareVersion).toBe('1.23');
  });

  it('does not use the fallback when HWINFO answered', async () => {
    const {current} = await connected();
    current().receive(HWINFO_FW_143);
    vi.advanceTimersByTime(DEVICE_INFO_TIMEOUT_MS);
    expect(current().takeSent()).toEqual([]);
  });

  it('retries with backoff while the central unit does not answer', async () => {
    const {manager, transports, states} = setup();
    manager.connect('192.168.0.111');
    await settle();

    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
    expect(transports[0].closed).toBe(true);
    expect(transports[0].sent).toEqual([LOGIN]); // no logoff
    expect(states).toEqual(['connecting', 'reconnecting']);

    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    expect(transports).toHaveLength(2);
    expect(transports[1].sent).toEqual([LOGIN]);

    // Second failure waits for the second delay.
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[1] - 1);
    expect(transports).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(transports).toHaveLength(3);
  });

  it('retries when the socket cannot be opened', async () => {
    const transports: FakeTransport[] = [];
    const manager = new ConnectionManager({
      createTransport: () => {
        const transport = new FakeTransport();
        transport.failOpen = transports.length === 0;
        transports.push(transport);
        return transport;
      },
    });
    manager.connect('192.168.0.111');
    await settle();
    expect(manager.getState()).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    expect(transports[1].sent).toEqual([LOGIN]);
  });

  it('uses separate datagrams when combining is turned off', async () => {
    const {manager, current} = setup({combineDatasets: false});
    manager.connect('192.168.0.111');
    await settle();
    expect(current().sent).toEqual(['04 00 51 00', GET_STATUS]);
  });

  it('sets the configured broadcast flags', async () => {
    const transport = new FakeTransport();
    const manager = new ConnectionManager({
      createTransport: () => transport,
      broadcastFlags: 0x00000003,
    });
    manager.connect('192.168.0.111');
    await settle();
    transport.receive(STATUS_NORMAL);
    transport.receive(FLAGS_NONE);
    expect(transport.sent).toContain('08 00 50 00 03 00 00 00');
  });
});

describe('broadcast flags', () => {
  it('given a Z21 (no flags set for a new client), Lever sets its own', async () => {
    const {manager, current} = setup();
    manager.connect('192.168.0.111');
    await settle();
    current().receive(STATUS_NORMAL);
    current().takeSent();
    current().receive(FLAGS_NONE);
    expect(current().takeSent()).toEqual([SET_FLAGS_1]);
  });

  it('given a DR5000 (one set of flags for all clients), Lever adds its own and keeps the others', async () => {
    const {manager, current} = setup({broadcastFlags: 0x00000003});
    manager.connect('192.168.0.111');
    await settle();
    current().receive(STATUS_NORMAL);
    current().takeSent();
    // WinDigipet or the Z21 app set basic + system state (0x101).
    current().receive('08 00 51 00 01 01 00 00');
    expect(current().takeSent()).toEqual(['08 00 50 00 03 01 00 00']);

    // Later changes keep them too.
    manager.setBroadcastFlags(0x00000001);
    expect(current().takeSent()).toEqual(['08 00 50 00 01 01 00 00']);
  });

  it("given the flags already include Lever's, nothing is sent", async () => {
    const {manager, current} = setup();
    manager.connect('192.168.0.111');
    await settle();
    current().receive(STATUS_NORMAL);
    current().takeSent();
    current().receive('08 00 51 00 01 00 00 00');
    expect(current().takeSent()).toEqual([]);
  });

  it('never sends the all-locos flag, also not on behalf of another client', async () => {
    const {manager, current} = setup();
    manager.connect('192.168.0.111');
    await settle();
    current().receive(STATUS_NORMAL);
    current().takeSent();
    current().receive('08 00 51 00 01 00 01 00');
    expect(current().takeSent()).toEqual([SET_FLAGS_1]);
  });

  it('given no answer to the flags request, Lever sets its own after a timeout', async () => {
    const {manager, current} = setup();
    manager.connect('192.168.0.111');
    await settle();
    current().receive(STATUS_NORMAL);
    current().takeSent();
    vi.advanceTimersByTime(FLAGS_REPLY_TIMEOUT_MS - 1);
    expect(current().takeSent()).not.toContain(SET_FLAGS_1);
    vi.advanceTimersByTime(1);
    expect(current().takeSent()).toContain(SET_FLAGS_1);
  });

  it('sends changed flags at once and again after reconnecting', async () => {
    const {manager, transports} = await connected();
    manager.setBroadcastFlags(0x00000003);
    expect(transports[0].takeSent()).toEqual(['08 00 50 00 03 00 00 00']);

    manager.setBroadcastFlags(0x00000003);
    expect(transports[0].takeSent()).toEqual([]);

    vi.advanceTimersByTime(CONNECTION_LOST_AFTER_MS + 5000);
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    expect(transports[1].takeSent()).toEqual([LOGIN]);
    transports[1].receive(STATUS_NORMAL);
    transports[1].receive(FLAGS_NONE);
    expect(transports[1].takeSent()).toContain('08 00 50 00 03 00 00 00');
  });

  it('given flags changed while the flags request is open, the answer sends the new ones', async () => {
    const {manager, current} = setup();
    manager.connect('192.168.0.111');
    await settle();
    expect(current().takeSent()).toEqual([LOGIN]);
    manager.setBroadcastFlags(0x00000003);
    expect(current().takeSent()).toEqual([]);
    current().receive(STATUS_NORMAL);
    current().receive(FLAGS_NONE);
    expect(current().takeSent()).toContain('08 00 50 00 03 00 00 00');
  });

  it('refuses the all-locos flag', () => {
    const {manager} = setup();
    expect(() => manager.setBroadcastFlags(0x00010001)).toThrow();
    expect(
      () =>
        new ConnectionManager({
          createTransport: () => new FakeTransport(),
          broadcastFlags: 0x00010000,
        }),
    ).toThrow();
  });
});

describe('keepalive and connection loss', () => {
  it('sends LAN_X_GET_STATUS after the idle period', async () => {
    const {current} = await connected();
    current().receive(HWINFO_FW_143);
    vi.advanceTimersByTime(KEEPALIVE_IDLE_MS - 1000);
    expect(current().takeSent()).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(current().takeSent()).toEqual([GET_STATUS]);
  });

  it('probes even while sending, if nothing is received', async () => {
    const {manager, current} = await connected();
    current().receive(HWINFO_FW_143);
    current().takeSent();
    // Send something every second without any reply.
    for (let second = 1; second <= KEEPALIVE_IDLE_MS / 1000; second++) {
      manager.requestSystemState();
      vi.advanceTimersByTime(1000);
    }
    expect(current().takeSent()).toContain(GET_STATUS);
  });

  it('given one unanswered request, the connection is interrupted but stays usable', async () => {
    const {manager, current, interruptions, trackStatuses} = await connected();
    current().receive(HWINFO_FW_143);
    vi.advanceTimersByTime(KEEPALIVE_IDLE_MS);
    expect(current().takeSent()).toEqual([GET_STATUS]);

    vi.advanceTimersByTime(PROBE_TIMEOUT_MS);
    expect(manager.isInterrupted()).toBe(true);
    expect(interruptions).toEqual([true]);
    expect(manager.getState()).toBe('connected');
    // Last reported status may be out of date.
    expect(trackStatuses.at(-1)).toBe('unknown');
    // Asked again, and commands still go out.
    expect(current().takeSent()).toEqual([GET_STATUS]);
    manager.emergencyStop();
    expect(current().takeSent()).toEqual(['06 00 40 00 80 80']);
  });

  it('asks again every PROBE_TIMEOUT_MS while interrupted', async () => {
    const {current} = await connected();
    current().receive(HWINFO_FW_143);
    vi.advanceTimersByTime(KEEPALIVE_IDLE_MS);
    current().takeSent();
    vi.advanceTimersByTime(PROBE_TIMEOUT_MS * 2);
    expect(current().takeSent()).toEqual([GET_STATUS, GET_STATUS]);
  });

  it('when a reply comes, the interruption ends; flags and status are asked again', async () => {
    const {manager, current, interruptions, trackStatuses} = await connected();
    current().receive(HWINFO_FW_143);
    vi.advanceTimersByTime(KEEPALIVE_IDLE_MS + PROBE_TIMEOUT_MS);
    current().takeSent();

    current().receive(STATUS_NORMAL);
    expect(manager.isInterrupted()).toBe(false);
    expect(interruptions).toEqual([true, false]);
    expect(trackStatuses.at(-1)).toBe('normal');
    // LAN_GET_BROADCASTFLAGS + LAN_X_GET_STATUS, as at login.
    expect(current().takeSent()).toEqual([LOGIN]);
    current().receive(FLAGS_NONE);
    expect(current().takeSent()).toEqual([SET_FLAGS_1]);
  });

  it('reconnects with logoff when nothing is received', async () => {
    const {transports, states} = await connected();
    vi.advanceTimersByTime(CONNECTION_LOST_AFTER_MS + 5000);

    expect(transports[0].sent.at(-1)).toBe(LOGOFF);
    expect(transports[0].closed).toBe(true);
    expect(states.at(-1)).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    expect(transports[1].sent).toEqual([LOGIN]);
  });

  it('stays connected while replies keep coming', async () => {
    const {manager, current} = await connected();
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(KEEPALIVE_IDLE_MS + 5000);
      current().receive(STATUS_NORMAL);
    }
    expect(manager.getState()).toBe('connected');
  });
});

describe('status poll', () => {
  it('given a poll interval, the status is asked that often while answered', async () => {
    const {manager, current} = await connected();
    current().receive(HWINFO_FW_143);
    manager.setStatusPoll(1000);
    current().takeSent();
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1000);
      expect(current().takeSent()).toEqual([GET_STATUS]);
      current().receive(STATUS_NORMAL);
    }
  });

  it('given another device stopped the layout, the stop shows with the next poll', async () => {
    const {manager, current, trackStatuses} = await connected();
    manager.setStatusPoll(1000);
    vi.advanceTimersByTime(1000);
    current().receive('08 00 40 00 62 22 01 41'); // status: emergency stop
    expect(trackStatuses.at(-1)).toBe('emergencyStop');
  });

  it('never polls faster than the minimum', async () => {
    const {manager, current} = await connected();
    current().receive(HWINFO_FW_143);
    manager.setStatusPoll(10);
    current().takeSent();
    vi.advanceTimersByTime(MIN_STATUS_POLL_MS - 1);
    expect(current().takeSent()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(current().takeSent()).toEqual([GET_STATUS]);
  });
});

describe('status refresh on user actions', () => {
  it('given a stale status, when the user acts, then the status is asked again', async () => {
    const {manager, current} = await connected();
    vi.advanceTimersByTime(STATUS_REFRESH_MIN_AGE_MS);
    current().takeSent(); // device info requests
    manager.refreshStatusIfStale();
    expect(current().takeSent()).toEqual([GET_STATUS]);
  });

  it('given a recent request, when the user acts quickly again, then nothing is sent', async () => {
    const {manager, current} = await connected();
    vi.advanceTimersByTime(STATUS_REFRESH_MIN_AGE_MS);
    current().takeSent(); // device info requests
    manager.refreshStatusIfStale();
    vi.advanceTimersByTime(STATUS_REFRESH_MIN_AGE_MS - 1);
    manager.refreshStatusIfStale();
    expect(current().takeSent()).toEqual([GET_STATUS]);
  });

  it('given the connect request was just sent, then no extra request', async () => {
    const {manager, current} = await connected();
    manager.refreshStatusIfStale();
    expect(current().takeSent()).toEqual([]);
  });

  it('given another device stopped the layout, when the user acts, then the stop shows', async () => {
    const {manager, current, trackStatuses} = await connected();
    vi.advanceTimersByTime(STATUS_REFRESH_MIN_AGE_MS);
    current().takeSent(); // device info requests
    manager.refreshStatusIfStale();
    current().receive('08 00 40 00 62 22 01 41'); // status: emergency stop
    expect(trackStatuses.at(-1)).toBe('emergencyStop');
  });

  it('given no connection, then nothing is sent', () => {
    const {manager, transports} = setup();
    manager.refreshStatusIfStale();
    expect(transports).toEqual([]);
  });
});

describe('disconnect', () => {
  it('logs off, closes and does not reconnect', async () => {
    const {manager, transports, states} = await connected();
    manager.disconnect();

    expect(transports[0].sent).toEqual([LOGOFF]);
    expect(transports[0].closed).toBe(true);
    expect(states.at(-1)).toBe('disconnected');

    await vi.advanceTimersByTimeAsync(60000);
    expect(transports).toHaveLength(1);
  });

  it('ignores replies arriving after disconnect', async () => {
    const {manager, transports} = await connected();
    manager.disconnect();
    transports[0].receive(STATUS_NORMAL);
    expect(manager.getState()).toBe('disconnected');
  });

  it('drops commands while not connected', async () => {
    const {manager, current} = setup();
    manager.connect('192.168.0.111');
    await settle();
    current().takeSent();

    manager.setTrackPower(false);
    manager.emergencyStop();
    manager.sendDatasets([new Uint8Array([4, 0, 0x85, 0])]);
    expect(current().sent).toEqual([]);
  });
});

describe('track status', () => {
  it('follows broadcasts', async () => {
    const {current, trackStatuses} = await connected();
    current().receive('07 00 40 00 81 00 81'); // stopped
    current().receive('07 00 40 00 61 00 61'); // power off
    current().receive('07 00 40 00 61 08 69'); // short circuit
    current().receive('07 00 40 00 61 00 61'); // power off: short stays
    current().receive('07 00 40 00 61 01 60'); // power on

    expect(trackStatuses).toEqual([
      'normal',
      'emergencyStop',
      'powerOff',
      'shortCircuit',
      'normal',
    ]);
  });

  it('becomes unknown when the connection is lost', async () => {
    const {manager, trackStatuses} = await connected();
    manager.disconnect();
    expect(trackStatuses.at(-1)).toBe('unknown');
  });

  it('sends track power and emergency stop commands immediately', async () => {
    const {manager, current} = await connected();
    manager.setTrackPower(false);
    manager.setTrackPower(true);
    manager.emergencyStop();
    expect(current().takeSent()).toEqual([
      '07 00 40 00 21 80 A1',
      '07 00 40 00 21 81 A0',
      '06 00 40 00 80 80',
    ]);
  });
});

describe('messages', () => {
  it('passes every decoded message on, including several per datagram', async () => {
    const {manager, current} = await connected();
    const types: string[] = [];
    manager.on('message', (message) => types.push(message.type));
    current().receive('07 00 40 00 81 00 81' + '07 00 40 00 61 01 60');
    expect(types).toEqual(['stopped', 'trackPowerOn']);
  });
});
