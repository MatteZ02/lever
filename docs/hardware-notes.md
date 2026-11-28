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
      within the confirmation timeout, Lever first asks the turnout's position (a lost report,
      e.g. on the DR5000), sends the command once more only if it has not moved, asks again, and
      then shows **failed** in the position the central unit reports.

On the layout, with real turnouts (later):

- [ ] Turnout numbering in the Roco app matches `FAdr = number − 1` (spec §5, option 2): switch
      turnout #N in Lever's developer panel and check that the same turnout moves as in the Roco app.
- [ ] Default pulse 150 ms and gap 150 ms throw the club's turnouts reliably.
- [ ] Double slips with one address switch both ends together.
- [ ] Operating mode: throwing from the diagram, signal aspects, occupancy from the layout's
      detectors, and ACC-4 restore (setting on) after a Lever restart.

Levels 3 and 4 (built without hardware; check on the DR5000 before trusting them):

- [ ] `LAN_X_GET_LOCO_INFO` subscribes Lever to a loco: does the DR5000 send `LAN_X_LOCO_INFO` to
      Lever when **another** client (a Throttle) changes that loco's speed? If not, Lever sees a
      driver accelerating a held train only with its 2 s poll (`CONTROLLED_LOCO_POLL_MS`).
- [ ] Lever's `LAN_X_SET_LOCO_DRIVE` ramps (one command per 200 ms per loco while braking or
      accelerating) are carried out smoothly, also with several locos at once and Throttles
      driving.
- [ ] Train following: a train number moves block to block with the club's detectors and release
      delay (a gap in detection between two blocks loses the train).
- [ ] Automatic stop: a held train stops inside its block with the loco's braking rate (adjust
      the braking or the free blocks needed ahead otherwise).

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

**Checked 2026-11-18** on the club's DR5000 at `192.168.0.111` (over WiFi), protocol level, with
`scripts/z21-probe.mjs`, follow-up probes and the two-engine live test; switching only FAdr 0
(turnout #1, an olten double slip). Nobody watched the turnout, so physical movement is unchecked.

- [x] Identity: `LAN_GET_HWINFO` → type `0x201` (it poses as a black Z21), FW **1.29**;
      `LAN_X_GET_FIRMWARE_VERSION` → 1.29; `LAN_X_GET_VERSION` → X-Bus 3.0, `CMDST_ID 0x12`;
      `LAN_GET_CODE` → `0x00`; serial `0x2149`.
- [x] Track power: the earlier "power on while the user said off" was the layout's track feed
      being disconnected while the DR5000's output was on (connected later the same day).
- [x] **A plain power-off is reported as a short circuit by `LAN_X_GET_STATUS`** (2026-11-18,
      19:58:24–26, power switched off and on from another device, status asked every second):
      `LAN_X_GET_STATUS` → `0x06` (track voltage off **+ short circuit**), while
      `LAN_SYSTEMSTATE_GETDATA` → CentralState `0x02` (track voltage off only). CentralStateEx is
      `0x04` ("short circuit external") **all the time**, also with power on, so it means nothing
      on the DR5000. Lever reads `LAN_X_GET_STATUS` (keepalive, refresh on user actions), so it
      would show **SHORT CIRCUIT** for a plain power-off. **Decision needed** (e.g. confirm a
      short circuit with `LAN_SYSTEMSTATE_GETDATA` before showing it).
- [x] **MULTI-1 fails: no broadcasts to other clients.** `LAN_X_TURNOUT_INFO` goes **only to the
      client that switched** (on activate, not on deactivate), never to other clients, whatever
      their flags and also after they asked for that turnout. The two-engine live test fails
      (instance B never sees A's change). Changes by Throttle, the Roco app, handsets or a second
      Lever are invisible to Lever, so a "confirmed" position can be stale. **Decided:** the
      position refresh below.
- [x] **No track status broadcasts to other clients either:** a passive client (flag `0x1`) got no
      `BC_TRACK_POWER_OFF/ON`, `BC_STOPPED` or `BC_TRACK_SHORT_CIRCUIT` while power went off and
      on from elsewhere; the change showed only in replies to `LAN_X_GET_STATUS` (`0x06` = power
      off + short circuit, later `0x00`). Lever therefore asks for the status at a fixed interval
      (_Ask for central unit status every (s)_, `statusRefreshMs`, default 1 s), and on user
      actions when the last request is over 2 s old (`STATUS_REFRESH_MIN_AGE_MS`). Before this
      setting, STOP and short circuits from other devices showed only with the 25 s keepalive.
      `0x06` was a plain power-off reported with the short-circuit bit (see above).
- [x] **Replies go to the wrong client under simultaneous requests:** two clients sending the
      same request within ~1 ms both got their replies at the **later** sender; the other got
      nothing. Requests 50 ms apart were answered correctly. A lost status reply only marks the
      connection _interrupted_ for a moment (no reconnect, nothing cleared), but
      with several Throttles a confirmation can be lost (→ retry → _failed_). The stock live test
      also times out on connect for this reason (both engines connect at the same moment).
- [x] **Broadcast flags are global, not per client:** every client reads back the flags the
      _last_ client set (four clients set `0x1`, `0x101`, `0x0F0C0107`, `0xFFFEFFFF`; all four read
      `0xFFFEFFFF`). Lever setting its flags on connect therefore changes them for WinDigipet,
      the Z21 app and Throttle too. **Decided (2026-11-18):** Lever asks the current flags at login
      and only adds its own (`ConnectionManager`, `othersFlags`).
- [x] **Turnouts switched by WinDigipet (USB) are never reported to network clients:** with flags
      `0x04000001` (basic + LocoNet switch messages), no `LAN_X_TURNOUT_INFO` and no LocoNet
      message arrived while turnouts 35, 39 and 10 were switched from WinDigipet (2026-11-18). The
      Z21 app still showed them, so it polls. **Decided:** the layout setting _Ask for turnout
      positions every (s)_ (`positionRefreshMs`, 0 = off) makes Lever ask for the positions of the
      station on screen that often, and at once on an operator's action when the last round is
      over 3 s old. Background queries (50 ms apart) that never delay a command; a changed
      position counts as confirmed. 10 s for the club layout on the DR5000.
- [x] **The DR5000's position reply does follow WinDigipet** (checked 2026-11-18, 19:53–19:55):
      asking turnout 35 every 5 s while it was switched from WinDigipet gave output 2 → 1 → 2 → 1
      → 2 → 1, each change within one poll. So _Ask for turnout positions every (s)_ shows
      WinDigipet's (and other clients') switching on the DR5000, with that delay.
- [x] **The club layout has no occupancy detectors** (user, 2026-11-18). Even so, with flags
      `0x09080003` the DR5000 sent an unsolicited LocoNet `OPC_INPUT_REP` for **sensor #1013
      occupied**, and the LocoNet detector request (`LAN_LOCONET_DETECTOR` type `0x80`, address 0)
      was answered with type `0x01`, address 1013, value `01`. Something on LocoNet (or
      WinDigipet) sets sensor 1013. CAN detector request: `LAN_X_UNKNOWN_COMMAND`. R-Bus groups
      0–1: all free.
- [x] Feedback: `LAN_RMBUS_GETDATA` answered (groups 0 and 1, all free). LocoNet detector: no
      reply. CAN detector: `LAN_X_UNKNOWN_COMMAND`.
- [x] Never-switched turnout (FAdr 999): `ZZ=2` (output 2), not `ZZ=00`; FAdr 1 and 2 also `ZZ=2`.
      Start-up positions are meaningless defaults (Lever shows them as _reported_).
- [x] Extended accessories: get and set → `LAN_X_UNKNOWN_COMMAND` (FW 1.29 < 1.40; Lever refuses).
- [x] Several datasets per datagram: answered, one reply datagram each. Three requests in separate
      back-to-back datagrams: all answered (once, in the first probe, one of two was not).
- [x] `Q=1` accepted (reply as with `Q=0`).
- [x] **Pacing (LOAD-2), 2026-11-18:** a route of six olten turnouts and signal 803 (21, 15, 32,
      3, 803, 14, 1), thrown one after another with a 150 ms pulse and a **150 ms** gap, then a
      **75 ms** gap, and put back: six distinct clicks at 75 ms (the user listened), signal 803
      seen changing, and the DR5000 reported every new position. **75 ms is reliable** on the club
      layout (route of 7 in 1.6 s instead of 2.1 s); the default stays 150 ms, the club can set
      _Pause between accessory commands_ to 75–100. In the 150 ms run two activate replies (#32,
      #14) were lost while another client was polling, yet the turnouts had moved; a later
      `LAN_X_GET_TURNOUT_INFO` showed them in place (handled by the check before retry).
- [x] Turnout numbering: `FAdr = number − 1` matches (all olten turnouts switched correctly from
      Lever, 2026-11-18). Signals 803/804: the Z21 app's state 0 is **Proceed** (import fixed).

## Z21 app export (.z21 file)

Not documented by Roco. Worked out on 2026-11-18 from the club's export (Z21 app, control station
type `schematic`) by comparing it with the screenshots; read by `src/main/z21File.ts` and
converted by `src/model/z21Import.ts`.

- A `.z21` file is a ZIP: `export/<uuid>/Loco.sqlite` plus PNG images (locos).
- `control_station_pages` (id, position, name), `control_station_controls` (page_id, x, y, angle,
  type, address1–3), `control_station_control_states` (control_id, state 0/1, address1_value),
  `control_station_notes` (text; type 1 = caption, type 2 = small rotated track number placed
  _in_ a track tile), `control_station_routes` + `control_station_route_list` (route buttons and
  their turnout states). Response modules, rails, signals (extended) tables were empty.
- Tiles on a grid, `angle` clockwise from north (0 = N, 90 = E), steps of 45°.

| Type | Tile                     | Geometry                                                      |
| ---- | ------------------------ | ------------------------------------------------------------- |
| 0    | straight                 | angle and its opposite                                        |
| 28   | curve (45°)              | joins angle+135° to angle                                     |
| 24   | sharp curve (90°)        | joins angle to angle+90°                                      |
| 1    | right turnout            | tip opposite angle, straight along angle, diverging 45° right |
| 2    | left turnout             | as 1, diverging 45° left                                      |
| 23   | double slip, one address | one line along angle, the other 45° to its left               |
| 11   | two-aspect signal        | on a straight, facing angle                                   |
| 14   | track end (bar)          | track towards angle+180°; angle points out                    |

- States: **state 0 = straight** (all "straight through" and main-line routes use 0);
  `address1_value` 0/1 = output 1/2, set per turnout (about half the club's turnouts are
  "swapped"). For signals Lever assumes state 0 = Stop (not confirmed).
- A double crossover is drawn as an X in four tiles with no crossing tile.

The checks below need the layout:

- [ ] Output mapping: a turnout imported as "straight = output 1" really goes straight.
- [ ] Signals 803 / 804: Z21 state 0 is Stop (red).

## Club control station PCs

- [ ] Hardware (CPU, RAM, graphics) of the club PCs, for the low-spec performance check (STK-5,
      STK-8).
- [ ] Windows versions in use (10 / 11).
