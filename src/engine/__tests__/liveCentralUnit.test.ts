// Two complete engines against a REAL central unit or Z21Sim (MULTI-1,
// MULTI-5). Skipped unless LEVER_Z21_HOST is set:
//
//   $env:LEVER_Z21_HOST = '127.0.0.1'      # Z21Sim
//   $env:LEVER_Z21_SWITCH_FADR = '0'       # accessory to switch (turnout #1)
//   npx vitest run src/engine/__tests__/liveCentralUnit.test.ts
//
// It switches the one accessory to output 2 and back to output 1. Choose an
// address where that is harmless.
import {describe, expect, it} from 'vitest';
import {ConnectionManager} from '../../connection/ConnectionManager';
import {NodeUdpTransport} from '../../connection/nodeUdpTransport';
import {ENGINE_API_VERSION, EngineEvent} from '../../shared/engineApi';
import {Engine} from '../Engine';

const HOST = process.env['LEVER_Z21_HOST'];
const PORT = Number(process.env['LEVER_Z21_PORT'] ?? 21105);
const FADR = Number(process.env['LEVER_Z21_SWITCH_FADR'] ?? 0);
const TIMEOUT_MS = 3000;

const startInstance = () => {
  const connection = new ConnectionManager({
    createTransport: () => new NodeUdpTransport(),
  });
  const engine = new Engine(connection);
  const events: EngineEvent[] = [];
  engine.attachPort({
    postMessage: (message) => events.push(message as EngineEvent),
    onMessage: () => undefined,
    onClose: () => undefined,
  });
  engine.connect(HOST ?? '', PORT);
  const send = (command: Record<string, unknown>) =>
    engine.handleCommand({v: ENGINE_API_VERSION, ...command});
  const reported = () =>
    events
      .filter(
        (event): event is Extract<EngineEvent, {type: 'accessory'}> =>
          event.type === 'accessory' && event.state.fAdr === FADR,
      )
      .map((event) => event.state.reported)
      .filter((position) => position !== 'unknown');
  return {connection, engine, send, reported};
};

const waitFor = async (condition: () => boolean, what: string) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > TIMEOUT_MS) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

describe.skipIf(!HOST)(`two Lever instances against ${HOST}:${PORT}`, () => {
  it(
    'each instance sees accessory changes made by the other (MULTI-1)',
    async () => {
      const a = startInstance();
      const b = startInstance();
      try {
        await waitFor(
          () =>
            a.connection.getState() === 'connected' &&
            b.connection.getState() === 'connected',
          'both instances to connect',
        );

        a.send({type: 'switchAccessory', fAdr: FADR, output: 1});
        await waitFor(
          () => b.reported().at(-1) === 'output2',
          'instance B to see output 2 switched by A',
        );

        // Wait until A's pulse is over: a z21 start (FW 1.33) silently ignores
        // an activate for the same turnout while another client still holds
        // its other output active (docs/hardware-notes.md).
        await new Promise((resolve) => setTimeout(resolve, 500));
        b.send({type: 'switchAccessory', fAdr: FADR, output: 0});
        await waitFor(
          () => a.reported().at(-1) === 'output1',
          'instance A to see output 1 switched by B',
        );

        expect(a.reported().at(-1)).toBe('output1');
        expect(b.reported().at(-1)).toBe('output1');
      } finally {
        a.engine.shutdown();
        b.engine.shutdown();
      }
    },
    TIMEOUT_MS * 4,
  );
});
