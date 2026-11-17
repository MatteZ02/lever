// Adapted from Throttle's udpIntegration test (see ../COPIED_FROM.md).
import dgram from 'node:dgram';
import {fromHex, splitDatagram, toHex} from '@lever/z21-protocol';
import {describe, expect, it} from 'vitest';
import {ConnectionManager, ConnectionState} from '../ConnectionManager';
import {NodeUdpTransport} from '../nodeUdpTransport';
import {TrackStatus} from '../trackStatus';

// A very small fake Z21 on localhost: answers status and HWINFO requests,
// answers track power on with a combined datagram, and records every dataset
// it receives together with the sender's port.
const startFakeZ21 = async () => {
  const server = dgram.createSocket('udp4');
  const received: string[] = [];
  const clientPorts = new Set<number>();

  server.on('message', (message, remote) => {
    clientPorts.add(remote.port);
    const reply = (hex: string) => {
      server.send(fromHex(hex), remote.port, remote.address);
    };
    for (const {header, data} of splitDatagram(new Uint8Array(message))
      .datasets) {
      received.push(`${header.toString(16)}:${toHex(data)}`);
      const body = toHex(data);
      if (header === 0x40 && body === '21 24 05') {
        reply('08 00 40 00 62 22 00 40');
      } else if (header === 0x1a) {
        reply('0C 00 1A 00 04 02 00 00 43 01 00 00');
      } else if (header === 0x40 && body === '21 81 A0') {
        // Two datasets in one datagram: power on, then a stop broadcast.
        reply('07 00 40 00 61 01 60' + '07 00 40 00 81 00 81');
      }
    }
  });

  await new Promise<void>((resolve) => server.bind(0, '127.0.0.1', resolve));
  const {port} = server.address();
  return {port, received, clientPorts, close: () => server.close()};
};

const waitFor = async (condition: () => boolean, timeoutMs = 2000) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('ConnectionManager over real UDP', () => {
  it('connects, receives combined datasets and logs off', async () => {
    const z21 = await startFakeZ21();
    const manager = new ConnectionManager({
      createTransport: () => new NodeUdpTransport(),
    });
    const states: ConnectionState[] = [];
    const trackStatuses: TrackStatus[] = [];
    manager.on('state', (state) => states.push(state));
    manager.on('trackStatus', (status) => trackStatuses.push(status));

    try {
      manager.connect('127.0.0.1', z21.port);
      await waitFor(() => manager.getState() === 'connected');
      await waitFor(() => manager.getDeviceInfo().firmwareVersion === '1.43');

      manager.setTrackPower(true);
      await waitFor(() => trackStatuses.includes('emergencyStop'));

      manager.disconnect();
      await waitFor(() => z21.received.includes('30:'));

      expect(states).toEqual(['connecting', 'connected', 'disconnected']);
      expect(z21.received.slice(0, 2)).toEqual([
        '50:01 00 00 00',
        '40:21 24 05',
      ]);
    } finally {
      manager.dispose();
      z21.close();
    }
  });

  it('gives two managers on one PC separate local ports (MULTI-5)', async () => {
    const z21 = await startFakeZ21();
    const managers = [0, 1].map(
      () =>
        new ConnectionManager({createTransport: () => new NodeUdpTransport()}),
    );
    try {
      managers.forEach((manager) => manager.connect('127.0.0.1', z21.port));
      await waitFor(() =>
        managers.every((manager) => manager.getState() === 'connected'),
      );
      expect(z21.clientPorts.size).toBe(2);
    } finally {
      managers.forEach((manager) => manager.dispose());
      z21.close();
    }
  });
});
