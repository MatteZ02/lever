// Accessory (turnout, signal) addressing and encoding, spec §5. Added for
// Lever (see COPIED_FROM.md).
//
// The spec deliberately says "output 1" / "output 2" instead of straight /
// diverging: which is which depends on the wiring (§5).

// Function address (FAdr) range: DCC accessory address 0..511, port 0..3.
export const MIN_ACCESSORY_FADR = 0;
export const MAX_ACCESSORY_FADR = 2047;

// Extended accessory RawAddress range (RCN-213): address 1 = raw 4. Raw 2047
// is the broadcast address used for the extended-accessory emergency stop.
export const MIN_EXT_ACCESSORY_RAW = 4;
export const MAX_EXT_ACCESSORY_RAW = 2047;

// 0 = output 1 (P=0), 1 = output 2 (P=1).
export type AccessoryOutput = 0 | 1;

export const isValidAccessoryFAdr = (fAdr: number): boolean =>
  Number.isInteger(fAdr) &&
  fAdr >= MIN_ACCESSORY_FADR &&
  fAdr <= MAX_ACCESSORY_FADR;

export const isValidExtAccessoryRaw = (raw: number): boolean =>
  Number.isInteger(raw) &&
  raw >= MIN_EXT_ACCESSORY_RAW &&
  raw <= MAX_EXT_ACCESSORY_RAW;

// Roco numbering (§5, option 2): turnout #1 is FAdr 0 (DCC address 0, port
// 0), #5 is FAdr 4 (DCC address 1, port 0). This is what the Z21 app and
// multiMaus display.
export const rocoTurnoutNumberToFAdr = (turnoutNumber: number): number =>
  turnoutNumber - 1;

export const fAdrToRocoTurnoutNumber = (fAdr: number): number => fAdr + 1;

// Extended accessories (§5.4): "address 1" in user interfaces is RawAddress 4.
export const extAccessoryAddressToRaw = (address: number): number =>
  address + 3;

export const extAccessoryRawToAddress = (raw: number): number => raw - 3;

// The DCC accessory decoder address and port that a FAdr ends up as on the
// track (§5). For display and wiring help only.
export const fAdrToDccAddressAndPort = (
  fAdr: number,
): {dccAddress: number; port: number} => ({
  dccAddress: fAdr >> 2,
  port: fAdr & 0x03,
});

// LAN_X_TURNOUT_INFO ZZ field (§5.3).
export type TurnoutInfoPosition =
  | 'notSwitched' // ZZ=00: not switched since power-up
  | 'output1' // ZZ=01: as after "P=0"
  | 'output2' // ZZ=10: as after "P=1"
  | 'invalid'; // ZZ=11

export const turnoutInfoPosition = (zz: number): TurnoutInfoPosition => {
  switch (zz & 0x03) {
    case 0:
      return 'notSwitched';
    case 1:
      return 'output1';
    case 2:
      return 'output2';
    default:
      return 'invalid';
  }
};
