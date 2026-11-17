// Turns "set this turnout to diverging" or "show proceed" into concrete
// accessory commands (function address, output, pulse), using the element's
// control settings and the project's central-unit profile. The one place that
// knows about addresses, output mapping and inversion, so wiring differences
// found on the layout are fixed here or in settings.
import {
  isValidAccessoryFAdr,
  isValidExtAccessoryRaw,
  extAccessoryAddressToRaw,
  rocoTurnoutNumberToFAdr,
} from '@lever/z21-protocol';
import {CentralUnitProfile} from './centralUnitProfile';
import {
  AccessoryControl,
  GenericAccessory,
  OutputRef,
  Signal,
  Turnout,
  TurnoutType,
} from './elements';
import {turnoutGeometry} from './ports';
import {SignalType} from './signalTypes';

export type AccessoryCommand = {
  fAdr: number;
  // 0 = output 1, 1 = output 2 (protocol P bit).
  output: 0 | 1;
  pulseMs: number;
  queued: boolean;
};

export type CommandPlan =
  // Not connected: the operator moves it by hand (ACC-5).
  | {kind: 'manual'}
  | {kind: 'commands'; commands: AccessoryCommand[]}
  | {kind: 'extended'; rawAddress: number; value: number}
  // Configuration incomplete; nothing can be sent.
  | {kind: 'incomplete'; reason: IncompleteReason};

export type IncompleteReason =
  | 'missingAddress'
  | 'addressOutOfRange'
  | 'unknownPosition'
  | 'noOutputs'
  | 'noExtendedValue';

// Displayed address → function address (LOAD-5). undefined if the result is
// out of range.
export const addressToFAdr = (
  address: number,
  profile: CentralUnitProfile,
): number | undefined => {
  const fAdr = rocoTurnoutNumberToFAdr(address) + profile.addressOffset;
  return isValidAccessoryFAdr(fAdr) ? fAdr : undefined;
};

export const fAdrToAddress = (fAdr: number, profile: CentralUnitProfile) =>
  fAdr + 1 - profile.addressOffset;

const swap = (output: 1 | 2): 1 | 2 => (output === 1 ? 2 : 1);

// Number of addresses a turnout's control needs with the default mapping.
export const requiredAddressCount = (
  type: TurnoutType,
  control: AccessoryControl,
): number =>
  type === 'doubleSlip' && control.kind === 'dcc'
    ? Math.min(2, Math.max(1, control.addresses.length))
    : turnoutGeometry(type, 'E').addressCount;

// Default outputs per position. `s` is the profile's straight output, `d` the
// other one.
export const defaultTurnoutOutputMap = (
  type: TurnoutType,
  addressCount: number,
  profile: CentralUnitProfile,
): Record<string, OutputRef[]> => {
  const s = profile.straightOutput;
  const d = swap(s);
  switch (type) {
    case 'left':
    case 'right':
    case 'singleSlip':
      return {
        straight: [{address: 0, output: s}],
        diverging: [{address: 0, output: d}],
      };
    case 'wye':
      return {
        left: [{address: 0, output: 1}],
        right: [{address: 0, output: 2}],
      };
    case 'threeWay':
      // Two turnout motors in a row: A at the tip, B behind it.
      return {
        straight: [
          {address: 0, output: s},
          {address: 1, output: s},
        ],
        left: [{address: 0, output: d}],
        right: [
          {address: 0, output: s},
          {address: 1, output: d},
        ],
      };
    case 'doubleSlip':
      // One address switches both ends; with two addresses, both motors are
      // moved together.
      return addressCount >= 2
        ? {
            straight: [
              {address: 0, output: s},
              {address: 1, output: s},
            ],
            diverging: [
              {address: 0, output: d},
              {address: 1, output: d},
            ],
          }
        : {
            straight: [{address: 0, output: s}],
            diverging: [{address: 0, output: d}],
          };
    case 'crossing':
      return {};
  }
};

const toCommands = (
  refs: OutputRef[],
  control: Extract<AccessoryControl, {kind: 'dcc'}>,
  profile: CentralUnitProfile,
  pulseOverride?: number,
): CommandPlan => {
  if (refs.length === 0) {
    return {kind: 'incomplete', reason: 'noOutputs'};
  }
  const commands: AccessoryCommand[] = [];
  for (const ref of refs) {
    const address = control.addresses[ref.address];
    if (address === undefined) {
      return {kind: 'incomplete', reason: 'missingAddress'};
    }
    const fAdr = addressToFAdr(address, profile);
    if (fAdr === undefined) {
      return {kind: 'incomplete', reason: 'addressOutOfRange'};
    }
    const output = control.invert ? swap(ref.output) : ref.output;
    commands.push({
      fAdr,
      output: output === 1 ? 0 : 1,
      pulseMs: pulseOverride ?? control.pulseMs ?? profile.pulseMs,
      queued: profile.turnoutCommandMode === 'queued',
    });
  }
  return {kind: 'commands', commands};
};

export const turnoutCommands = (
  turnout: Turnout,
  position: string,
  profile: CentralUnitProfile,
): CommandPlan => {
  const {control} = turnout;
  if (control.kind === 'manual') {
    return {kind: 'manual'};
  }
  if (!turnoutGeometry(turnout.type, 'E').positions.includes(position)) {
    return {kind: 'incomplete', reason: 'unknownPosition'};
  }
  if (control.kind === 'extended') {
    // Turnouts on extended decoders: value per position from valueMap.
    const value = control.valueMap?.[position];
    if (value === undefined) {
      return {kind: 'incomplete', reason: 'noExtendedValue'};
    }
    return extendedPlan(control.address, value);
  }
  const map =
    control.outputMap ??
    defaultTurnoutOutputMap(
      turnout.type,
      requiredAddressCount(turnout.type, control),
      profile,
    );
  return toCommands(map[position] ?? [], control, profile);
};

export const signalAspectCommands = (
  signal: Signal,
  type: SignalType,
  aspectId: string,
  profile: CentralUnitProfile,
): CommandPlan => {
  const {control} = signal;
  const aspect = type.aspects.find((candidate) => candidate.id === aspectId);
  if (!aspect) {
    return {kind: 'incomplete', reason: 'unknownPosition'};
  }
  if (control.kind === 'manual') {
    return {kind: 'manual'};
  }
  if (control.kind === 'extended') {
    const value = control.valueMap?.[aspectId] ?? aspect.extValue;
    if (value === undefined) {
      return {kind: 'incomplete', reason: 'noExtendedValue'};
    }
    return extendedPlan(control.address, value);
  }
  return toCommands(
    control.outputMap?.[aspectId] ?? aspect.outputs,
    control,
    profile,
  );
};

// Generic accessories (uncoupler, light): "on" = output 2, "off" = output 1
// (swapped by invert). A momentary accessory only uses "on".
export const accessoryButtonCommands = (
  accessory: GenericAccessory,
  on: boolean,
  profile: CentralUnitProfile,
): CommandPlan => {
  const {control} = accessory;
  if (control.kind === 'manual') {
    return {kind: 'manual'};
  }
  if (control.kind === 'extended') {
    const value = control.valueMap?.[on ? 'on' : 'off'];
    return value === undefined
      ? {kind: 'incomplete', reason: 'noExtendedValue'}
      : extendedPlan(control.address, value);
  }
  return toCommands(
    control.outputMap?.[on ? 'on' : 'off'] ?? [
      {address: 0, output: on ? 2 : 1},
    ],
    control,
    profile,
  );
};

const extendedPlan = (address: number, value: number): CommandPlan => {
  const rawAddress = extAccessoryAddressToRaw(address);
  return isValidExtAccessoryRaw(rawAddress)
    ? {kind: 'extended', rawAddress, value}
    : {kind: 'incomplete', reason: 'addressOutOfRange'};
};

// Every function address an element's control uses (for conflicts and the
// address table).
export const controlFAdrs = (
  control: AccessoryControl,
  profile: CentralUnitProfile,
): number[] =>
  control.kind === 'dcc'
    ? control.addresses.flatMap((address) => {
        const fAdr = addressToFAdr(address, profile);
        return fAdr === undefined ? [] : [fAdr];
      })
    : [];
