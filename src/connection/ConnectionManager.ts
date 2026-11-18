// Adapted from Throttle's src/connection/ConnectionManager.ts (see
// COPIED_FROM.md). Loco driving and subscriptions were removed; Lever adds the
// accessory queue in Phase 1.
import {
  BroadcastFlag,
  decodeDatagram,
  lanGetBroadcastFlags,
  lanGetCode,
  lanGetHwInfo,
  lanGetSerialNumber,
  lanLogoff,
  lanSetBroadcastFlags,
  lanSystemStateGetData,
  lanXGetFirmwareVersion,
  lanXGetStatus,
  lanXSetStop,
  lanXSetTrackPowerOff,
  lanXSetTrackPowerOn,
  packDatagrams,
  SystemState,
  toHex,
  Z21_DEFAULT_PORT,
  Z21Message,
} from '@lever/z21-protocol';
import {Listener, TypedEmitter} from './emitter';
import {nextTrackStatus, TrackStatus} from './trackStatus';
import {UdpTransport} from './transport';

// No reply within this time after connecting: try again.
export const CONNECT_TIMEOUT_MS = 3000;
// Waiting for the current broadcast flags at login; without an answer Lever
// sets only its own.
export const FLAGS_REPLY_TIMEOUT_MS = 1000;
// LAN_GET_HWINFO unanswered after this time: fall back to
// LAN_X_GET_FIRMWARE_VERSION.
export const DEVICE_INFO_TIMEOUT_MS = 2000;
// The Z21 drops clients after 60 s of silence (§1.1). Send LAN_X_GET_STATUS
// when nothing has been sent, or nothing received, for this long.
export const KEEPALIVE_IDLE_MS = 25000;
export const KEEPALIVE_CHECK_INTERVAL_MS = 5000;
// On a user action, the track status is asked again if the last request is
// at least this old. Some central units (the DR5000, FW 1.29) do not send
// track power, STOP or short-circuit changes made by other devices to Lever,
// so without this they would show up only with the next keepalive.
export const STATUS_REFRESH_MIN_AGE_MS = 2000;
// Nothing received for this long (one keepalive went unanswered): connection
// is lost.
export const CONNECTION_LOST_AFTER_MS = 35000;
// Delay before each reconnect attempt; the last value repeats.
export const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 20000, 30000];

export type ConnectionState =
  'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type DeviceInfo = {
  hardwareType?: number;
  firmwareVersion?: string;
  serialNumber?: number;
  // LAN_GET_CODE: 0 = no lock, 1 = z21 start locked, 2 = unlocked.
  lockCode?: number;
};

export type ProtocolLogEntry = {
  time: number;
  direction: 'out' | 'in' | 'info';
  text: string;
};

export type ConnectionEvents = {
  state: ConnectionState;
  trackStatus: TrackStatus;
  deviceInfo: DeviceInfo;
  systemState: SystemState;
  // Every decoded message, for the layers above (accessories, feedback).
  message: Z21Message;
  log: ProtocolLogEntry;
};

export type ConnectionOptions = {
  createTransport: () => UdpTransport;
  broadcastFlags?: number;
  // Pack several datasets into one UDP datagram (§1.3). Can be turned off if
  // a central unit turns out not to handle combined datasets.
  combineDatasets?: boolean;
};

// LOCO_INFO for all locos (§2.16). Never subscribed: it is not meant for
// clients like this one and would load the network shared with 10 Throttles.
const ALL_LOCOS_FLAG = 0x00010000;

const checkFlags = (flags: number): number => {
  if ((flags & ALL_LOCOS_FLAG) !== 0) {
    throw new Error('Broadcast flag 0x00010000 (all locos) is not allowed');
  }
  return flags >>> 0;
};

// Owns the single UDP socket to the central unit and everything that happens
// on it: connecting, keepalive, reconnecting and logoff.
export class ConnectionManager {
  private readonly events = new TypedEmitter<ConnectionEvents>();
  private readonly createTransport: () => UdpTransport;
  private broadcastFlags: number;
  // Flags other clients had set when Lever logged in. Some central units
  // (the DR5000) keep ONE set of flags for all clients, so Lever only ever
  // adds its own to these and never takes theirs away. On a Z21 (flags per
  // client) this is 0 and Lever's flags are simply its own.
  private othersFlags = 0;
  // Between login and the answer to LAN_GET_BROADCASTFLAGS.
  private awaitingFlags = false;
  private flagsTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly combineDatasets: boolean;

  private host = '';
  private port = Z21_DEFAULT_PORT;
  private wantConnected = false;
  private state: ConnectionState = 'disconnected';
  private transport: UdpTransport | null = null;
  // Incremented whenever a socket is abandoned, so late callbacks from it are
  // ignored.
  private generation = 0;
  private reconnectAttempt = 0;

  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private deviceInfoTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  private lastSentAt = 0;
  private lastReceivedAt = 0;
  private lastKeepaliveAt = 0;
  private lastStatusRequestAt = 0;

  private deviceInfo: DeviceInfo = {};
  private trackStatus: TrackStatus = 'unknown';
  private loggingEnabled = false;

  constructor(options: ConnectionOptions) {
    this.createTransport = options.createTransport;
    this.broadcastFlags = checkFlags(
      options.broadcastFlags ?? BroadcastFlag.BASIC,
    );
    this.combineDatasets = options.combineDatasets ?? true;
  }

  // Changes the broadcast flags, e.g. when the project's feedback sources
  // change (LOAD-1). Sent at once whenever a socket is open — also while
  // still connecting, because the login datagram may already have carried
  // the old flags — and again on every reconnect.
  setBroadcastFlags(flags: number): void {
    const checked = checkFlags(flags);
    if (checked === this.broadcastFlags) {
      return;
    }
    this.broadcastFlags = checked;
    // While the current flags are still being asked for, the answer sends
    // the new ones.
    if (!this.awaitingFlags) {
      this.sendNow([lanSetBroadcastFlags(this.flagsToSet())]);
    }
  }

  private flagsToSet(): number {
    return checkFlags((this.othersFlags | this.broadcastFlags) >>> 0);
  }

  getBroadcastFlags(): number {
    return this.broadcastFlags;
  }

  on<K extends keyof ConnectionEvents>(
    event: K,
    listener: Listener<ConnectionEvents[K]>,
  ): () => void {
    return this.events.on(event, listener);
  }

  getState(): ConnectionState {
    return this.state;
  }

  getTrackStatus(): TrackStatus {
    return this.trackStatus;
  }

  getDeviceInfo(): DeviceInfo {
    return this.deviceInfo;
  }

  getAddress(): {host: string; port: number} {
    return {host: this.host, port: this.port};
  }

  setLogging(enabled: boolean): void {
    this.loggingEnabled = enabled;
  }

  // Connects (or reconnects to a new address). Retries with backoff until
  // disconnect() is called.
  connect(host: string, port: number = Z21_DEFAULT_PORT): void {
    this.closeSocket(true);
    this.clearReconnectTimer();
    this.host = host;
    this.port = port;
    this.wantConnected = true;
    this.reconnectAttempt = 0;
    this.startSocket();
  }

  // Logs off and closes the socket.
  disconnect(): void {
    this.wantConnected = false;
    this.clearReconnectTimer();
    this.closeSocket(true);
    this.setState('disconnected');
  }

  // Stops everything; the manager cannot be used afterwards.
  dispose(): void {
    this.disconnect();
    this.events.removeAll();
  }

  // --- Commands -----------------------------------------------------------
  // STOP and track power are sent immediately and never queued (LOAD-2).

  setTrackPower(on: boolean): void {
    this.send([on ? lanXSetTrackPowerOn() : lanXSetTrackPowerOff()]);
  }

  // Global emergency stop: all locos stop, track power stays on.
  emergencyStop(): void {
    this.send([lanXSetStop()]);
  }

  requestStatus(): void {
    this.lastStatusRequestAt = Date.now();
    this.send([lanXGetStatus()]);
  }

  // Asks for the track status if the last request is older than
  // STATUS_REFRESH_MIN_AGE_MS (called on user actions). Not a polling loop:
  // at most one request per action, and none while actions come quickly.
  refreshStatusIfStale(): void {
    if (
      this.state === 'connected' &&
      Date.now() - this.lastStatusRequestAt >= STATUS_REFRESH_MIN_AGE_MS
    ) {
      this.requestStatus();
    }
  }

  requestSystemState(): void {
    this.send([lanSystemStateGetData()]);
  }

  // Sends encoded datasets while connected. For the layers above (the
  // accessory queue); commands issued while offline are dropped.
  sendDatasets(datasets: Uint8Array[]): void {
    this.send(datasets);
  }

  // --- Connection lifecycle -------------------------------------------------

  private startSocket(): void {
    // openSocket handles its own errors; this only catches the unexpected.
    this.openSocket().catch((error: unknown) => {
      this.log('info', `Unexpected connection error: ${String(error)}`);
    });
  }

  private async openSocket(): Promise<void> {
    const generation = ++this.generation;
    this.setState(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    this.deviceInfo = {};
    this.log('info', `Connecting to ${this.host}:${this.port}`);

    const transport = this.createTransport();
    try {
      await transport.open(this.host, this.port, {
        onMessage: (data) => {
          if (generation === this.generation) {
            this.handleDatagram(data);
          }
        },
        onError: (message) => {
          if (generation === this.generation) {
            this.log('info', `Socket error: ${message}`);
          }
        },
      });
    } catch (error) {
      if (generation === this.generation) {
        this.log('info', `Could not open socket: ${String(error)}`);
        this.scheduleReconnect();
      }
      return;
    }

    if (generation !== this.generation) {
      transport.close();
      return;
    }
    this.transport = transport;
    // Login is implicit with the first command (§2.2). Flags must be set
    // again on every login (§2.16): first ask which flags are set, then add
    // Lever's to them (see othersFlags).
    this.lastStatusRequestAt = Date.now();
    this.othersFlags = 0;
    this.awaitingFlags = true;
    this.sendNow([lanGetBroadcastFlags(), lanXGetStatus()]);
    this.connectTimer = setTimeout(() => {
      this.log('info', 'No reply from central unit');
      this.closeSocket(false);
      this.scheduleReconnect();
    }, CONNECT_TIMEOUT_MS);
  }

  private onConnected(): void {
    this.clearTimer('connectTimer');
    // The central unit answers; if the flags request is not answered soon,
    // set Lever's own flags.
    if (this.awaitingFlags) {
      this.flagsTimer = setTimeout(() => {
        this.flagsTimer = null;
        if (this.awaitingFlags) {
          this.awaitingFlags = false;
          this.log('info', 'No reply to the broadcast flags request');
          this.sendNow([lanSetBroadcastFlags(this.flagsToSet())]);
        }
      }, FLAGS_REPLY_TIMEOUT_MS);
    }
    this.reconnectAttempt = 0;
    this.setState('connected');

    // Optional requests; the app works without the replies.
    this.sendNow([lanGetHwInfo(), lanGetCode(), lanGetSerialNumber()]);
    this.deviceInfoTimer = setTimeout(() => {
      if (this.deviceInfo.firmwareVersion === undefined) {
        this.sendNow([lanXGetFirmwareVersion()]);
      }
    }, DEVICE_INFO_TIMEOUT_MS);

    this.lastKeepaliveAt = Date.now();
    this.keepaliveTimer = setInterval(() => {
      this.checkKeepalive();
    }, KEEPALIVE_CHECK_INTERVAL_MS);
  }

  private checkKeepalive(): void {
    const now = Date.now();
    if (now - this.lastReceivedAt >= CONNECTION_LOST_AFTER_MS) {
      this.log('info', 'Connection lost');
      this.closeSocket(true);
      this.scheduleReconnect();
      return;
    }
    const sendIdle = now - this.lastSentAt >= KEEPALIVE_IDLE_MS;
    const receiveIdle =
      now - this.lastReceivedAt >= KEEPALIVE_IDLE_MS &&
      now - this.lastKeepaliveAt >= KEEPALIVE_IDLE_MS;
    if (sendIdle || receiveIdle) {
      this.lastKeepaliveAt = now;
      this.lastStatusRequestAt = now;
      this.sendNow([lanXGetStatus()]);
    }
  }

  private scheduleReconnect(): void {
    if (!this.wantConnected) {
      return;
    }
    const delay =
      RECONNECT_DELAYS_MS[
        Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)
      ];
    this.reconnectAttempt++;
    this.setState('reconnecting');
    this.log('info', `Retrying in ${delay / 1000} s`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.startSocket();
    }, delay);
  }

  private closeSocket(sendLogoff: boolean): void {
    this.generation++;
    this.clearTimer('connectTimer');
    this.clearTimer('deviceInfoTimer');
    this.clearTimer('flagsTimer');
    this.awaitingFlags = false;
    if (this.keepaliveTimer !== null) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }

    if (this.transport) {
      if (sendLogoff && this.state === 'connected') {
        this.sendNow([lanLogoff()]);
      }
      this.transport.close();
      this.transport = null;
    }
  }

  private clearReconnectTimer(): void {
    this.clearTimer('reconnectTimer');
  }

  private clearTimer(
    name: 'connectTimer' | 'deviceInfoTimer' | 'reconnectTimer' | 'flagsTimer',
  ): void {
    const timer = this[name];
    if (timer !== null) {
      clearTimeout(timer);
      this[name] = null;
    }
  }

  // --- Receiving ------------------------------------------------------------

  private handleDatagram(data: Uint8Array): void {
    this.lastReceivedAt = Date.now();
    const messages = decodeDatagram(data);
    if (this.loggingEnabled) {
      const types = messages.map((message) => message.type).join(', ');
      this.log('in', `${toHex(data)}  (${types})`);
    }
    if (this.state !== 'connected') {
      this.onConnected();
    }
    messages.forEach((message) => {
      this.handleMessage(message);
    });
  }

  private handleMessage(message: Z21Message): void {
    const trackStatus = nextTrackStatus(this.trackStatus, message);
    if (trackStatus !== undefined && trackStatus !== this.trackStatus) {
      this.trackStatus = trackStatus;
      this.events.emit('trackStatus', trackStatus);
    }

    switch (message.type) {
      case 'broadcastFlags':
        if (this.awaitingFlags) {
          this.awaitingFlags = false;
          this.clearTimer('flagsTimer');
          // Never the all-locos flag, also not on another client's behalf.
          this.othersFlags = (message.flags & ~ALL_LOCOS_FLAG) >>> 0;
          if (this.flagsToSet() !== message.flags >>> 0) {
            this.sendNow([lanSetBroadcastFlags(this.flagsToSet())]);
          }
        }
        break;
      case 'systemState':
        this.events.emit('systemState', message.systemState);
        break;
      case 'hwInfo':
        this.updateDeviceInfo({
          hardwareType: message.hardwareType,
          firmwareVersion: message.firmwareVersion,
        });
        break;
      case 'firmwareVersion':
        if (this.deviceInfo.firmwareVersion === undefined) {
          this.updateDeviceInfo({firmwareVersion: message.firmwareVersion});
        }
        break;
      case 'code':
        this.updateDeviceInfo({lockCode: message.code});
        break;
      case 'serialNumber':
        this.updateDeviceInfo({serialNumber: message.serialNumber});
        break;
    }
    this.events.emit('message', message);
  }

  private updateDeviceInfo(update: DeviceInfo): void {
    this.deviceInfo = {...this.deviceInfo, ...update};
    this.events.emit('deviceInfo', this.deviceInfo);
  }

  // --- Sending --------------------------------------------------------------

  // Sends only while connected; commands issued while offline are dropped,
  // because replaying stale commands later would be unsafe.
  private send(datasets: Uint8Array[]): void {
    if (this.state !== 'connected') {
      this.log('info', 'Not connected; command dropped');
      return;
    }
    this.sendNow(datasets);
  }

  private sendNow(datasets: Uint8Array[]): void {
    const transport = this.transport;
    if (!transport || datasets.length === 0) {
      return;
    }
    const datagrams = this.combineDatasets ? packDatagrams(datasets) : datasets;
    for (const datagram of datagrams) {
      transport.send(datagram);
      if (this.loggingEnabled) {
        this.log('out', toHex(datagram));
      }
    }
    this.lastSentAt = Date.now();
  }

  private setState(state: ConnectionState): void {
    if (state !== this.state) {
      this.state = state;
      if (state !== 'connected' && this.trackStatus !== 'unknown') {
        this.trackStatus = 'unknown';
        this.events.emit('trackStatus', 'unknown');
      }
      this.events.emit('state', state);
    }
  }

  private log(direction: ProtocolLogEntry['direction'], text: string): void {
    if (this.loggingEnabled) {
      this.events.emit('log', {time: Date.now(), direction, text});
    }
  }
}
