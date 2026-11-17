// Semantic colour tokens for light and dark mode (CARRY-3). Components and
// diagrams use these names only; the values point at palette entries.
//
// Fixed meanings (LOOK-2), the same in every view, level and theme:
// - occupied track is always red (solid line),
// - a set route is always green dashes,
// - occupied and part of a set route: red line with green dashes over it.
// The shades may change, but must stay recognisably red and green. Other
// states use secondary styles that never conflict with these; their line
// patterns are in diagram.ts (LOOK-3, LOOK-4).
import {palette} from './palette';

export type ColorTokens = {
  // App surfaces and text
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  textOnAccent: string;
  accent: string;
  focusRing: string;
  modalBackdrop: string;

  // Safety controls and track status (CARRY-2)
  stopButton: string;
  stopButtonHover: string;
  textOnStopButton: string;
  statusNormal: string;
  statusEmergencyStop: string;
  statusPowerOff: string;
  statusShortCircuit: string;
  statusProgramming: string;
  statusUnknown: string;
  textOnStatus: string;
  textOnShortCircuit: string;

  // Connection indicator
  connectionOk: string;
  connectionBusy: string;
  connectionDown: string;

  // Track diagram (section 8.0)
  diagramBackground: string;
  diagramGrid: string;
  trackFree: string;
  trackOccupied: string;
  trackRouteSet: string;
  trackRouteSetting: string;
  trackRouteLocked: string;
  trackRouteBroken: string;
  trackInactiveLeg: string;
  turnoutUnknown: string;
  turnoutUnconfirmed: string;
  turnoutManual: string;
  connectorUnpaired: string;
  areaLevel1: string;
  areaLevel2: string;
  areaLevel3: string;
  areaLevel4: string;
  diagramLabel: string;
  trainNumberBackground: string;
  trainNumberText: string;

  // Signal aspects (SIG-2)
  signalBody: string;
  signalStop: string;
  signalProceed: string;
  signalCaution: string;
  signalShunting: string;
  signalDark: string;
  signalUnknown: string;

  // Protocol log
  logOut: string;
  logIn: string;
  logInfo: string;
};

export const lightColors: ColorTokens = {
  background: palette.grey50,
  surface: palette.white,
  surfaceRaised: palette.grey100,
  border: palette.grey300,
  text: palette.grey900,
  textMuted: palette.grey600,
  textOnAccent: palette.white,
  accent: palette.blue700,
  focusRing: palette.blue500,
  modalBackdrop: palette.shade,

  stopButton: palette.red700,
  stopButtonHover: palette.red800,
  textOnStopButton: palette.white,
  statusNormal: palette.green700,
  statusEmergencyStop: palette.amber700,
  statusPowerOff: palette.blue700,
  statusShortCircuit: palette.red700,
  statusProgramming: palette.violet600,
  statusUnknown: palette.grey600,
  textOnStatus: palette.white,
  textOnShortCircuit: palette.white,

  connectionOk: palette.green700,
  connectionBusy: palette.amber700,
  connectionDown: palette.red700,

  diagramBackground: palette.grey50,
  diagramGrid: palette.grey100,
  trackFree: palette.grey700,
  trackOccupied: palette.red600,
  trackRouteSet: palette.green600,
  trackRouteSetting: palette.green600,
  trackRouteLocked: palette.green700,
  trackRouteBroken: palette.amber700,
  trackInactiveLeg: palette.grey300,
  turnoutUnknown: palette.violet600,
  turnoutUnconfirmed: palette.amber700,
  turnoutManual: palette.cyan700,
  connectorUnpaired: palette.grey500,
  areaLevel1: palette.grey500,
  areaLevel2: palette.blue500,
  areaLevel3: palette.violet600,
  areaLevel4: palette.cyan700,
  diagramLabel: palette.grey700,
  trainNumberBackground: palette.grey900,
  trainNumberText: palette.white,

  signalBody: palette.grey900,
  signalStop: palette.red600,
  signalProceed: palette.green600,
  signalCaution: palette.amber500,
  signalShunting: palette.lunar,
  signalDark: palette.grey600,
  signalUnknown: palette.violet600,

  logOut: palette.blue700,
  logIn: palette.green700,
  logInfo: palette.grey600,
};

export const darkColors: ColorTokens = {
  background: palette.grey950,
  surface: palette.grey900,
  surfaceRaised: palette.grey850,
  border: palette.grey700,
  text: palette.grey50,
  textMuted: palette.grey400,
  textOnAccent: palette.white,
  accent: palette.blue300,
  focusRing: palette.blue300,
  modalBackdrop: palette.shade,

  stopButton: palette.red700,
  stopButtonHover: palette.red600,
  textOnStopButton: palette.white,
  statusNormal: palette.green700,
  statusEmergencyStop: palette.amber700,
  statusPowerOff: palette.blue700,
  statusShortCircuit: palette.red600,
  statusProgramming: palette.violet600,
  statusUnknown: palette.grey700,
  textOnStatus: palette.white,
  textOnShortCircuit: palette.white,

  connectionOk: palette.green400,
  connectionBusy: palette.amber500,
  connectionDown: palette.red500,

  diagramBackground: palette.grey950,
  diagramGrid: palette.grey850,
  trackFree: palette.grey500,
  trackOccupied: palette.red500,
  trackRouteSet: palette.green400,
  trackRouteSetting: palette.green400,
  trackRouteLocked: palette.green300,
  trackRouteBroken: palette.amber500,
  trackInactiveLeg: palette.grey700,
  turnoutUnknown: palette.violet300,
  turnoutUnconfirmed: palette.amber300,
  turnoutManual: palette.cyan300,
  connectorUnpaired: palette.grey400,
  areaLevel1: palette.grey500,
  areaLevel2: palette.blue300,
  areaLevel3: palette.violet300,
  areaLevel4: palette.cyan300,
  diagramLabel: palette.grey300,
  trainNumberBackground: palette.grey800,
  trainNumberText: palette.grey50,

  signalBody: palette.grey300,
  signalStop: palette.red500,
  signalProceed: palette.green400,
  signalCaution: palette.amber300,
  signalShunting: palette.lunar,
  signalDark: palette.grey600,
  signalUnknown: palette.violet300,

  logOut: palette.blue300,
  logIn: palette.green300,
  logInfo: palette.grey400,
};
