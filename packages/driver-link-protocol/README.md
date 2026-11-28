# @lever/driver-link-protocol

The Lever ↔ Throttle driver link as code: message schemas (Zod), version and capability handling,
encoding with the datagram size check, chunking and reassembly, reliability helpers (resend with
backoff, de-duplication) and id generation. The design is the contract in `docs/driver-link.md`,
which is the same file in both repositories; this package follows it and adds only the limits listed
under "Wire details".

**Lever holds the master copy.** Throttle copies the package; changes are made here first.

## Rules for the code

- Pure TypeScript. No Node, Electron, React or React Native imports (lint-enforced). The only
  dependency is `zod` (version 4).
- Runs in plain Node 24 with type stripping (`scripts/link-probe.mjs` imports it directly), so:
  - relative imports carry their `.ts` extension (`allowImportingTsExtensions`);
  - type-only imports use `import type`;
  - no enums, namespaces or parameter properties.
- Random numbers and clocks are parameters (`newLinkId(prefix, nowMs, randomBytes)`,
  `Reassembler.add(…, now)`, `ResendQueue.due(now)`), so every function is testable and the
  package needs no platform API.
- Tests use Jest-style globals (`describe`, `it`, `expect`, `it.each`) and nothing
  Vitest-specific, so they run under Vitest in Lever and under Jest in Throttle.

## Contents

| File               | What                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `version.ts`       | `PROTOCOL_NAME`, `PROTOCOL_VERSION`, `relateVersion`                                         |
| `capabilities.ts`  | `CAPABILITIES_V1`, reserved names, `intersectCapabilities`                                   |
| `defaults.ts`      | `LINK_DEFAULTS` (contract section 11), `LINK_LIMITS`                                         |
| `ids.ts`           | `newLinkId`, `isLinkId`, `linkIdTime` (contract section 3)                                   |
| `digest.ts`        | `textDigest`, for `locosDigest` and `linesVersion` (any opaque string would do)              |
| `messages.ts`      | Body schemas for every type, known code lists, `MESSAGE_SCHEMAS`, `partBodySchema`           |
| `codec.ts`         | `envelopeSchema`, `encodeDatagrams` (validates, splits), `decodeDatagram` (never throws)     |
| `chunking.ts`      | `Reassembler`                                                                                |
| `reliability.ts`   | `ResendQueue`, `SeenSequences`, `initialSeq`                                                 |
| `../fixtures/`     | One datagram per JSON file (pretty-printed; sent compact). Run by `__tests__/fixtures.test.ts` |

### Sending

```ts
const datagrams = encodeDatagrams(
  {id: deviceId, ses: lastSessionSeen, seq: nextSeq++, rel: true, ts: Date.now()},
  {type: 'setLine', body: {address: 3, lineId: 'line-pun'}},
  {maxBytes: 1200},
);
// Send each datagram. For a reliable message keep them in a ResendQueue
// under a subject (e.g. `setLine:3`) until the ack for that seq arrives.
```

### Receiving

```ts
const result = decodeDatagram(text, {maxBytes: 1200});
switch (result.kind) {
  case 'message':      // result.message is typed by result.message.type
  case 'part':         // reassembler.add(result.envelope, result.part, now)
  case 'unknownType':  // newer minor version: ignore, but ack it if rel
  case 'versionMismatch': // Lever answers `error versionMismatch`; Throttle shows "update needed"
  case 'notLeverLink':
  case 'tooLarge':
  case 'invalid':      // drop and count
}
```

Process a message only if `seenSequences.firstTime(envelope.id, envelope.seq)`; acknowledge every
reliable message, also a repeated one (its first ack may have been lost).

## Wire details

Unknown values, chunked messages, sequence numbers, `linesVersion`, `lineStatus.stale`,
`directionRequired` and `driverView` without `train` are defined in the contract (sections 5.1,
5.2, 5.3, 6, 9.1, 9.2). The package adds only these limits: names ≤ 100 characters, driver names
≤ 60, ids ≤ 64, short names ≤ 12, DCC addresses 1–10239.

## Copying into Throttle

1. Copy `src/` (with `src/__tests__/`) and `fixtures/` to Throttle, e.g. as
   `src/driverLink/protocol/` and `src/driverLink/protocol/fixtures/`, keeping the relative path
   from the tests to the fixtures (`../../fixtures/` from `src/__tests__/`; adjust the imports in
   `fixtures.test.ts` once if the layout differs).
2. Add `zod` (4.x) to Throttle's dependencies, and `"allowImportingTsExtensions": true` to its
   `tsconfig.json` (Expo's base already has `noEmit`).
3. Do not edit the copy. Report problems so they are fixed here and copied again.
4. Add a `COPIED_FROM.md` next to the copy:

   ```markdown
   # Copied from Lever

   Source: `packages/driver-link-protocol/` in https://github.com/MatteZ02/lever, commit `<hash>`
   (branch `<branch>`). Lever holds the master copy; do not edit this one.

   | What                  | Source                                       |
   | --------------------- | -------------------------------------------- |
   | `*.ts`                | `packages/driver-link-protocol/src/`         |
   | `__tests__/*.test.ts` | `packages/driver-link-protocol/src/__tests__/` |
   | `fixtures/*.json`     | `packages/driver-link-protocol/fixtures/`    |

   ## Differences from the source

   - (none; list any path changes in the test imports here)
   ```

## Lever-only

`src/link/__tests__/protocolInNode.test.ts` checks that plain Node runs the package. Throttle does
not copy it.
