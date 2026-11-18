import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  CONNECTION_LOST_AFTER_MS,
  ConnectionManager,
  RECONNECT_DELAYS_MS,
} from '../connection/ConnectionManager';
import {FakeTransport} from '../connection/testUtils/fakeTransport';
import {projectWith, turnout} from '../model/__tests__/testLayouts';
import {ENGINE_API_VERSION, EngineEvent} from '../shared/engineApi';
import {Engine, EnginePort} from './Engine';

const STATUS_NORMAL = '08 00 40 00 62 22 00 40';
const HWINFO_FW_133 = '0C 00 1A 00 04 02 00 00 33 01 00 00';
const PULSE = 150;
const GAP = 150;

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
    send: (data: Record<string, unknown>) =>
      onMessage({v: ENGINE_API_VERSION, ...data}),
    close: () => onClose(),
    ofType: <T extends EngineEvent['type']>(type: T) =>
      received.filter(
        (event): event is Extract<EngineEvent, {type: T}> =>
          event.type === type,
      ),
  };
};

const setup = async () => {
  const transports: FakeTransport[] = [];
  const connection = new ConnectionManager({
    createTransport: () => {
      const transport = new FakeTransport();
      transports.push(transport);
      return transport;
    },
  });
  const engine = new Engine(connection, {
    accessoryGapMs: GAP,
    defaultPulseMs: PULSE,
  });
  engine.connect('192.168.0.111', 21105);
  await vi.advanceTimersByTimeAsync(0);
  const transport = () => transports[transports.length - 1];
  transport().receive(STATUS_NORMAL);
  transport().receive('08 00 51 00 00 00 00 00'); // broadcast flags: none
  transport().takeSent();
  const window = fakePort();
  engine.attachPort(window.port);
  return {engine, transport, transports, window};
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Engine', () => {
  it('sends a snapshot to a newly attached port', async () => {
    const {window} = await setup();
    expect(window.received).toEqual([
      {
        v: ENGINE_API_VERSION,
        type: 'snapshot',
        snapshot: {
          connection: {state: 'connected', host: '192.168.0.111', port: 21105},
          trackStatus: 'normal',
          deviceInfo: {},
          protocolLog: false,
          accessories: [],
          extAccessories: [],
          feedbackSources: [],
          feedbackInputs: [],
          accessoryQueueLength: 0,
          layout: {turnouts: {}, signals: {}, accessories: {}, blocks: {}},
        },
      },
    ]);
  });

  it('sends STOP immediately, even with accessory commands queued', async () => {
    const {transport, window} = await setup();
    window.send({type: 'switchAccessory', fAdr: 4, output: 1});
    window.send({type: 'switchAccessory', fAdr: 2, output: 0});
    transport().takeSent();

    window.send({type: 'emergencyStop'});
    expect(transport().takeSent()).toEqual(['06 00 40 00 80 80']);
  });

  it('ignores invalid commands and other API versions', async () => {
    const {engine, transport} = await setup();
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    engine.handleCommand({
      v: ENGINE_API_VERSION,
      type: 'setTrackPower',
      on: 'yes',
    });
    engine.handleCommand({v: 999, type: 'emergencyStop'});
    engine.handleCommand({
      v: ENGINE_API_VERSION,
      type: 'switchAccessory',
      fAdr: 2048,
      output: 0,
    });
    engine.handleCommand('not a command');

    expect(transport().takeSent()).toEqual([]);
    expect(error).toHaveBeenCalledTimes(4);
    error.mockRestore();
  });

  it('broadcasts to every window, and stops after close', async () => {
    const {engine, transport, window} = await setup();
    const second = fakePort();
    engine.attachPort(second.port);
    second.close();

    transport().receive('07 00 40 00 81 00 81');

    expect(window.ofType('trackStatus')).toMatchObject([
      {status: 'emergencyStop'},
    ]);
    expect(second.ofType('trackStatus')).toEqual([]);
  });
});

describe('accessories', () => {
  it('switches through the queue: activate, pulse, deactivate, gap', async () => {
    const {transport, window} = await setup();
    window.send({type: 'switchAccessory', fAdr: 4, output: 1});
    window.send({type: 'switchAccessory', fAdr: 2, output: 0});

    expect(transport().takeSent()).toEqual(['09 00 40 00 53 00 04 89 DE']);
    vi.advanceTimersByTime(PULSE);
    expect(transport().takeSent()).toEqual(['09 00 40 00 53 00 04 81 D6']);
    vi.advanceTimersByTime(GAP);
    expect(transport().takeSent()).toEqual(['09 00 40 00 53 00 02 88 D9']);
  });

  it('shows a command as commanded, then follows the central unit (ARC-2)', async () => {
    const {transport, window} = await setup();
    window.send({type: 'switchAccessory', fAdr: 4, output: 1});
    transport().receive('09 00 40 00 43 00 04 02 45'); // FAdr 4, output 2

    expect(window.ofType('accessory').map((event) => event.state)).toEqual([
      {
        fAdr: 4,
        reported: 'unknown',
        commanded: 1,
        updatedAt: expect.any(Number),
      },
      {
        fAdr: 4,
        reported: 'output2',
        commanded: null,
        updatedAt: expect.any(Number),
      },
    ]);
  });

  it('follows changes made by other clients (MULTI-1)', async () => {
    const {transport, window} = await setup();
    transport().receive('09 00 40 00 43 00 07 01 45'); // FAdr 7, output 1
    expect(window.ofType('accessory')).toMatchObject([
      {state: {fAdr: 7, reported: 'output1', commanded: null}},
    ]);
  });

  it('after a reconnect, forgets positions and asks again, one at a time (LOAD-3)', async () => {
    const {transport, transports, window} = await setup();
    window.send({type: 'queryAccessory', fAdr: 0});
    window.send({type: 'queryAccessory', fAdr: 1});
    vi.advanceTimersByTime(1000);
    transport().receive('09 00 40 00 43 00 00 01 42');

    vi.advanceTimersByTime(CONNECTION_LOST_AFTER_MS + 5000);
    expect(window.ofType('snapshot').at(-1)?.snapshot.accessories).toEqual([]);

    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    transports[1].receive(STATUS_NORMAL);
    const first = transports[1]
      .takeSent()
      .filter((hex) => hex.startsWith('08 00 40 00 43'));
    expect(first).toEqual(['08 00 40 00 43 00 00 43']);
    vi.advanceTimersByTime(GAP);
    expect(transports[1].takeSent()).toContain('08 00 40 00 43 00 01 42');
  });

  it('refuses extended accessories on firmware older than 1.40 (REU-5)', async () => {
    const {transport, window} = await setup();
    transport().receive(HWINFO_FW_133);
    transport().takeSent();
    window.send({type: 'setExtAccessory', rawAddress: 4, value: 5});

    expect(transport().takeSent()).toEqual([]);
    expect(window.ofType('notice')).toMatchObject([
      {notice: {code: 'extAccessoryUnsupported'}},
    ]);
  });

  it('sends extended accessories when the firmware supports them', async () => {
    const {transport, window} = await setup();
    transport().receive('0C 00 1A 00 01 02 00 00 43 01 00 00');
    transport().takeSent();
    window.send({type: 'setExtAccessory', rawAddress: 4, value: 5});
    expect(transport().takeSent()).toEqual(['0A 00 40 00 54 00 04 05 00 55']);
  });
});

describe('feedback', () => {
  it('subscribes to the chosen sources and asks their status through the queue', async () => {
    const {transport, window} = await setup();
    window.send({type: 'setFeedbackSources', sources: ['rbus']});

    expect(transport().takeSent()).toEqual([
      '08 00 50 00 03 00 00 00',
      '05 00 81 00 00',
    ]);
    vi.advanceTimersByTime(GAP);
    expect(transport().takeSent()).toEqual(['05 00 81 00 01']);
  });

  it('reports only changed inputs', async () => {
    const {transport, window} = await setup();
    window.send({type: 'setFeedbackSources', sources: ['loconet']});
    transport().receive('08 00 A4 00 01 05 00 01');
    transport().receive('08 00 A4 00 01 05 00 01');

    expect(window.ofType('feedback')).toMatchObject([
      {changes: [{key: 'loconet:5', occupied: true}]},
    ]);
  });
});

describe('position refresh (positionRefreshMs)', () => {
  const GET_INFO_5 = '08 00 40 00 43 00 04 47';
  const layout = (positionRefreshMs: number) => {
    const project = projectWith(
      turnout('T', [3, 0], {
        control: {kind: 'dcc', addresses: [5], invert: false},
      }),
    );
    return {
      ...project,
      settings: {
        ...project.settings,
        centralUnit: {...project.settings.centralUnit, positionRefreshMs},
      },
    };
  };
  const started = async (positionRefreshMs: number) => {
    const context = await setup();
    context.engine.loadLayout(layout(positionRefreshMs));
    context.window.send({type: 'showView', viewId: 'v'});
    // Start-up query and the first refresh for the shown view.
    await vi.advanceTimersByTimeAsync(1000);
    context.transport().takeSent();
    return context;
  };

  it('given it is off (default), nothing is asked again', async () => {
    const {transport} = await started(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(transport().takeSent()).not.toContain(GET_INFO_5);
  });

  it('given 10 s, the turnouts on screen are asked for every 10 s', async () => {
    const {transport} = await started(10000);
    await vi.advanceTimersByTimeAsync(10000);
    expect(transport().takeSent()).toContain(GET_INFO_5);
    await vi.advanceTimersByTimeAsync(5000);
    expect(transport().takeSent()).not.toContain(GET_INFO_5);
    await vi.advanceTimersByTimeAsync(5000);
    expect(transport().takeSent()).toContain(GET_INFO_5);
  });

  it('given a round more than 3 s old, an operator action asks again at once, after its own command', async () => {
    const {transport, window} = await started(60000);
    await vi.advanceTimersByTimeAsync(4000);
    transport().takeSent();
    window.send({type: 'switchAccessory', fAdr: 2, output: 0});
    await vi.advanceTimersByTimeAsync(1000);
    const sent = transport().takeSent();
    const thrown = sent.indexOf('09 00 40 00 53 00 02 88 D9');
    expect(thrown).toBeGreaterThanOrEqual(0);
    expect(sent.indexOf(GET_INFO_5)).toBeGreaterThan(thrown);
  });

  it('given no window shows the station, its turnouts are not asked for', async () => {
    const {transport, window} = await started(10000);
    window.send({type: 'showView', viewId: null});
    await vi.advanceTimersByTimeAsync(30000);
    expect(transport().takeSent()).not.toContain(GET_INFO_5);
  });
});
