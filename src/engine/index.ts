// Entry point of the engine utility process (STK-4). The main process starts
// it with utilityProcess.fork() and sends control messages over parentPort;
// each renderer gets its own MessagePort to the engine.
import {ConnectionManager} from '../connection/ConnectionManager';
import {NodeUdpTransport} from '../connection/nodeUdpTransport';
import {engineControlSchema} from '../shared/engineApi';
import {Engine, EnginePort} from './Engine';

// How long shutdown waits for the logoff datagram to leave the socket.
const SHUTDOWN_FLUSH_MS = 100;

const engine = new Engine(
  new ConnectionManager({createTransport: () => new NodeUdpTransport()}),
  {report: (report) => process.parentPort.postMessage(report)},
);

const wrapPort = (port: Electron.MessagePortMain): EnginePort => ({
  postMessage: (message) => port.postMessage(message),
  onMessage: (listener) => {
    port.on('message', (event) => listener(event.data));
  },
  onClose: (listener) => {
    port.on('close', listener);
  },
});

process.parentPort.on('message', (event) => {
  const parsed = engineControlSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error('Engine: invalid control message', parsed.error.message);
    return;
  }
  const control = parsed.data;
  switch (control.type) {
    case 'attachPort': {
      const port = event.ports[0];
      if (port) {
        engine.attachPort(wrapPort(port));
        port.start();
      }
      break;
    }
    case 'connect':
      engine.connect(control.host, control.port);
      break;
    case 'setProtocolLog':
      engine.setProtocolLog(control.enabled);
      break;
    case 'loadLayout':
      engine.loadLayout(control.project);
      break;
    case 'restoreTurnouts':
      engine.restoreTurnouts(control.projectId, control.positions);
      break;
    case 'shutdown':
      engine.shutdown();
      setTimeout(() => process.exit(0), SHUTDOWN_FLUSH_MS);
      break;
  }
});
