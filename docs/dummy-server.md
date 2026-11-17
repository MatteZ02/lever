# Dummy server: Z21Sim

What the dummy Z21 server supports, found by probing it (0.3 in the brief). The same probe runs
against real hardware, so results can be compared line by line:

```sh
node scripts/z21-probe.mjs [host] [port] [--switch-address=<FAdr>]
```

It uses three clients (A and B with basic + all feedback flags, C with the basic flag only), switches
one accessory both ways, sends extended-accessory and feedback requests, and logs everything
received. Setup of the container: [development.md](development.md#testing-against-the-dummy-z21-server).

## Result (2026-11-17)

Z21Sim in Docker (`z21sim-webui`, container `z21sim-lever`), probed from the same PC.

| Capability                                     | Z21Sim                                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                                       | `LAN_GET_HWINFO`: hardware `0x201` (black Z21, 2013), FW **1.43**. (Throttle saw `0x204` on 2026-10-31.)                                  |
| Broadcast flags                                | Stored and read back exactly (`0x08080003`).                                                                                              |
| `LAN_X_GET_TURNOUT_INFO`                       | Answers. Never-switched address: `ZZ=00` ("not switched yet").                                                                            |
| `LAN_X_SET_TURNOUT`, `Q=0`                     | Works. **`LAN_X_TURNOUT_INFO` is broadcast on activate** to every client with flag `0x1`, including the sender. Deactivate sends nothing. |
| `LAN_X_SET_TURNOUT`, `Q=1`                     | Accepted, same behaviour.                                                                                                                 |
| Activate without deactivate                    | Position reported at once; nothing happens later (no auto-off is visible over LAN).                                                       |
| Extended accessories (`0x54` / `0x44`)         | Supported. Unknown address: value 0, status `0xFF` ("data unknown"). After a set: broadcast `LAN_X_EXT_ACCESSORY_INFO` to every client.   |
| Broadcasts to other clients (MULTI-1, MULTI-8) | **Yes**: a change made by A or B reaches A, B and C within the same millisecond.                                                          |
| Several clients at once                        | Yes (three tested).                                                                                                                       |
| Several datasets per datagram                  | Accepted; each answered (as separate datagrams).                                                                                          |
| R-Bus feedback (`LAN_RMBUS_GETDATA`)           | **No reply.** No `LAN_RMBUS_DATACHANGED` either.                                                                                          |
| LocoNet detectors (`LAN_LOCONET_DETECTOR`)     | **No reply.**                                                                                                                             |
| CAN detectors (`LAN_CAN_DETECTOR`)             | **No reply.**                                                                                                                             |
| Unsolicited messages while idle                | None.                                                                                                                                     |
| Emergency stop / power / status                | As documented by Throttle (`docs/reference/z21-protocol-notes.md`, 7a).                                                                   |

Raw output of the run: see the commit that added this file, or run the probe again.

## Consequences for testing Lever

- **Accessories, turnout state, extended accessories and multi-client mirroring** can be tested
  against Z21Sim, including the two-instance check (MULTI-1).
- Z21Sim confirms a position on **activate**, so it cannot show whether Lever's deactivate timing is
  right; check that in the protocol log and on the z21 start.
- **Feedback cannot be tested against Z21Sim** over the protocol, unless its window (web UI on
  port 6080) has a feedback simulation that was not switched on. Workaround proposed: a small
  test-only Z21 responder in this repository (`scripts/`), which answers the same subset and can
  report feedback inputs on request. Waiting for the user's decision.
