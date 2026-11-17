// Types for scripts/fake-z21.mjs (test-only fake Z21), so TypeScript tests can
// start it directly.

export type FakeZ21Options = {
  host?: string;
  // 0 = any free port (see `port` on the result).
  port?: number;
  // Reported by LAN_GET_HWINFO / LAN_X_GET_FIRMWARE_VERSION. Default '1.33'
  // (the user's z21 start). Extended accessories need '1.40'+.
  firmware?: string;
  hardwareType?: number;
  // When LAN_X_TURNOUT_INFO is broadcast. Default 'activate' (as Z21Sim).
  turnoutInfoOn?: 'activate' | 'deactivate' | 'both';
  // Reply to unsupported X-Bus commands. Default 'unknown-command'.
  unsupported?: 'unknown-command' | 'silent';
  log?: (line: string) => void;
};

export type FakeZ21 = {
  port: number;
  clientCount(): number;
  // Every dataset received: client port, header, data as hex.
  received: {port: number; header: number; data: string}[];
  // Q=0 activates that arrived while another output was still active.
  violations: string[];
  setTrackPower(on: boolean): void;
  shortCircuit(): void;
  setTurnout(fAdr: number, output: 0 | 1): void;
  setRbusInput(module: number, input: number, occupied: boolean): void;
  setLocoNetOccupancy(address: number, occupied: boolean): void;
  setLocoNetTransponder(address: number, loco: number, enters: boolean): void;
  setCanOccupancy(
    module: number,
    port: number,
    occupied: boolean,
    options?: {networkId?: number; overload?: number},
  ): void;
  setCanLocos(
    module: number,
    port: number,
    locos: {address: number; forward?: boolean}[],
    options?: {networkId?: number},
  ): void;
  close(): Promise<void>;
};

export function createFakeZ21(options?: FakeZ21Options): Promise<FakeZ21>;
