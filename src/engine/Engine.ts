// The engine: owns the connection to the central unit and (from Phase 3) the
// interlocking state. Runs in an Electron utilityProcess (STK-4), but has no
// Electron imports itself: ports are plain message endpoints, so it can be
// tested in Node.
import {ConnectionManager} from '../connection/ConnectionManager';
import {
  ENGINE_API_VERSION,
  EngineCommand,
  engineCommandSchema,
  EngineEventInput,
  EngineSnapshot,
} from '../shared/engineApi';

// The part of a MessagePort the engine uses.
export type EnginePort = {
  postMessage(message: unknown): void;
  onMessage(listener: (data: unknown) => void): void;
  onClose(listener: () => void): void;
};

export class Engine {
  private readonly ports = new Set<EnginePort>();
  private protocolLog = false;

  constructor(private readonly connection: ConnectionManager) {
    connection.on('state', (state) => {
      this.broadcast({type: 'connection', state, ...connection.getAddress()});
    });
    connection.on('trackStatus', (status) => {
      this.broadcast({type: 'trackStatus', status});
    });
    connection.on('deviceInfo', (deviceInfo) => {
      this.broadcast({type: 'deviceInfo', deviceInfo});
    });
    connection.on('log', (entry) => {
      this.broadcast({type: 'log', entry});
    });
  }

  attachPort(port: EnginePort): void {
    this.ports.add(port);
    port.onMessage((data) => {
      this.handleCommand(data);
    });
    port.onClose(() => {
      this.ports.delete(port);
    });
    this.post(port, {type: 'snapshot', snapshot: this.snapshot()});
  }

  connect(host: string, port: number): void {
    this.connection.connect(host, port);
  }

  setProtocolLog(enabled: boolean): void {
    this.protocolLog = enabled;
    this.connection.setLogging(enabled);
    this.broadcast({type: 'snapshot', snapshot: this.snapshot()});
  }

  // Logs off cleanly (§2.2).
  shutdown(): void {
    this.connection.disconnect();
  }

  snapshot(): EngineSnapshot {
    return {
      connection: {
        state: this.connection.getState(),
        ...this.connection.getAddress(),
      },
      trackStatus: this.connection.getTrackStatus(),
      deviceInfo: this.connection.getDeviceInfo(),
      protocolLog: this.protocolLog,
    };
  }

  handleCommand(data: unknown): void {
    const parsed = engineCommandSchema.safeParse(data);
    if (!parsed.success) {
      console.error('Engine: invalid command', parsed.error.message);
      return;
    }
    const command: EngineCommand = parsed.data;
    switch (command.type) {
      case 'emergencyStop':
        this.connection.emergencyStop();
        break;
      case 'setTrackPower':
        this.connection.setTrackPower(command.on);
        break;
      case 'setProtocolLog':
        this.setProtocolLog(command.enabled);
        break;
    }
  }

  private broadcast(event: EngineEventInput): void {
    for (const port of this.ports) {
      this.post(port, event);
    }
  }

  private post(port: EnginePort, event: EngineEventInput): void {
    try {
      port.postMessage({v: ENGINE_API_VERSION, ...event});
    } catch (error) {
      // A closed window's port; it is removed on close.
      console.error('Engine: could not post to port', error);
    }
  }
}
