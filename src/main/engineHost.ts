// Starts the engine utility process and brokers a MessagePort between it and
// each window (STK-4). If the engine exits unexpectedly it is restarted and
// every window gets a new port, so STOP keeps working (CON-6).
import {
  MessageChannelMain,
  utilityProcess,
  UtilityProcess,
  WebContents,
} from 'electron';
import enginePath from '../engine/index?modulePath';
import {EngineControl} from '../shared/engineApi';

// Time the engine gets to log off before it is killed on quit.
const SHUTDOWN_TIMEOUT_MS = 1000;
// Wait before restarting a crashed engine, so a crash loop cannot spin.
const RESTART_DELAY_MS = 500;

export class EngineHost {
  private child: UtilityProcess | null = null;
  private readonly clients = new Set<WebContents>();
  private quitting = false;
  private connectTarget: {host: string; port: number} | null = null;
  private protocolLog = false;
  private layout: Omit<
    Extract<EngineControl, {type: 'configureLayout'}>,
    'type'
  > | null = null;

  start(): void {
    const child = utilityProcess.fork(enginePath, [], {
      serviceName: 'Lever engine',
    });
    this.child = child;
    child.on('exit', (code) => {
      if (this.child !== child) {
        return;
      }
      this.child = null;
      if (!this.quitting) {
        console.error(`Engine exited with code ${code}; restarting`);
        setTimeout(() => this.restart(), RESTART_DELAY_MS);
      }
    });
  }

  setProtocolLog(enabled: boolean): void {
    this.protocolLog = enabled;
    this.send({type: 'setProtocolLog', enabled});
  }

  // Applies the open project's central-unit settings; re-sent after an
  // engine restart.
  configureLayout(
    layout: Omit<Extract<EngineControl, {type: 'configureLayout'}>, 'type'>,
  ): void {
    this.layout = layout;
    this.send({type: 'configureLayout', ...layout});
  }

  // Connects (or reconnects) the engine to the central unit.
  connect(host: string, port: number): void {
    this.connectTarget = {host, port};
    this.send({type: 'connect', host, port});
  }

  // Gives a window its own port to the engine. Called when the window's
  // preload asks for one, and again for every window after a restart.
  attach(webContents: WebContents): void {
    if (!this.child) {
      return;
    }
    if (!this.clients.has(webContents)) {
      this.clients.add(webContents);
      webContents.once('destroyed', () => this.clients.delete(webContents));
    }
    const {port1, port2} = new MessageChannelMain();
    this.child.postMessage({type: 'attachPort'} satisfies EngineControl, [
      port1,
    ]);
    webContents.postMessage('engine-port', null, [port2]);
  }

  // Lets the engine log off, then stops it.
  async stop(): Promise<void> {
    this.quitting = true;
    const child = this.child;
    if (!child) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, SHUTDOWN_TIMEOUT_MS);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.postMessage({type: 'shutdown'} satisfies EngineControl);
    });
    this.child = null;
  }

  private restart(): void {
    this.start();
    this.send({type: 'setProtocolLog', enabled: this.protocolLog});
    if (this.layout) {
      this.send({type: 'configureLayout', ...this.layout});
    }
    if (this.connectTarget) {
      this.send({type: 'connect', ...this.connectTarget});
    }
    for (const webContents of this.clients) {
      if (!webContents.isDestroyed()) {
        this.attach(webContents);
      }
    }
  }

  private send(control: EngineControl): void {
    this.child?.postMessage(control);
  }
}
