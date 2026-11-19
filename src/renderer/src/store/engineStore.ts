// Renderer copy of the engine's state (STK-9). The engine is the authority;
// this store only mirrors its events. Events are validated, because they
// cross a process boundary.
import {create} from 'zustand';
import {
  AccessoryStateValue,
  ConnectionStateValue,
  DeviceInfoValue,
  EngineCommandInput,
  engineEventSchema,
  EngineNotice,
  ExtAccessoryStateValue,
  ProtocolLogEntryValue,
  TrackStatusValue,
} from '../../../shared/engineApi';
import {FeedbackInputState, FeedbackSource} from '../../../shared/feedback';
import {
  emptyLayoutLive,
  LayoutLive,
  LayoutLiveChanges,
} from '../../../shared/liveState';

// The log view keeps this many entries; older ones are dropped.
export const PROTOCOL_LOG_LIMIT = 2000;
// Notices shown at once.
const NOTICE_LIMIT = 5;

type EngineState = {
  // False until the first snapshot arrives from the engine.
  ready: boolean;
  connection: {state: ConnectionStateValue; host: string; port: number};
  trackStatus: TrackStatusValue;
  deviceInfo: DeviceInfoValue;
  protocolLog: boolean;
  logEntries: ProtocolLogEntryValue[];
  // Keyed by FAdr / RawAddress / feedback input key.
  accessories: Record<number, AccessoryStateValue>;
  extAccessories: Record<number, ExtAccessoryStateValue>;
  feedbackSources: FeedbackSource[];
  feedbackInputs: Record<string, FeedbackInputState>;
  accessoryQueueLength: number;
  // Live state of the open layout (turnouts, signals, blocks, accessories).
  layout: LayoutLive;
  notices: EngineNotice[];
  clearLog: () => void;
  dismissNotice: (time: number) => void;
};

export const useEngineStore = create<EngineState>()((set) => ({
  ready: false,
  connection: {state: 'disconnected', host: '', port: 0},
  trackStatus: 'unknown',
  deviceInfo: {},
  protocolLog: false,
  logEntries: [],
  accessories: {},
  extAccessories: {},
  feedbackSources: [],
  feedbackInputs: {},
  accessoryQueueLength: 0,
  layout: emptyLayoutLive(),
  notices: [],
  clearLog: () => set({logEntries: []}),
  dismissNotice: (time) =>
    set((state) => ({
      notices: state.notices.filter((notice) => notice.time !== time),
    })),
}));

export const sendCommand = (command: EngineCommandInput): void => {
  window.lever.engine.send(command);
};

const byKey = <T, K extends string | number>(
  items: T[],
  key: (item: T) => K,
): Record<K, T> =>
  Object.fromEntries(items.map((item) => [key(item), item])) as Record<K, T>;

const handleEvent = (data: unknown): void => {
  const parsed = engineEventSchema.safeParse(data);
  if (!parsed.success) {
    console.error('Invalid engine event', parsed.error.message);
    return;
  }
  const event = parsed.data;
  switch (event.type) {
    case 'snapshot': {
      const {snapshot} = event;
      useEngineStore.setState({
        ready: true,
        connection: snapshot.connection,
        trackStatus: snapshot.trackStatus,
        deviceInfo: snapshot.deviceInfo,
        protocolLog: snapshot.protocolLog,
        accessories: byKey(snapshot.accessories, (state) => state.fAdr),
        extAccessories: byKey(
          snapshot.extAccessories,
          (state) => state.rawAddress,
        ),
        feedbackSources: snapshot.feedbackSources,
        feedbackInputs: byKey(snapshot.feedbackInputs, (state) => state.key),
        accessoryQueueLength: snapshot.accessoryQueueLength,
        layout: snapshot.layout,
      });
      break;
    }
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
    case 'accessory':
      useEngineStore.setState((state) => ({
        accessories: {...state.accessories, [event.state.fAdr]: event.state},
      }));
      break;
    case 'extAccessory':
      useEngineStore.setState((state) => ({
        extAccessories: {
          ...state.extAccessories,
          [event.state.rawAddress]: event.state,
        },
      }));
      break;
    case 'feedback':
      useEngineStore.setState((state) => ({
        feedbackInputs: {
          ...state.feedbackInputs,
          ...byKey(event.changes, (change) => change.key),
        },
      }));
      break;
    case 'accessoryQueue':
      useEngineStore.setState({accessoryQueueLength: event.length});
      break;
    case 'layout':
      useEngineStore.setState((state) => ({
        layout: mergeLayout(state.layout, event.changes),
      }));
      break;
    case 'notice':
      useEngineStore.setState((state) => ({
        notices: [...state.notices, event.notice].slice(-NOTICE_LIMIT),
      }));
      break;
  }
};

// Applies changed elements and blocks. Unchanged parts keep their identity,
// so only the changed shapes re-render.
const mergeLayout = (
  layout: LayoutLive,
  changes: LayoutLiveChanges,
): LayoutLive => ({
  turnouts: changes.turnouts
    ? {...layout.turnouts, ...changes.turnouts}
    : layout.turnouts,
  signals: changes.signals
    ? {...layout.signals, ...changes.signals}
    : layout.signals,
  accessories: changes.accessories
    ? {...layout.accessories, ...changes.accessories}
    : layout.accessories,
  blocks: changes.blocks
    ? {...layout.blocks, ...changes.blocks}
    : layout.blocks,
  // Routes always come complete.
  routes: changes.routes ?? layout.routes,
});

// Connects the store to the engine. Call once at start-up.
export const bindEngineStore = (): (() => void) =>
  window.lever.engine.subscribe(handleEvent);
