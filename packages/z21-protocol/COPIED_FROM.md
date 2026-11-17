# Copied from Throttle

This package started as a copy of Throttle's protocol layer. It will become a package shared by
both apps when they are integrated (Lever brief, sections 4 and 13). Until then, keep it free of
Lever-specific code and of Node, Electron, React and React Native imports.

| What                        | Source                                                  |
| --------------------------- | ------------------------------------------------------- |
| `src/*.ts` (protocol layer) | `src/protocol/` in https://github.com/MatteZ02/throttle |
| `src/__tests__/*.test.ts`   | `src/protocol/__tests__/`                               |

Source commit: **`789c70e`** (branch `release`, "docs: guides and App Store text for 0.2.1").
`src/protocol/` is unchanged between that commit and `0663ac2`, the newest commit when it was copied
(2026-11-17).

## Differences from the source

- The files were copied unchanged. The tests still use Jest-style globals (`describe`, `it`,
  `expect`); Lever runs them with Vitest's `globals: true`, so they remain valid Jest tests too.
- Additions for Lever (accessories, feedback) are listed below as they are made, so that they can be
  ported back to Throttle or into the shared package.

## Additions since the copy

_None yet (Phase 1 adds accessory and feedback messages)._
