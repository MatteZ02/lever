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

To check on the z21 start in Phase 1 (with the protocol log):

- [ ] Accessory broadcasts reach a second client (MULTI-1).
- [ ] `LAN_X_TURNOUT_INFO` after power-up reports `ZZ=00` ("not switched yet") until switched.
- [ ] Turnout numbering in the Roco app matches `FAdr = number − 1` (spec §5, option 2).
- [ ] Behaviour when a second activate arrives before the deactivate (must not happen; confirm the
      queue prevents it).

## DigiKeijs DR5000 (club central unit)

No DR5000 documentation is available. Everything below must be **verified on the club's DR5000 with
the protocol log**. Anything that may differ is configurable.

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
