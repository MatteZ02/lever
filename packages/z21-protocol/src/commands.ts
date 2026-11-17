// Encoders for client-to-Z21 messages. Each returns one encoded dataset.
// Byte layouts: docs/reference/z21-protocol-notes.md and the spec sections
// noted below.
import {
  AccessoryOutput,
  isValidAccessoryFAdr,
  isValidExtAccessoryRaw,
} from './accessories';
import {encodeLocoAddress} from './address';
import {LanHeader} from './constants';
import {encodeDataset, encodeXBus} from './dataset';
import {encodeFunctionByte, FunctionSwitch} from './functions';
import {
  driveCodeForSpeedSteps,
  encodeSpeedByte,
  SpeedSteps,
  SpeedValue,
} from './speed';

// §2.1
export const lanGetSerialNumber = (): Uint8Array =>
  encodeDataset(LanHeader.GET_SERIAL_NUMBER);

// §2.21
export const lanGetCode = (): Uint8Array => encodeDataset(LanHeader.GET_CODE);

// §2.20
export const lanGetHwInfo = (): Uint8Array =>
  encodeDataset(LanHeader.GET_HWINFO);

// §2.2
export const lanLogoff = (): Uint8Array => encodeDataset(LanHeader.LOGOFF);

// §2.16
export const lanSetBroadcastFlags = (flags: number): Uint8Array => {
  const value = flags >>> 0;
  return encodeDataset(LanHeader.SET_BROADCASTFLAGS, [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
};

// §2.17
export const lanGetBroadcastFlags = (): Uint8Array =>
  encodeDataset(LanHeader.GET_BROADCASTFLAGS);

// §2.19
export const lanSystemStateGetData = (): Uint8Array =>
  encodeDataset(LanHeader.SYSTEMSTATE_GETDATA);

// §2.3
export const lanXGetVersion = (): Uint8Array => encodeXBus([0x21, 0x21]);

// §2.4
export const lanXGetStatus = (): Uint8Array => encodeXBus([0x21, 0x24]);

// §2.5
export const lanXSetTrackPowerOff = (): Uint8Array => encodeXBus([0x21, 0x80]);

// §2.6. Also ends emergency stop and programming mode.
export const lanXSetTrackPowerOn = (): Uint8Array => encodeXBus([0x21, 0x81]);

// §2.13. Emergency stop: all locos stop, track power stays on.
export const lanXSetStop = (): Uint8Array => encodeXBus([0x80]);

// §2.15
export const lanXGetFirmwareVersion = (): Uint8Array =>
  encodeXBus([0xf1, 0x0a]);

// §4.1. Also subscribes to LAN_X_LOCO_INFO for this address (max 16, FIFO).
export const lanXGetLocoInfo = (address: number): Uint8Array =>
  encodeXBus([0xe3, 0xf0, ...encodeLocoAddress(address)]);

export type DriveCommand = SpeedValue & {
  address: number;
  steps: SpeedSteps;
};

// §4.2
export const lanXSetLocoDrive = ({
  address,
  steps,
  ...speed
}: DriveCommand): Uint8Array =>
  encodeXBus([
    0xe4,
    driveCodeForSpeedSteps(steps),
    ...encodeLocoAddress(address),
    encodeSpeedByte(steps, speed),
  ]);

// §4.3.1
export const lanXSetLocoFunction = (
  address: number,
  index: number,
  switchType: FunctionSwitch,
): Uint8Array =>
  encodeXBus([
    0xe4,
    0xf8,
    ...encodeLocoAddress(address),
    encodeFunctionByte(index, switchType),
  ]);

// §4.5. Requires Z21 FW 1.43 or newer.
export const lanXSetLocoEStop = (address: number): Uint8Array =>
  encodeXBus([0x92, ...encodeLocoAddress(address)]);

// --- Lever additions: accessories (§5) and feedback (§7, §9.5, §10.1) -------

const checkFAdr = (fAdr: number) => {
  if (!isValidAccessoryFAdr(fAdr)) {
    throw new RangeError(`Invalid accessory function address: ${fAdr}`);
  }
};

const checkExtRaw = (raw: number) => {
  if (!isValidExtAccessoryRaw(raw)) {
    throw new RangeError(`Invalid extended accessory address: ${raw}`);
  }
};

// §5.1. FAdr is sent big-endian.
export const lanXGetTurnoutInfo = (fAdr: number): Uint8Array => {
  checkFAdr(fAdr);
  return encodeXBus([0x43, fAdr >> 8, fAdr & 0xff]);
};

export type SetTurnoutCommand = {
  fAdr: number;
  output: AccessoryOutput;
  // true = activate (A=1), false = deactivate (A=0).
  activate: boolean;
  // Q flag, FW 1.24+. Never mix Q=0 and Q=1 in one application (§5.2.2).
  queue?: boolean;
};

// §5.2. DB2 = 10Q0A00P.
export const lanXSetTurnout = ({
  fAdr,
  output,
  activate,
  queue = false,
}: SetTurnoutCommand): Uint8Array => {
  checkFAdr(fAdr);
  const db2 = 0x80 | (queue ? 0x20 : 0) | (activate ? 0x08 : 0) | output;
  return encodeXBus([0x53, fAdr >> 8, fAdr & 0xff, db2]);
};

// §5.4. FW 1.40+. RawAddress 4 is "address 1"; value 0..255.
export const lanXSetExtAccessory = (raw: number, value: number): Uint8Array => {
  checkExtRaw(raw);
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`Invalid extended accessory value: ${value}`);
  }
  return encodeXBus([0x54, raw >> 8, raw & 0xff, value, 0x00]);
};

// §5.5. FW 1.40+.
export const lanXGetExtAccessoryInfo = (raw: number): Uint8Array => {
  checkExtRaw(raw);
  return encodeXBus([0x44, raw >> 8, raw & 0xff, 0x00]);
};

// §7.2. Group 0: modules 1-10, group 1: modules 11-20.
export const lanRmbusGetData = (group: 0 | 1): Uint8Array =>
  encodeDataset(LanHeader.RMBUS_GETDATA, [group]);

// §9.5. See LocoNetDetectorRequest for the types and the address convention.
export const lanLocoNetDetector = (
  type: number,
  reportAddress: number,
): Uint8Array =>
  encodeDataset(LanHeader.LOCONET_DETECTOR, [
    type,
    reportAddress & 0xff,
    (reportAddress >> 8) & 0xff,
  ]);

// §10.1. Network id 0xD000 (CAN_DETECTOR_ALL) polls every detector.
export const lanCanDetector = (networkId: number): Uint8Array =>
  encodeDataset(LanHeader.CAN_DETECTOR, [
    0x00,
    networkId & 0xff,
    (networkId >> 8) & 0xff,
  ]);
