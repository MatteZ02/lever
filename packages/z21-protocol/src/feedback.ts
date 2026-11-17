// Feedback (occupancy) decoding: R-Bus (§7), LocoNet detectors (§9.5) and
// CAN detectors (§10.1). Added for Lever (see COPIED_FROM.md).

// --- R-Bus ------------------------------------------------------------------

// One LAN_RMBUS_DATACHANGED covers ten modules (group 0: modules 1-10,
// group 1: 11-20), one byte per module, one bit per input (input 1 = bit 0).
export const RBUS_MODULES_PER_GROUP = 10;
export const RBUS_INPUTS_PER_MODULE = 8;
export const RBUS_GROUPS = [0, 1] as const;

export type RBusInputState = {
  module: number; // 1..20
  input: number; // 1..8
  occupied: boolean;
};

// Expands one group's status bytes into every input's state.
export const rbusInputStates = (
  group: number,
  status: ArrayLike<number>,
): RBusInputState[] => {
  const states: RBusInputState[] = [];
  for (let index = 0; index < RBUS_MODULES_PER_GROUP; index++) {
    const byte = status[index] ?? 0;
    for (let bit = 0; bit < RBUS_INPUTS_PER_MODULE; bit++) {
      states.push({
        module: group * RBUS_MODULES_PER_GROUP + index + 1,
        input: bit + 1,
        occupied: (byte & (1 << bit)) !== 0,
      });
    }
  }
  return states;
};

// --- LocoNet detectors ------------------------------------------------------

// Request types for LAN_LOCONET_DETECTOR (§9.5).
export const LocoNetDetectorRequest = {
  // Digitrax "Stationary Interrogate Request"; report address 0.
  SIC: 0x80,
  // Uhlenbrock report address. Send the LocoNet value, i.e. the configured
  // report address minus 1 (spec example: 1017 is sent as 1016).
  UHLENBROCK: 0x81,
  // LISSY (FW 1.23).
  LISSY: 0x82,
} as const;

// Report types (§9.5).
export const LocoNetDetectorType = {
  OCCUPANCY: 0x01,
  TRANSPONDER_ENTERS: 0x02,
  TRANSPONDER_EXITS: 0x03,
  LISSY_LOCO: 0x10,
  LISSY_BLOCK: 0x11,
  LISSY_SPEED: 0x12,
} as const;

export type LocoNetDetectorReport =
  | {kind: 'occupancy'; feedbackAddress: number; occupied: boolean}
  | {
      kind: 'transponder';
      feedbackAddress: number;
      enters: boolean;
      // Loco address as reported. GBM16XN: see the protocol notes for its
      // +1 feedback address and the 0x1000 direction bit.
      transponderAddress: number;
    }
  | {
      kind: 'lissyLoco';
      feedbackAddress: number;
      locoAddress: number;
      // undefined when DIR1 = 0 (no direction).
      forward: boolean | undefined;
      vehicleClass: number;
    }
  | {kind: 'lissyBlock'; feedbackAddress: number; occupied: boolean}
  | {kind: 'lissySpeed'; feedbackAddress: number; speed: number}
  | {kind: 'other'; feedbackAddress: number; type: number; info: number[]};

export const decodeLocoNetDetectorReport = (
  type: number,
  feedbackAddress: number,
  info: ArrayLike<number>,
): LocoNetDetectorReport => {
  const u16 = (offset: number) =>
    (info[offset] ?? 0) | ((info[offset + 1] ?? 0) << 8);
  switch (type) {
    case LocoNetDetectorType.OCCUPANCY:
      if (info.length >= 1) {
        return {kind: 'occupancy', feedbackAddress, occupied: info[0] === 1};
      }
      break;
    case LocoNetDetectorType.TRANSPONDER_ENTERS:
    case LocoNetDetectorType.TRANSPONDER_EXITS:
      if (info.length >= 2) {
        return {
          kind: 'transponder',
          feedbackAddress,
          enters: type === LocoNetDetectorType.TRANSPONDER_ENTERS,
          transponderAddress: u16(0),
        };
      }
      break;
    case LocoNetDetectorType.LISSY_LOCO:
      if (info.length >= 3) {
        const extra = info[2];
        const hasDirection = (extra & 0x40) !== 0;
        return {
          kind: 'lissyLoco',
          feedbackAddress,
          locoAddress: u16(0),
          forward: hasDirection ? (extra & 0x20) === 0 : undefined,
          vehicleClass: extra & 0x0f,
        };
      }
      break;
    case LocoNetDetectorType.LISSY_BLOCK:
      if (info.length >= 1) {
        return {kind: 'lissyBlock', feedbackAddress, occupied: info[0] === 1};
      }
      break;
    case LocoNetDetectorType.LISSY_SPEED:
      if (info.length >= 2) {
        return {kind: 'lissySpeed', feedbackAddress, speed: u16(0)};
      }
      break;
  }
  return {kind: 'other', feedbackAddress, type, info: Array.from(info)};
};

// --- CAN detectors ----------------------------------------------------------

// LAN_CAN_DETECTOR request with this network id polls every CAN detector.
export const CAN_DETECTOR_ALL = 0xd000;

export const CanDetectorType = {
  OCCUPANCY: 0x01,
  // 0x11..0x1F: lists of RailCom loco addresses, two per message.
  LOCO_ADDRESSES_FIRST: 0x11,
  LOCO_ADDRESSES_LAST: 0x1f,
} as const;

export type CanLocoAddress = {
  address: number;
  // undefined: no direction detected.
  forward: boolean | undefined;
};

export type CanDetectorReport =
  | {
      kind: 'occupancy';
      occupied: boolean;
      trackVoltage: boolean;
      // 0 = no overload, 1..3 = overload level (value 0x1201..0x1203).
      overload: number;
    }
  | {
      kind: 'locoAddresses';
      // Position in the list: type 0x11 holds the 1st and 2nd address, etc.
      firstIndex: number;
      // Ends at the first address 0; may be empty.
      locos: CanLocoAddress[];
      endOfList: boolean;
    }
  | {kind: 'other'};

const decodeCanLocoAddress = (value: number): CanLocoAddress | undefined => {
  const address = value & 0x3fff;
  if (address === 0) {
    return undefined;
  }
  const direction = value >> 14;
  return {
    address,
    forward: direction === 0b10 ? true : direction === 0b11 ? false : undefined,
  };
};

export const decodeCanDetectorReport = (
  type: number,
  value1: number,
  value2: number,
): CanDetectorReport => {
  if (type === CanDetectorType.OCCUPANCY) {
    // 0x0000 free, 0x0100 free + voltage, 0x1000 occupied, 0x1100 occupied +
    // voltage, 0x1201..0x1203 occupied with overload 1..3.
    const occupied = (value1 & 0x1000) !== 0;
    const overload = (value1 & 0x0200) !== 0 ? value1 & 0x00ff : 0;
    return {
      kind: 'occupancy',
      occupied,
      trackVoltage: (value1 & 0x0100) !== 0,
      overload,
    };
  }
  if (
    type >= CanDetectorType.LOCO_ADDRESSES_FIRST &&
    type <= CanDetectorType.LOCO_ADDRESSES_LAST
  ) {
    const locos: CanLocoAddress[] = [];
    let endOfList = false;
    for (const value of [value1, value2]) {
      const loco = decodeCanLocoAddress(value);
      if (!loco) {
        endOfList = true;
        break;
      }
      locos.push(loco);
    }
    return {
      kind: 'locoAddresses',
      firstIndex: (type - CanDetectorType.LOCO_ADDRESSES_FIRST) * 2 + 1,
      locos,
      endOfList,
    };
  }
  return {kind: 'other'};
};
