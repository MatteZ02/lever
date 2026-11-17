// Live state of accessory outputs: what Lever commanded and what the central
// unit reported (ARC-2). The display follows the report; a commanded but
// unconfirmed position is shown as such, and nothing is known until the
// central unit says so (ACC-2, MULTI-3). Pure; no timers.
import type {AccessoryOutput, TurnoutInfoPosition} from '@lever/z21-protocol';

export type AccessoryState = {
  fAdr: number;
  // As last reported by the central unit; 'unknown' until a report arrives.
  reported: TurnoutInfoPosition | 'unknown';
  // Set when this instance commands the output; cleared when a report
  // arrives (whatever it says).
  commanded: AccessoryOutput | null;
  updatedAt: number;
};

export type ExtAccessoryState = {
  rawAddress: number;
  // undefined until reported, or when the central unit reports "unknown".
  value: number | undefined;
  updatedAt: number;
};

const reportedOutput = (
  reported: AccessoryState['reported'],
): AccessoryOutput | undefined =>
  reported === 'output1' ? 0 : reported === 'output2' ? 1 : undefined;

// True while a command of this instance waits for confirmation.
export const isUnconfirmed = (state: AccessoryState): boolean =>
  state.commanded !== null &&
  reportedOutput(state.reported) !== state.commanded;

export class AccessoryStateStore {
  private readonly accessories = new Map<number, AccessoryState>();
  private readonly extAccessories = new Map<number, ExtAccessoryState>();

  all(): AccessoryState[] {
    return [...this.accessories.values()].sort((a, b) => a.fAdr - b.fAdr);
  }

  allExt(): ExtAccessoryState[] {
    return [...this.extAccessories.values()].sort(
      (a, b) => a.rawAddress - b.rawAddress,
    );
  }

  get(fAdr: number): AccessoryState | undefined {
    return this.accessories.get(fAdr);
  }

  // This instance sent a switch command.
  commanded(
    fAdr: number,
    output: AccessoryOutput,
    now: number,
  ): AccessoryState {
    const state: AccessoryState = {
      fAdr,
      reported: this.accessories.get(fAdr)?.reported ?? 'unknown',
      commanded: output,
      updatedAt: now,
    };
    this.accessories.set(fAdr, state);
    return state;
  }

  // LAN_X_TURNOUT_INFO arrived, as a reply or a broadcast caused by any
  // client. It is the authority (ARC-2).
  reported(
    fAdr: number,
    position: TurnoutInfoPosition,
    now: number,
  ): AccessoryState {
    const state: AccessoryState = {
      fAdr,
      reported: position,
      commanded: null,
      updatedAt: now,
    };
    this.accessories.set(fAdr, state);
    return state;
  }

  extReported(
    rawAddress: number,
    value: number,
    valid: boolean,
    now: number,
  ): ExtAccessoryState {
    const state: ExtAccessoryState = {
      rawAddress,
      value: valid ? value : undefined,
      updatedAt: now,
    };
    this.extAccessories.set(rawAddress, state);
    return state;
  }

  // Connection lost: nothing reported earlier can be trusted any more
  // (MULTI-3). Positions are asked again after reconnecting (LOAD-3).
  clear(): void {
    this.accessories.clear();
    this.extAccessories.clear();
  }
}
