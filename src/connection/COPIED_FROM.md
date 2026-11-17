# Copied from Throttle

The connection layer follows Throttle's `src/connection/` (REU-4), from
https://github.com/MatteZ02/throttle at commit **`789c70e`** (branch `release`). `src/connection/` is
unchanged between that commit and `0663ac2`, the newest commit when it was copied (2026-11-17).

| Lever file                            | Throttle source                       | Changes                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transport.ts`                        | `transport.ts`                        | Comment only                                                                                                                                                                       |
| `emitter.ts`                          | `emitter.ts`                          | None                                                                                                                                                                               |
| `trackStatus.ts`                      | `trackStatus.ts`                      | Import path (`@lever/z21-protocol`)                                                                                                                                                |
| `nodeUdpTransport.ts`                 | `testUtils/nodeUdpTransport.ts`       | Moved out of `testUtils/`: it is Lever's production transport in the utility process. Import path and comment.                                                                     |
| `testUtils/fakeTransport.ts`          | `testUtils/fakeTransport.ts`          | Import path                                                                                                                                                                        |
| `ConnectionManager.ts`                | `ConnectionManager.ts`                | Loco driving, subscriptions and app suspend/resume removed (Lever has no driving). Added a `message` event for every decoded message and `sendDatasets()` for the accessory queue. |
| `__tests__/ConnectionManager.test.ts` | `__tests__/ConnectionManager.test.ts` | Jest → Vitest timers; loco and lifecycle tests removed; tests for configurable flags and the `message` event added.                                                                |
| `__tests__/udpIntegration.test.ts`    | `__tests__/udpIntegration.test.ts`    | Loco request replaced by a track-power reply; two-client test (MULTI-5) added.                                                                                                     |

Not copied: `driveThrottle.ts`, `subscriptions.ts` (loco driving; needed again from Level 3, when the
engine must know which loco is where) and `nativeUdpTransport.ts` (React Native only).
