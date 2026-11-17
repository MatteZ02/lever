// Lever addition (see COPIED_FROM.md). Jest-style globals, so the file also
// runs under Throttle's Jest.
import {
  lanCanDetector,
  lanLocoNetDetector,
  lanRmbusGetData,
  lanSetBroadcastFlags,
} from '../commands';
import {BroadcastFlag} from '../constants';
import {
  CAN_DETECTOR_ALL,
  decodeCanDetectorReport,
  decodeLocoNetDetectorReport,
  LocoNetDetectorRequest,
  rbusInputStates,
} from '../feedback';
import {fromHex, toHex} from '../hex';
import {decodeDatagram} from '../messages';

describe('feedback commands', () => {
  it.each([
    [
      'RMBUS_GETDATA group 0 (§7.2)',
      () => lanRmbusGetData(0),
      '05 00 81 00 00',
    ],
    ['RMBUS_GETDATA group 1', () => lanRmbusGetData(1), '05 00 81 00 01'],
    // §9.5 example: report address 1017 is sent as 0x03F8 (1016).
    [
      'LOCONET_DETECTOR Uhlenbrock 1017',
      () => lanLocoNetDetector(LocoNetDetectorRequest.UHLENBROCK, 1016),
      '07 00 A4 00 81 F8 03',
    ],
    [
      'LOCONET_DETECTOR SIC',
      () => lanLocoNetDetector(LocoNetDetectorRequest.SIC, 0),
      '07 00 A4 00 80 00 00',
    ],
    // §10.1 example: poll all CAN detectors.
    [
      'CAN_DETECTOR all',
      () => lanCanDetector(CAN_DETECTOR_ALL),
      '07 00 C4 00 00 00 D0',
    ],
    [
      'broadcast flags basic + R-Bus + LocoNet + CAN detectors',
      () =>
        lanSetBroadcastFlags(
          BroadcastFlag.BASIC |
            BroadcastFlag.RBUS |
            BroadcastFlag.LOCONET_DETECTOR |
            BroadcastFlag.CAN_DETECTOR,
        ),
      '08 00 50 00 03 00 08 08',
    ],
  ])('%s', (_name, encode, expected) => {
    expect(toHex(encode())).toBe(expected);
  });
});

describe('R-Bus (§7.1)', () => {
  // Spec example: group 1, status 01 00 C5 00 …: "feedback module #11,
  // contact on input 1; feedback module #13, contact on input 8,7,3 and 1".
  const example = '0F 00 80 00 01 01 00 C5 00 00 00 00 00 00 00';

  it('decodes LAN_RMBUS_DATACHANGED', () => {
    expect(decodeDatagram(fromHex(example))).toEqual([
      {
        type: 'rbusData',
        group: 1,
        status: [0x01, 0x00, 0xc5, 0, 0, 0, 0, 0, 0, 0],
      },
    ]);
  });

  it('expands the spec example to the right inputs', () => {
    const occupied = rbusInputStates(1, [0x01, 0x00, 0xc5, 0, 0, 0, 0, 0, 0, 0])
      .filter((state) => state.occupied)
      .map((state) => `${state.module}:${state.input}`);
    expect(occupied).toEqual(['11:1', '13:1', '13:3', '13:7', '13:8']);
  });

  it('reports all 80 inputs of a group', () => {
    const states = rbusInputStates(0, new Array(10).fill(0));
    expect(states).toHaveLength(80);
    expect(states[0]).toEqual({module: 1, input: 1, occupied: false});
    expect(states[79]).toEqual({module: 10, input: 8, occupied: false});
  });

  it('treats a short dataset as invalid', () => {
    const [message] = decodeDatagram(fromHex('06 00 80 00 00 01'));
    expect(message.type).toBe('invalid');
  });
});

describe('LocoNet detectors (§9.5)', () => {
  it('decodes an occupancy report', () => {
    const [message] = decodeDatagram(fromHex('08 00 A4 00 01 05 00 01'));
    expect(message).toEqual({
      type: 'locoNetDetector',
      detectorType: 0x01,
      feedbackAddress: 5,
      info: [1],
    });
    expect(decodeLocoNetDetectorReport(0x01, 5, [1])).toEqual({
      kind: 'occupancy',
      feedbackAddress: 5,
      occupied: true,
    });
    expect(decodeLocoNetDetectorReport(0x01, 5, [0])).toMatchObject({
      occupied: false,
    });
  });

  it('decodes transponder enter and exit', () => {
    expect(decodeLocoNetDetectorReport(0x02, 300, [0x03, 0x00])).toEqual({
      kind: 'transponder',
      feedbackAddress: 300,
      enters: true,
      transponderAddress: 3,
    });
    expect(decodeLocoNetDetectorReport(0x03, 300, [0xd2, 0x04])).toMatchObject({
      enters: false,
      transponderAddress: 1234,
    });
  });

  it('decodes LISSY reports', () => {
    // Info[2] = 0 DIR1 DIR0 0 K3..K0: 0x60 = direction known, backwards.
    expect(decodeLocoNetDetectorReport(0x10, 7, [0x10, 0x27, 0x65])).toEqual({
      kind: 'lissyLoco',
      feedbackAddress: 7,
      locoAddress: 10000,
      forward: false,
      vehicleClass: 5,
    });
    expect(
      decodeLocoNetDetectorReport(0x10, 7, [0x03, 0x00, 0x00]),
    ).toMatchObject({forward: undefined});
    expect(decodeLocoNetDetectorReport(0x11, 7, [1])).toEqual({
      kind: 'lissyBlock',
      feedbackAddress: 7,
      occupied: true,
    });
    expect(decodeLocoNetDetectorReport(0x12, 7, [0x2c, 0x01])).toEqual({
      kind: 'lissySpeed',
      feedbackAddress: 7,
      speed: 300,
    });
  });

  it('keeps unknown types as raw data', () => {
    expect(decodeLocoNetDetectorReport(0x42, 1, [9])).toEqual({
      kind: 'other',
      feedbackAddress: 1,
      type: 0x42,
      info: [9],
    });
  });
});

describe('CAN detectors (§10.1)', () => {
  it('decodes LAN_CAN_DETECTOR', () => {
    const [message] = decodeDatagram(
      fromHex('0E 00 C4 00 34 12 01 00 03 01 00 11 00 00'),
    );
    expect(message).toEqual({
      type: 'canDetector',
      networkId: 0x1234,
      moduleAddress: 1,
      port: 3,
      detectorType: 0x01,
      value1: 0x1100,
      value2: 0,
    });
  });

  it.each([
    [0x0000, {occupied: false, trackVoltage: false, overload: 0}],
    [0x0100, {occupied: false, trackVoltage: true, overload: 0}],
    [0x1000, {occupied: true, trackVoltage: false, overload: 0}],
    [0x1100, {occupied: true, trackVoltage: true, overload: 0}],
    [0x1201, {occupied: true, overload: 1}],
    [0x1203, {occupied: true, overload: 3}],
  ])('decodes occupancy value 0x%s', (value1, expected) => {
    expect(decodeCanDetectorReport(0x01, value1, 0)).toMatchObject({
      kind: 'occupancy',
      ...expected,
    });
  });

  it('decodes RailCom loco addresses with direction', () => {
    expect(decodeCanDetectorReport(0x11, 0x8003, 0xc0d2)).toEqual({
      kind: 'locoAddresses',
      firstIndex: 1,
      locos: [
        {address: 3, forward: true},
        {address: 210, forward: false},
      ],
      endOfList: false,
    });
    expect(decodeCanDetectorReport(0x12, 0x0005, 0)).toEqual({
      kind: 'locoAddresses',
      firstIndex: 3,
      locos: [{address: 5, forward: undefined}],
      endOfList: true,
    });
  });
});
