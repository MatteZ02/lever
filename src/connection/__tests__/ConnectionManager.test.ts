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
  KEEPALIVE_IDLE_MS,
  RECONNECT_DELAYS_MS,
} from '../ConnectionManager';
import {FakeTransport} from '../testUtils/fakeTransport';
import {TrackStatus} from '../trackStatus';

const SET_FLAGS_AND_STATUS = '08 00 50 00 01 00 00 00 07 00 40 00 21 24 05';
const GET_STATUS = '07 00 40 00 21 24 05';
const DEVICE_INFO_REQUESTS = '04 00 1A 00 04 00 18 00 04 00 10 00';
const GET_FIRMWARE_VERSION = '07 00 40 00 F1 0A FB';
const LOGOFF = '04 00 30 00';
const STATUS_NORMAL = '08 00 40 00 62 22 00 40';
const HWINFO_FW_143 = '0C 00 1A 00 04 02 00 00 43 01 00 00';

const setup = (options: {combineDatasets?: boolean} = {}) => {
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
  manager.on('state', (state) => states.push(state));
  manager.on('trackStatus', (status) => trackStatuses.push(status));
  const current = () => transports[transports.length - 1];
  return {manager, transports, current, states, trackStatuses};
};

// Lets the async socket open complete.
const settle = () => vi.advanceTimersByTimeAsync(0);

const connected = async (options?: {combineDatasets?: boolean}) => {
  const context = setup(options);
  context.manager.connect('192.168.0.111');
  await settle();
  context.current().receive(STATUS_NORMAL);
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
  it('logs in by setting broadcast flags and requesting status in one datagram', async () => {
    const {manager, current, states} = setup();
    manager.connect('192.168.0.111');
    await settle();

    expect(current().host).toBe('192.168.0.111');
    expect(current().port).toBe(21105);
    expect(current().sent).toEqual([SET_FLAGS_AND_STATUS]);
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
    expect(transports[0].sent).toEqual([SET_FLAGS_AND_STATUS]); // no logoff
    expect(states).toEqual(['connecting', 'reconnecting']);

    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    expect(transports).toHaveLength(2);
    expect(transports[1].sent).toEqual([SET_FLAGS_AND_STATUS]);

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
    expect(transports[1].sent).toEqual([SET_FLAGS_AND_STATUS]);
  });

  it('uses separate datagrams when combining is turned off', async () => {
    const {manager, current} = setup({combineDatasets: false});
    manager.connect('192.168.0.111');
    await settle();
    expect(current().sent).toEqual(['08 00 50 00 01 00 00 00', GET_STATUS]);
  });

  it('sets the configured broadcast flags', async () => {
    const transport = new FakeTransport();
    const manager = new ConnectionManager({
      createTransport: () => transport,
      broadcastFlags: 0x00000003,
    });
    manager.connect('192.168.0.111');
    await settle();
    expect(transport.sent[0].startsWith('08 00 50 00 03 00 00 00')).toBe(true);
  });
});

describe('keepalive and connection loss', () => {
  it('sends LAN_X_GET_STATUS after the idle period', async () => {
    const {current} = await connected();
    current().receive(HWINFO_FW_143);
    vi.advanceTimersByTime(KEEPALIVE_IDLE_MS - 1000);
    expect(current().takeSent()).toEqual([]);
    vi.advanceTimersByTime(5000);
    expect(current().takeSent()).toEqual([GET_STATUS]);
  });

  it('probes even while sending, if nothing is received', async () => {
    const {manager, current} = await connected();
    // Send something every second for 30 s without any reply.
    for (let second = 1; second <= 30; second++) {
      manager.requestSystemState();
      vi.advanceTimersByTime(1000);
    }
    expect(
      current()
        .takeSent()
        .filter((s) => s === GET_STATUS),
    ).toHaveLength(1);
  });

  it('reconnects with logoff when nothing is received', async () => {
    const {transports, states} = await connected();
    vi.advanceTimersByTime(CONNECTION_LOST_AFTER_MS + 5000);

    expect(transports[0].sent.at(-1)).toBe(LOGOFF);
    expect(transports[0].closed).toBe(true);
    expect(states.at(-1)).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    expect(transports[1].sent).toEqual([SET_FLAGS_AND_STATUS]);
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
