// The engine over real UDP against the test-only fake Z21
// (scripts/fake-z21.mjs), which, unlike Z21Sim, emulates feedback.
import dgram from 'node:dgram';
import {fromHex} from '@lever/z21-protocol';
import {afterEach, describe, expect, it} from 'vitest';
import {createFakeZ21, FakeZ21} from '../../../scripts/fake-z21.mjs';
import {ConnectionManager} from '../../connection/ConnectionManager';
import {NodeUdpTransport} from '../../connection/nodeUdpTransport';
import {
  ENGINE_API_VERSION,
  EngineEvent,
  EngineReport,
} from '../../shared/engineApi';
import {FeedbackInputState} from '../../shared/feedback';
import {Engine} from '../Engine';

const GAP_MS = 20;
const PULSE_MS = 30;

let fake: FakeZ21 | undefined;
let engine: Engine | undefined;

afterEach(async () => {
  engine?.shutdown();
  await fake?.close();
  engine = undefined;
  fake = undefined;
});

const waitFor = async (condition: () => boolean, what: string) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 3000) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const start = async (firmware = '1.33') => {
  fake = await createFakeZ21({port: 0, firmware});
  const connection = new ConnectionManager({
    createTransport: () => new NodeUdpTransport(),
  });
  const reports: EngineReport[] = [];
  engine = new Engine(connection, {
    accessoryGapMs: GAP_MS,
    defaultPulseMs: PULSE_MS,
    report: (report) => reports.push(report),
  });
  const events: EngineEvent[] = [];
  engine.attachPort({
    postMessage: (message) => events.push(message as EngineEvent),
    onMessage: () => undefined,
    onClose: () => undefined,
  });
  engine.connect('127.0.0.1', fake.port);
  await waitFor(() => connection.getState() === 'connected', 'connection');
  const send = (command: Record<string, unknown>) =>
    engine?.handleCommand({v: ENGINE_API_VERSION, ...command});
  const inputs = () => {
    const latest = new Map<string, FeedbackInputState>();
    for (const event of events) {
      if (event.type === 'feedback') {
        event.changes.forEach((change) => latest.set(change.key, change));
      }
    }
    return latest;
  };
  return {fake, connection, events, reports, send, inputs};
};

describe('the fake Z21 itself', () => {
  it('records a Q=0 activate while another output is still active', async () => {
    fake = await createFakeZ21({port: 0});
    const socket = dgram.createSocket('udp4');
    await new Promise<void>((resolve) =>
      socket.connect(fake!.port, '127.0.0.1', resolve),
    );
    // Activate turnout #5 output 2, then #3 output 1, without deactivate.
    socket.send(fromHex('09 00 40 00 53 00 04 89 DE'));
    socket.send(fromHex('09 00 40 00 53 00 02 88 D9'));
    await waitFor(() => fake!.violations.length === 1, 'violation');
    socket.close();
  });
});

describe('engine against the fake Z21', () => {
  it('reports feedback from R-Bus, LocoNet and CAN detectors', async () => {
    const {fake, send, inputs} = await start();
    fake.setLocoNetOccupancy(5, true); // known before Lever subscribes
    send({type: 'setFeedbackSources', sources: ['rbus', 'loconet', 'can']});

    // Startup queries answered (LOAD-3).
    await waitFor(
      () => inputs().get('loconet:5')?.occupied === true,
      'LocoNet status',
    );
    await waitFor(() => inputs().has('rbus:20:8'), 'R-Bus group 1 status');

    fake.setRbusInput(3, 2, true);
    fake.setCanOccupancy(1, 4, true, {networkId: 0x1234});
    fake.setCanLocos(1, 4, [{address: 3, forward: true}]);
    await waitFor(() => inputs().get('rbus:3:2')?.occupied === true, 'R-Bus');
    await waitFor(() => inputs().get('can:1:4')?.locos.length === 1, 'CAN');

    expect(inputs().get('can:1:4')).toMatchObject({
      occupied: true,
      networkId: 0x1234,
      locos: [{address: 3, forward: true}],
    });

    fake.setRbusInput(3, 2, false);
    await waitFor(
      () => inputs().get('rbus:3:2')?.occupied === false,
      'release',
    );
  });

  it('subscribes only to the chosen sources (LOAD-1)', async () => {
    const {fake, send, inputs} = await start();
    send({type: 'setFeedbackSources', sources: ['loconet']});
    await new Promise((resolve) => setTimeout(resolve, 100));
    fake.setRbusInput(1, 1, true);
    fake.setLocoNetOccupancy(9, true);
    await waitFor(() => inputs().has('loconet:9'), 'LocoNet');
    expect([...inputs().keys()].some((key) => key.startsWith('rbus'))).toBe(
      false,
    );
  });

  it('never has two outputs active when many turnouts are thrown at once (LOAD-2)', async () => {
    const {fake, send, events} = await start();
    for (let fAdr = 0; fAdr < 6; fAdr++) {
      send({type: 'switchAccessory', fAdr, output: fAdr % 2});
    }
    await waitFor(
      () =>
        events.filter(
          (event) =>
            event.type === 'accessory' && event.state.reported !== 'unknown',
        ).length === 6,
      'six turnout reports',
    );
    expect(fake.violations).toEqual([]);
  });

  it('follows turnouts switched elsewhere (MULTI-1)', async () => {
    const {fake, events} = await start();
    fake.setTurnout(9, 1);
    await waitFor(
      () =>
        events.some(
          (event) =>
            event.type === 'accessory' &&
            event.state.fAdr === 9 &&
            event.state.reported === 'output2',
        ),
      'turnout report',
    );
  });

  it('sends no extended accessory command on FW 1.33 (REU-5)', async () => {
    const {fake, send, events, connection} = await start('1.33');
    await waitFor(
      () => connection.getDeviceInfo().firmwareVersion === '1.33',
      'firmware',
    );
    send({type: 'setExtAccessory', rawAddress: 4, value: 5});
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(events.some((event) => event.type === 'notice')).toBe(true);
    expect(fake.received.some((item) => item.data.startsWith('54'))).toBe(
      false,
    );
  });

  it('shows a short circuit, not "power off", after the z21 start sequence', async () => {
    const {fake, connection} = await start();
    fake.setTrackPower(true);
    await waitFor(() => connection.getTrackStatus() === 'normal', 'power on');
    fake.shortCircuit();
    await waitFor(
      () => connection.getTrackStatus() === 'shortCircuit',
      'short circuit',
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(connection.getTrackStatus()).toBe('shortCircuit');
  });
});

describe('operating a layout (Level 1) against the fake Z21', () => {
  const project = {
    format: 'lever-project',
    schemaVersion: 1,
    id: 'p',
    name: 'Test',
    settings: {
      centralUnit: {accessoryGapMs: 20, pulseMs: 30, feedbackSources: ['rbus']},
      blockReleaseDelayMs: 50,
    },
    views: [
      {
        id: 'v',
        name: 'Station',
        areaId: 'a',
        elements: [
          {
            kind: 'track',
            id: 't1',
            points: [
              {x: 0, y: 0},
              {x: 3, y: 0},
            ],
            blockId: 'B1',
          },
          {
            kind: 'turnout',
            id: 'W1',
            type: 'right',
            at: {x: 4, y: 0},
            orientation: 'E',
            control: {kind: 'dcc', addresses: [5], invert: false},
          },
          {
            kind: 'turnout',
            id: 'M1',
            type: 'left',
            at: {x: 10, y: 0},
            orientation: 'E',
          },
        ],
      },
    ],
    areas: [{id: 'a', name: 'Station', level: 1}],
    blocks: [
      {
        id: 'B1',
        name: 'Track 1',
        inputs: [{source: 'rbus', module: 2, input: 3}],
      },
    ],
  };

  it('throws a turnout, records a manual one and shows occupancy', async () => {
    const {fake, send, events, connection} = await start();
    engine!.loadLayout(project);
    const layout = () => engine!.snapshot().layout;
    await waitFor(
      () => layout().turnouts['W1']?.status === 'reported',
      'start-up report',
    );

    send({type: 'setTurnout', elementId: 'W1', position: 'diverging'});
    await waitFor(
      () =>
        layout().turnouts['W1']?.status === 'confirmed' &&
        layout().turnouts['W1']?.position === 'diverging',
      'confirmed diverging',
    );

    // Another client throws it back.
    fake.setTurnout(4, 0);
    await waitFor(
      () => layout().turnouts['W1']?.position === 'straight',
      'followed',
    );

    send({type: 'setTurnout', elementId: 'M1', position: 'diverging'});
    expect(layout().turnouts['M1']).toEqual({
      position: 'diverging',
      status: 'manual',
    });

    fake.setRbusInput(2, 3, true);
    await waitFor(() => layout().blocks['B1']?.occupied === true, 'occupied');
    send({type: 'setTrainLabel', blockId: 'B1', label: 'IC 7'});
    expect(layout().blocks['B1'].label).toBe('IC 7');
    fake.setRbusInput(2, 3, false);
    await waitFor(
      () => layout().blocks['B1']?.occupied === false,
      'released after delay',
    );

    expect(events.some((event) => event.type === 'layout')).toBe(true);
    expect(connection.getState()).toBe('connected');
  });

  it('restores the last known positions and reports confirmed ones (ACC-4)', async () => {
    const {reports} = await start();
    engine!.loadLayout(project);
    const layout = () => engine!.snapshot().layout;
    // Given the z21 start reports a default for a never-switched turnout
    await waitFor(
      () => layout().turnouts['W1']?.status === 'reported',
      'start-up report',
    );
    // When main asks for the saved positions (and one for another project)
    engine!.restoreTurnouts('other', {W1: 'straight'});
    engine!.restoreTurnouts('p', {W1: 'diverging', M1: 'diverging'});
    // Then the turnout is switched and confirmed, the manual one untouched
    await waitFor(
      () =>
        layout().turnouts['W1']?.status === 'confirmed' &&
        layout().turnouts['W1']?.position === 'diverging',
      'restored',
    );
    expect(layout().turnouts['M1']?.status).toBe('unknown');
    // And main is told the confirmed position to save
    expect(reports).toContainEqual({
      type: 'turnoutPositions',
      projectId: 'p',
      positions: {W1: 'diverging'},
    });
  });
});
