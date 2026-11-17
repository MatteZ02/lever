// Lever addition (see COPIED_FROM.md). Jest-style globals, so the file also
// runs under Throttle's Jest.
import {
  extAccessoryAddressToRaw,
  fAdrToDccAddressAndPort,
  fAdrToRocoTurnoutNumber,
  rocoTurnoutNumberToFAdr,
  turnoutInfoPosition,
} from '../accessories';
import {
  lanXGetExtAccessoryInfo,
  lanXGetTurnoutInfo,
  lanXSetExtAccessory,
  lanXSetTurnout,
} from '../commands';
import {fromHex, toHex} from '../hex';
import {decodeDatagram} from '../messages';

describe('accessory addressing (§5)', () => {
  it('uses Roco numbering: turnout #1 is FAdr 0', () => {
    expect(rocoTurnoutNumberToFAdr(1)).toBe(0);
    expect(rocoTurnoutNumberToFAdr(5)).toBe(4);
    expect(fAdrToRocoTurnoutNumber(24)).toBe(25);
  });

  it('maps FAdr to the DCC decoder address and port (§5 examples)', () => {
    expect(fAdrToDccAddressAndPort(0)).toEqual({dccAddress: 0, port: 0});
    expect(fAdrToDccAddressAndPort(3)).toEqual({dccAddress: 0, port: 3});
    expect(fAdrToDccAddressAndPort(4)).toEqual({dccAddress: 1, port: 0});
    expect(fAdrToDccAddressAndPort(5)).toEqual({dccAddress: 1, port: 1});
  });

  it('maps extended accessory address 1 to RawAddress 4 (§5.4)', () => {
    expect(extAccessoryAddressToRaw(1)).toBe(4);
  });
});

describe('accessory commands', () => {
  it.each([
    [
      'GET_TURNOUT_INFO FAdr 0',
      () => lanXGetTurnoutInfo(0),
      '08 00 40 00 43 00 00 43',
    ],
    [
      'GET_TURNOUT_INFO FAdr 4',
      () => lanXGetTurnoutInfo(4),
      '08 00 40 00 43 00 04 47',
    ],
    [
      'GET_TURNOUT_INFO FAdr 1000',
      () => lanXGetTurnoutInfo(1000),
      '08 00 40 00 43 03 E8 A8',
    ],
    // §5.2.1: "Activate turnout #5/A2 (4,0x89) … deactivate (4,0x81)".
    [
      'activate #5 output 2',
      () => lanXSetTurnout({fAdr: 4, output: 1, activate: true}),
      '09 00 40 00 53 00 04 89 DE',
    ],
    [
      'deactivate #5 output 2',
      () => lanXSetTurnout({fAdr: 4, output: 1, activate: false}),
      '09 00 40 00 53 00 04 81 D6',
    ],
    // §5.2.1: "Activate turnout #3/A1 (2,0x88) … deactivate (2,0x80)".
    [
      'activate #3 output 1',
      () => lanXSetTurnout({fAdr: 2, output: 0, activate: true}),
      '09 00 40 00 53 00 02 88 D9',
    ],
    [
      'deactivate #3 output 1',
      () => lanXSetTurnout({fAdr: 2, output: 0, activate: false}),
      '09 00 40 00 53 00 02 80 D1',
    ],
    // §5.2.2: "Activate turnout #25 / A2 (24, 0xA9) … Deactivate (24, 0xA1)".
    [
      'queued activate #25 output 2',
      () => lanXSetTurnout({fAdr: 24, output: 1, activate: true, queue: true}),
      '09 00 40 00 53 00 18 A9 E2',
    ],
    [
      'queued deactivate #25 output 2',
      () => lanXSetTurnout({fAdr: 24, output: 1, activate: false, queue: true}),
      '09 00 40 00 53 00 18 A1 EA',
    ],
    // §5.4 examples.
    [
      'SET_EXT_ACCESSORY raw 4 = 5',
      () => lanXSetExtAccessory(4, 5),
      '0A 00 40 00 54 00 04 05 00 55',
    ],
    [
      'extended accessory emergency stop',
      () => lanXSetExtAccessory(2047, 0),
      '0A 00 40 00 54 07 FF 00 00 AC',
    ],
    [
      'GET_EXT_ACCESSORY_INFO raw 4',
      () => lanXGetExtAccessoryInfo(4),
      '09 00 40 00 44 00 04 00 40',
    ],
  ])('%s', (_name, encode, expected) => {
    expect(toHex(encode())).toBe(expected);
  });

  it('rejects addresses out of range', () => {
    expect(() => lanXGetTurnoutInfo(-1)).toThrow(RangeError);
    expect(() => lanXGetTurnoutInfo(2048)).toThrow(RangeError);
    expect(() =>
      lanXSetTurnout({fAdr: 1.5, output: 0, activate: true}),
    ).toThrow(RangeError);
    expect(() => lanXSetExtAccessory(3, 0)).toThrow(RangeError);
    expect(() => lanXSetExtAccessory(4, 256)).toThrow(RangeError);
  });
});

describe('accessory messages', () => {
  it('decodes LAN_X_TURNOUT_INFO (§5.3)', () => {
    expect(decodeDatagram(fromHex('09 00 40 00 43 00 00 02 41'))).toEqual([
      {type: 'turnoutInfo', fAdr: 0, position: 'output2'},
    ]);
    expect(decodeDatagram(fromHex('09 00 40 00 43 00 04 01 46'))).toEqual([
      {type: 'turnoutInfo', fAdr: 4, position: 'output1'},
    ]);
    expect(decodeDatagram(fromHex('09 00 40 00 43 00 01 00 42'))).toEqual([
      {type: 'turnoutInfo', fAdr: 1, position: 'notSwitched'},
    ]);
  });

  it('maps every ZZ value', () => {
    expect([0, 1, 2, 3].map(turnoutInfoPosition)).toEqual([
      'notSwitched',
      'output1',
      'output2',
      'invalid',
    ]);
  });

  it('decodes LAN_X_EXT_ACCESSORY_INFO, valid and unknown (§5.6)', () => {
    expect(decodeDatagram(fromHex('0A 00 40 00 44 00 04 05 00 45'))).toEqual([
      {type: 'extAccessoryInfo', rawAddress: 4, value: 5, valid: true},
    ]);
    expect(decodeDatagram(fromHex('0A 00 40 00 44 00 04 00 FF BF'))).toEqual([
      {type: 'extAccessoryInfo', rawAddress: 4, value: 0, valid: false},
    ]);
  });

  it('treats a truncated LAN_X_TURNOUT_INFO as invalid', () => {
    const [message] = decodeDatagram(fromHex('08 00 40 00 43 00 00 43'));
    expect(message.type).toBe('invalid');
  });
});
