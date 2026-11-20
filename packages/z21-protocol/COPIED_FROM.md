# Copied from Throttle

This package started as a copy of Throttle's protocol layer. It will become a package shared by
both apps when they are integrated (Lever brief, sections 4 and 13). Until then, keep it free of
Lever-specific code and of Node, Electron, React and React Native imports.

| What                        | Source                                                  |
| --------------------------- | ------------------------------------------------------- |
| `src/*.ts` (protocol layer) | `src/protocol/` in https://github.com/MatteZ02/throttle |
| `src/__tests__/*.test.ts`   | `src/protocol/__tests__/`                               |

Source commit: **`789c70e`** (branch `release`, "docs: guides and App Store text for 0.2.1").
`src/protocol/` is unchanged between that commit and `0663ac2`, the newest commit when it was copied.

## Differences from the source

- The files were copied unchanged. The tests still use Jest-style globals (`describe`, `it`,
  `expect`); Lever runs them with Vitest's `globals: true`, so they remain valid Jest tests too.
- Additions for Lever (accessories, feedback) are listed below as they are made, so that they can be
  ported back to Throttle or into the shared package.

## Additions since the copy

General Z21 protocol, not Lever-specific, so they belong in the shared package (Phase 1):

| File                                                                | Change                                                                                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accessories.ts` (new)                                              | FAdr / extended RawAddress ranges and conversions (Roco numbering), `TurnoutInfoPosition`.                                                           |
| `feedback.ts` (new)                                                 | R-Bus input expansion, LocoNet detector and CAN detector report decoding.                                                                            |
| `constants.ts`                                                      | `LanHeader`: `RMBUS_DATACHANGED`, `RMBUS_GETDATA`, `LOCONET_DETECTOR`, `CAN_DETECTOR`. `BroadcastFlag`: `RBUS`, `LOCONET_DETECTOR`, `CAN_DETECTOR`.  |
| `commands.ts`                                                       | `lanXGetTurnoutInfo`, `lanXSetTurnout`, `lanXSetExtAccessory`, `lanXGetExtAccessoryInfo`, `lanRmbusGetData`, `lanLocoNetDetector`, `lanCanDetector`. |
| `messages.ts`                                                       | `Z21Message` variants `turnoutInfo`, `extAccessoryInfo`, `rbusData`, `locoNetDetector`, `canDetector`, and their decoding.                           |
| `index.ts`                                                          | Exports the two new modules.                                                                                                                         |
| `__tests__/accessories.test.ts`, `__tests__/feedback.test.ts` (new) | Byte-exact tests from the spec examples (§5.2, §5.4, §7.1, §9.5, §10.1) and Z21Sim captures.                                                         |
| `__tests__/messages.test.ts`                                        | The "unknown dataset" example used header `0x80`, now decoded as R-Bus data; changed to `0x99`.                                                      |

Effect on Throttle when ported back: Throttle sets only the basic flag `0x1`, which also delivers
`LAN_X_TURNOUT_INFO` (and `LAN_X_EXT_ACCESSORY_INFO`) whenever anyone switches an accessory. These
used to decode as `unknown` and now decode as `turnoutInfo` / `extAccessoryInfo`; Throttle's
message handling ignores both (no matching `case`). The feedback messages need flags Throttle never
sets.
