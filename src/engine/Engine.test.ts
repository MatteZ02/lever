import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ConnectionManager} from '../connection/ConnectionManager';
import {FakeTransport} from '../connection/testUtils/fakeTransport';
import {ENGINE_API_VERSION, EngineEvent} from '../shared/engineApi';
import {Engine, EnginePort} from './Engine';

const STATUS_NORMAL = '08 00 40 00 62 22 00 40';

const fakePort = () => {
  const received: EngineEvent[] = [];
  let onMessage: (data: unknown) => void = () => undefined;
  let onClose: () => void = () => undefined;
  const port: EnginePort = {
    postMessage: (message) => received.push(message as EngineEvent),
    onMessage: (listener) => {
      onMessage = listener;
    },
    onClose: (listener) => {
      onClose = listener;
    },
  };
  return {
    port,
    received,
    send: (data: unknown) => onMessage(data),
    close: () => onClose(),
  };
};

const setup = async () => {
  const transport = new FakeTransport();
  const engine = new Engine(
    new ConnectionManager({createTransport: () => transport}),
  );
  engine.connect('192.168.0.111', 21105);
  await vi.advanceTimersByTimeAsync(0);
  transport.receive(STATUS_NORMAL);
  transport.takeSent();
  return {engine, transport};
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Engine', () => {
  it('sends a snapshot to a newly attached port', async () => {
    const {engine} = await setup();
    const window = fakePort();
    engine.attachPort(window.port);

    expect(window.received).toEqual([
      {
        v: ENGINE_API_VERSION,
        type: 'snapshot',
        snapshot: {
          connection: {state: 'connected', host: '192.168.0.111', port: 21105},
          trackStatus: 'normal',
          deviceInfo: {},
          protocolLog: false,
        },
      },
    ]);
  });

  it('sends STOP immediately', async () => {
    const {engine, transport} = await setup();
    const window = fakePort();
    engine.attachPort(window.port);

    window.send({v: ENGINE_API_VERSION, type: 'emergencyStop'});
    expect(transport.takeSent()).toEqual(['06 00 40 00 80 80']);
  });

  it('ignores invalid commands and other API versions', async () => {
    const {engine, transport} = await setup();
    const window = fakePort();
    engine.attachPort(window.port);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    window.send({v: ENGINE_API_VERSION, type: 'setTrackPower', on: 'yes'});
    window.send({v: 999, type: 'emergencyStop'});
    window.send('not a command');

    expect(transport.takeSent()).toEqual([]);
    expect(error).toHaveBeenCalledTimes(3);
    error.mockRestore();
  });

  it('broadcasts track status to every window, and stops after close', async () => {
    const {engine, transport} = await setup();
    const first = fakePort();
    const second = fakePort();
    engine.attachPort(first.port);
    engine.attachPort(second.port);
    second.close();

    transport.receive('07 00 40 00 81 00 81');

    const statusEvents = (events: EngineEvent[]) =>
      events.filter((event) => event.type === 'trackStatus');
    expect(statusEvents(first.received)).toEqual([
      {v: ENGINE_API_VERSION, type: 'trackStatus', status: 'emergencyStop'},
    ]);
    expect(statusEvents(second.received)).toEqual([]);
  });
});
