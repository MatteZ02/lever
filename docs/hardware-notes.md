# Hardware notes

What is known about the real central units Lever runs against, and what still has to be checked.
The protocol specification (`docs/reference/z21-lan-protokoll-en_1.13.pdf`) is the source of truth;
this file records where hardware agrees or differs. Protocol details are in
[reference/z21-protocol-notes.md](reference/z21-protocol-notes.md).

## Roco z21 start (test hardware)

From Throttle (checked 2026-10-31): hardware type `0x204`, **firmware 1.33**, unlocked
(`LAN_GET_CODE` = 2), factory IP `192.168.0.111`. The PC needs a second IP address in
`192.168.0.x` to reach it (see [development.md](development.md)).

Firmware levels that matter for Lever (spec revision history, §5):

| Feature                                          | Needs FW | On the z21 start (1.33)        |
| ------------------------------------------------ | -------- | ------------------------------ |
| `LAN_X_SET_TURNOUT`, `LAN_X_GET_TURNOUT_INFO`    | all      | yes: the working path          |
| Queue bit `Q=1` in `LAN_X_SET_TURNOUT`           | 1.24     | available, but see note        |
| Extended accessories (`LAN_X_SET_EXT_ACCESSORY`) | 1.40     | **no**: behind a version check |
| `SystemState.Capabilities`                       | 1.42     | no (field is 0)                |

Note on `Q`: the spec says never to mix `Q=0` and `Q=1` commands. Lever serialises accessory commands
itself (LOAD-2), so it uses `Q=0` everywhere; that also works on central units without the queue.

The user's z21 start has **no accessories connected** (2026-11-17), so its checks are protocol-only:
it answers for addresses with nothing behind them, which is harmless. Checks that need real
turnouts are done later on the layout (on another PC).

On the z21 start, protocol only — **checked 2026-11-18** (probe, two-engine live test, overlap
test; nothing connected to the outputs):

- [x] Accessory broadcasts reach every client with flag `0x1`, including the sender, within 1 ms
      (MULTI-1). The two-engine live test passes.
- [x] `LAN_X_TURNOUT_INFO` is sent on **activate** only, not on deactivate (same as Z21Sim).
- [x] **No `ZZ=00`**: never-switched addresses report `ZZ=01` (output 1). Lever cannot tell a
      default or remembered position from a real one (MULTI-3). Only position feedback (ACC-3) or
      switching the turnout gives certainty. Lever shows such positions as **reported** (fine
      dashes) until it sees the turnout switch; the ACC-4 restore does not trust them either.
- [x] Extended accessories: `LAN_X_GET_EXT_ACCESSORY_INFO` → `LAN_X_UNKNOWN_COMMAND`;
      `LAN_X_SET_EXT_ACCESSORY` silently ignored. Lever refuses both on FW 1.33 (notice).
- [x] Feedback: `LAN_RMBUS_GETDATA` is answered (all inputs free). LocoNet and CAN detector
      requests get no reply (the z21 start has neither bus).
- [x] `Q=1` is accepted; several datasets per datagram are each answered.
- [x] **Same turnout from two clients at once:** with `Q=0`, an activate for a turnout while
      another client still holds the other output of the same turnout active is **silently
      ignored** (no report, position unchanged). Different turnouts overlap fine. Within one Lever
      instance the queue prevents this; between clients it can happen (two Lever instances, Lever
      and the Roco app). The position then stays unconfirmed. Since Phase 3, if no report arrives
      within the confirmation timeout, Lever sends the command once more, then shows **failed**.

On the layout, with real turnouts (later):

- [ ] Turnout numbering in the Roco app matches `FAdr = number − 1` (spec §5, option 2): switch
      turnout #N in Lever's developer panel and check that the same turnout moves as in the Roco app.
- [ ] Default pulse 150 ms and gap 150 ms throw the club's turnouts reliably.
- [ ] Double slips with one address switch both ends together.
- [ ] Operating mode: throwing from the diagram, signal aspects, occupancy from the layout's
      detectors, and ACC-4 restore (setting on) after a Lever restart.

Tools, the same for every central unit:

```powershell
node scripts/z21-probe.mjs 192.168.0.111 21105 --switch-address=<FAdr>   # raw probe with 3 clients
$env:LEVER_Z21_HOST = '192.168.0.111'; $env:LEVER_Z21_SWITCH_FADR = '<FAdr>'
npx vitest run src/engine/__tests__/liveCentralUnit.test.ts                # two Lever engines
```

Both switch one accessory output pair both ways; choose an address where that is harmless.

## DigiKeijs DR5000 (club central unit)

No DR5000 documentation is available. Everything below must be **verified on the club's DR5000 with
the protocol log**. Anything that may differ is configurable.

### What to change if something differs

All of these are per-layout settings (Edit layout → nothing selected → _Central unit settings_),
stored in the `.lever` file (`settings.centralUnit`, `src/model/centralUnitProfile.ts`). No code
change is needed for any of them:

| Observation on the layout                                         | Setting                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------- |
| Every turnout is off by the same number vs. the Roco app / DR5000 | Address offset (e.g. +4 or −4)                              |
| Most turnouts move the wrong way                                  | Output for "straight" (one turnout: _Swap outputs 1 and 2_) |
| Turnouts do not always throw                                      | Pulse length (per project, or per turnout)                  |
| In a row of commands, some turnouts are skipped                   | Pause between accessory commands                            |
| The DR5000 wants queued commands                                  | Turnout commands → queued (Q=1)                             |
| Positions stay "unconfirmed" (no `LAN_X_TURNOUT_INFO`)            | Turnout position confirmed → also after a timeout           |
| A three-way turnout, slip or signal maps outputs differently      | That element's _Outputs per position_                       |
| Feedback arrives on another bus than expected                     | Feedback buses used, and the block's input source           |

If a difference cannot be expressed with these, the place to change behaviour is
`src/model/accessoryCommands.ts` (which outputs are sent) or `src/connection/AccessoryQueue.ts`
(timing); both are covered by unit tests.

- [ ] Accessory addressing: does `FAdr = number − 1` match what the DR5000's own tools show?
      If not, use the per-project **address offset** (LOAD-5).
- [ ] `LAN_X_TURNOUT_INFO` broadcasts to all clients with flag `0x00000001`, also for changes made
      by other clients and by handsets (MULTI-1).
- [ ] Reply to `LAN_X_GET_TURNOUT_INFO` for a never-switched turnout.
- [ ] Which feedback sources it exposes over LAN: R-Bus (`LAN_RMBUS_*`), LocoNet detectors
      (`LAN_LOCONET_DETECTOR`), CAN detectors (`LAN_CAN_DETECTOR`), and with which broadcast flags.
- [ ] Extended accessories (`LAN_X_SET_EXT_ACCESSORY`, `LAN_X_EXT_ACCESSORY_INFO`).
- [ ] Whether it accepts several datasets per datagram (both directions).
- [ ] `LAN_GET_HWINFO`, `LAN_X_GET_FIRMWARE_VERSION`, `LAN_GET_CODE` replies (all optional; Lever
      tolerates no reply).
- [ ] `LAN_X_UNKNOWN_COMMAND` for unsupported commands, or silence.
- [ ] Minimum gap between accessory commands it handles reliably (LOAD-2 default 100–150 ms).

## Club control station PCs

- [ ] Hardware (CPU, RAM, graphics) of the club PCs, for the low-spec performance check (STK-5,
      STK-8).
- [ ] Windows versions in use (10 / 11).
