# CLAUDE.md

**Lever** is a Windows desktop control station (interlocking) for a model railway: track diagrams of
the layout, turnouts, signals, occupancy and routes. Electron + React + TypeScript. It talks
**directly** to the central unit (Roco Z21 / z21 / z21 start, DigiKeijs DR5000) over UDP using the
Z21 LAN protocol. No server, cloud, accounts or telemetry. Companion to **Throttle** (mobile driving
app), which must keep working without Lever.

- Requirements: `CONTROL_STATION_PROMPT.md` (the project brief; local only, gitignored).
- Architecture and data model: `docs/architecture.md`.
- Protocol: `docs/reference/z21-lan-protokoll-en_1.13.pdf` is the source of truth;
  `docs/reference/z21-protocol-notes.md` is the navigation aid (copied from Throttle, extended here).
- Hardware findings and the "verify on DR5000" list: `docs/hardware-notes.md`.
- For members: `README.md`, `docs/install-en.md`, `docs/install-fi.md` (Finnish written natively),
  `docs/user-guide.md`. Keep the install guides in step with UI labels (Lever's UI is English).
- Throttle's repository is cloned at `D:\GitHub\aaltoenergia\ar-z21` (not `../throttle`). Read its
  `CLAUDE.md` for hardware findings. Reference commit for copied code: `789c70e`.
- If the spec is ambiguous, or hardware behaves differently from it, tell the user; do not silently
  work around it.

## Status

| Phase | Content                                                               | State                                                                                                                                                                      |
| ----- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Setup, process model, theme, lint, protocol package, packaged app     | done on Windows 10 against Z21Sim; approved 2026-11-17; Windows 11 and low-spec check pending (user)                                                                       |
| 1     | Dummy-server probe, accessory/feedback protocol, accessory queue      | done against Z21Sim (incl. two engines, MULTI-1) and the fake Z21 (feedback); z21 start protocol test pending (user connects it)                                           |
| 2     | Project files, single-view editor, validation, test mode              | done; verified with UI automation against the fake Z21 (test buttons send the right bytes); awaiting user review and layout test                                           |
| 3     | Operating mode Level 1, feedback monitor, areas                       | done; verified with UI automation against the fake Z21 (throw, aspect menu, manual turnout, occupancy, train label); awaiting user review                                  |
| 4     | Several views, multiple windows, full layout view, station connectors | done; verified with UI automation (drag/scale panels, pairing, following an exit, a second window throwing a turnout via the fake Z21); window restore needs a manual test |
| 5     | Level 2 routing, mixed-level tests                                    | done; scenario tests incl. mixed Level 1/2; end-to-end with the fake Z21 (set, signals, broken by an external switch); awaiting user review on the layout                  |
| 6     | Packaging, documentation (fi/en)                                      | done: release build checked (installer + portable zip, unsigned); README, install guides fi/en (Finnish to be reviewed by the user), user guide; not published             |

Local-only reference material (gitignored, never commit): the spec PDF, the Z21 control-station
screenshots (`Z21_control_station_*.PNG`: olten, inselburg-dettingen, Sissach), the JuliaData
screenshot (style reference for diagrams), a `.z21` export (an **old demo layout**, not our
stations), and the brief.

Decisions by the user (2026-11-17):

- Branches: `release` is the main branch and changes are committed **directly to `release`** (as in
  Throttle). The user does all pushing.
- Dummy server: **Z21Sim in Docker** (see `docs/development.md` for the restart pitfall).
- Topology: draft the three stations from the screenshots with addresses left blank; addresses and
  the missing _dettingen_ page come later.
- **Esc always means STOP**, except while typing in a text field. Dialogs never close with Esc.
- Data model in `docs/architecture.md` approved; project files use the extension **`.lever`**.
- Layout facts (sample project): olten has no tracks 5–6 (named after the real Olten); its bottom
  tracks are the main-line passing tracks, joined to the station exits by an undrawn spiral;
  **double slips use one address** that switches both ends together; _Pun_/_Kel_ (_Punainen_ /
  _Keltainen_) are the red and yellow main lines. Details: `docs/architecture.md` section 6.

## Commands

```sh
npm run dev         # Electron with hot reload
npm test            # Vitest
npm run lint        # ESLint + CSS colour check
npm run typecheck   # tsc (node + web projects)
npm run dist        # NSIS installer + portable zip in release-builds/<version>/
npm run dist:dir    # unpacked app only (quicker)
```

Shell pitfalls on this PC (see `docs/development.md`): run tests from `D:\GitHub\lever` with a
**capital** drive letter, or Vitest loads twice. Claude's shell has `ELECTRON_RUN_AS_NODE=1`; unset
it to start Electron or `Lever.exe`. **Never take screenshots of the screen or send OS-level
keystrokes**: the user may be using the PC. To check the UI, use the development-only automation
(`src/main/uiAutomation.ts`): `LEVER_UI_SCRIPT=steps.json LEVER_UI_OUT=dir npx electron .` after
`npx electron-vite build`. It runs Lever hidden with its own user data, sends input events to
Lever's page only and captures the page (`capturePage`), never the screen. Pitfalls: wait ~0.5 s
(or capture) after a mode switch before clicking (hit testing lags in a hidden window); hidden
windows do not focus inputs, so text fields cannot be typed into (load a prepared `.lever` via
`lastProjectPath` in the automation's `userData/settings.json` instead); timers are throttled, so
measure work with `{"metrics": …}` steps, not frame times.

## Architecture (keep the layers separate)

```
packages/z21-protocol/  PURE protocol encode/decode, copied from Throttle (COPIED_FROM.md).
                        No Node/Electron/React imports (lint-enforced). Lever additions are
                        listed in COPIED_FROM.md so they can go back into a shared package.
src/main/               Electron main: windows, menu, IPC, settings.json, EngineHost (starts the
                        engine utilityProcess, brokers one MessagePort per window, restarts it on
                        crash), security policy. No single-instance lock (MULTI-5).
src/main/project/       ProjectDocument (the open .lever: atomic writes, autosave 1.5 s,
                        backups, lock file → read-only, migration backup, recovery for
                        untitled), projectController (File menu dialogs), lockFile, backups.
                        Main owns the document; windows send whole projects (validated).
src/main/uiAutomation.ts  Dev-only hidden-window UI automation (see pitfalls above);
                        {"window": n} drives another window.
src/main/windows.ts     WindowManager: several windows, each showing a station or a layout view
                        (target in the URL hash), saved and reopened (settings.windows).
src/main/z21File.ts     Reads a Z21 app .z21 export (zipReader.ts + node:sqlite) for the pure
                        importer src/model/z21Import.ts (File → Import from Z21 app).
src/main/turnoutPositions.ts  Last known turnout positions per project (ACC-4), in user data,
                        never in the .lever (engine reports them over parentPort).
src/preload/            contextBridge API `window.lever` (types in api.ts). Holds the raw port.
src/engine/             utilityProcess entry (index.ts) + Engine (no Electron imports; tested).
src/connection/         ConnectionManager (from Throttle, see COPIED_FROM.md; runtime broadcast
                        flags), Node dgram transport (ephemeral port), AccessoryQueue (LOAD-2),
                        FeedbackTracker (R-Bus/LocoNet/CAN → one input-state shape).
src/model/              PURE: project.ts (schema v2, .lever), migrations.ts, elements.ts,
                        geometry.ts (grid, 8 directions), ports.ts (turnout legs/positions —
                        one source for drawing and routing), signalTypes.ts (built-in
                        templates), centralUnitProfile.ts (EVERYTHING that may differ on the
                        DR5000: offset, straight output, pulse, gap, Q mode, confirmation),
                        accessoryCommands.ts (element + position → FAdr/output/pulse),
                        topology.ts (derived graph; project graph joined at paired exits),
                        connectors.ts, arrangement.ts (layout views: frames and lines),
                        routing.ts (route finding, ROUTE_WEIGHTS), routeSignals.ts (RTE-5 rules), validation.ts, addressTable.ts,
                        editing.ts (pure edit ops), placement.ts.
src/interlocking/       PURE: Interlocking.ts (Level 1 live state: positions/aspects from outputs,
                        confirmation timeout + one retry, blocks with release delay, train
                        labels, ACC-4 restore), routes.ts (Level 2 routes: set, broken,
                        release, undo), levels.ts (per-level command checks),
                        accessoryState.ts (commanded vs reported).
src/shared/             PURE: engine API (Zod, versioned), settings schema, feedback types,
                        strings.ts + strings.fi.ts (UI text), language.ts.
scripts/z21-probe.mjs   Raw protocol probe with 3 clients; run on Z21Sim, z21 start, DR5000.
scripts/fake-z21.mjs    TEST-ONLY fake central unit with feedback emulation (Z21Sim has none);
                        `npm run fake-z21` (UDP 21107) or imported by tests. Independent of
                        packages/z21-protocol on purpose. Types: fake-z21.d.mts.
src/renderer/theme/     palette.ts, colors.ts (light/dark tokens incl. diagram), diagram.ts
                        (line patterns), tokens.ts. Exposed as CSS variables.
src/renderer/src/       React app; Zustand stores (engineStore mirrors engine events,
                        projectStore = working copy + undo/redo + selection/tools/viewports);
                        diagram/ (SVG shapes and DiagramView, shared by operate and edit);
                        editor/ (canvas, toolbox, properties, problems, address table, test
                        mode, keys); operate/ (OperateCanvas, useOperateActions,
                        FeedbackMonitor, AreasPanel); full/ (layout views: ViewCanvas,
                        ViewToolbox, ViewPanel, viewEdits); components/ColorPicker.tsx;
                        Workspace.tsx (layout); safety/shortcuts.ts.
samples/alppirata.lever  olten, inselburg-dettingen, Sissach, imported from the club's Z21 app
                        export (real addresses); edited in Lever now; a test keeps it clean.
scripts/make-stress-project.mjs  Large layout for performance checks (docs/performance.md).
```

Entry points: `src/main/index.ts`, `src/engine/index.ts`, `src/preload/index.ts`,
`src/renderer/src/main.tsx`. Main applies settings to the engine (connect, protocol log); renderers
send engine commands (STOP, power, accessories, feedback sources) straight over their port. The
engine API addresses accessories by **FAdr**; converting a displayed Roco number (+ project offset)
is the model's job (`accessoryCommands.ts`). `DeveloperPanel.tsx` ("Accessory test" drawer) stays
as a low-level tool. Grid rule for drawings: neighbouring tracks two rows apart, so a crossover fits
with 45° legs (turnout legs are one grid step).
`src/engine/__tests__/liveCentralUnit.test.ts` runs two engines against real hardware when
`LEVER_Z21_HOST` is set (skipped otherwise).

## Rules that matter

**Safety:**

- STOP (`LAN_X_SET_STOP`) and track power bypass every queue and work at every level, also when
  other parts are busy or failing. STOP does not reset the interlocking (CARRY-2).
- No confirmation on STOP. Status is never shown by colour alone.
- Quick keys, the STOP key included, are off while the Settings panel is open (user decision, so
  keys can be recorded there); the on-screen STOP button always works.
- Displayed state never claims more than the central unit reported (ARC-2, MULTI-3).

**Protocol and load (shared with up to 10 Throttles):**

- Broadcast flags: `0x00000001` plus only the configured feedback sources. **Never `0x00010000`.**
  Re-send flags after every (re)connect.
- All accessory commands go through one rate-limited queue (LOAD-2), `Q=0`, activate → pulse →
  deactivate → gap. Startup queries go through it too. No polling loops; keepalive after ~25 s idle.
- Optional requests (HWINFO, GET_CODE, …) time out with a fallback; features needing newer firmware
  (extended accessories: FW 1.40) are behind version checks. The test z21 start runs FW 1.33.
- Always split received datagrams into all datasets.

**Code:**

- TypeScript strict. Readable and conventional over clever. Few dependencies; renderer-only
  packages are devDependencies (Vite bundles them), only `zod` is a runtime dependency.
- Zod validates persisted data and every message crossing a process boundary.
- Colours only via theme tokens (`color.x` in TS, `var(--color-x)` in CSS). Lint fails otherwise.
  Fixed diagram meanings: occupied = solid red, set route = dashed green (LOOK-2).
- All user-visible strings in `src/shared/strings.ts` (English) and `src/shared/strings.fi.ts`
  (Finnish, same shape; the user reviews the Finnish). Add every new string to both. The language
  is a setting; windows reload when it changes.
- Pure logic gets Vitest tests; protocol tests use byte-exact values from the spec; safety logic
  uses "given / when / then" scenario tests.
- Prettier: single quotes, semicolons, `bracketSpacing: false`, 2 spaces, LF. Import order without
  blank lines, alphabetised.

**Git:** small logical commits on `release`. Do not push. Never commit signing material or the
local reference files.
