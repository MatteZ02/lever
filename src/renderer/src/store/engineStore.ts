// Renderer copy of the engine's state (STK-9). The engine is the authority;
// this store only mirrors its events. Events are validated, because they
// cross a process boundary.
import {create} from 'zustand';
import {
  ConnectionStateValue,
  DeviceInfoValue,
  EngineCommandInput,
  engineEventSchema,
  ProtocolLogEntryValue,
  TrackStatusValue,
} from '../../../shared/engineApi';

// The log view keeps this many entries; older ones are dropped.
export const PROTOCOL_LOG_LIMIT = 2000;

type EngineState = {
  // False until the first snapshot arrives from the engine.
  ready: boolean;
  connection: {state: ConnectionStateValue; host: string; port: number};
  trackStatus: TrackStatusValue;
  deviceInfo: DeviceInfoValue;
  protocolLog: boolean;
  logEntries: ProtocolLogEntryValue[];
  clearLog: () => void;
};

export const useEngineStore = create<EngineState>()((set) => ({
  ready: false,
  connection: {state: 'disconnected', host: '', port: 0},
  trackStatus: 'unknown',
  deviceInfo: {},
  protocolLog: false,
  logEntries: [],
  clearLog: () => set({logEntries: []}),
}));

export const sendCommand = (command: EngineCommandInput): void => {
  window.lever.engine.send(command);
};

const handleEvent = (data: unknown): void => {
  const parsed = engineEventSchema.safeParse(data);
  if (!parsed.success) {
    console.error('Invalid engine event', parsed.error.message);
    return;
  }
  const event = parsed.data;
  switch (event.type) {
    case 'snapshot':
      useEngineStore.setState({
        ready: true,
        connection: event.snapshot.connection,
        trackStatus: event.snapshot.trackStatus,
        deviceInfo: event.snapshot.deviceInfo,
        protocolLog: event.snapshot.protocolLog,
      });
      break;
    case 'connection':
      useEngineStore.setState({
        connection: {state: event.state, host: event.host, port: event.port},
      });
      break;
    case 'trackStatus':
      useEngineStore.setState({trackStatus: event.status});
      break;
    case 'deviceInfo':
      useEngineStore.setState({deviceInfo: event.deviceInfo});
      break;
    case 'log':
      useEngineStore.setState((state) => ({
        logEntries: [...state.logEntries, event.entry].slice(
          -PROTOCOL_LOG_LIMIT,
        ),
      }));
      break;
  }
};

// Connects the store to the engine. Call once at start-up.
export const bindEngineStore = (): (() => void) =>
  window.lever.engine.subscribe(handleEvent);
