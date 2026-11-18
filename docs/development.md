# Development guide

How to set up, run, test and release Lever. Architecture and conventions are in
[CLAUDE.md](../CLAUDE.md) and [architecture.md](architecture.md).

## Setup on Windows

1. Install **Node.js 24** (LTS) and Git.
2. In the repository, run `npm ci`.
3. Open a terminal **in `D:\…` with a capital drive letter** (a normal PowerShell or Windows
   Terminal does this). In a shell that reports the folder as `d:\GitHub\lever`, Vitest loads two
   copies of itself and every test file that imports `vitest` fails with
   _"Cannot read properties of undefined (reading 'config')"_.

## Running

```sh
npm run dev         # Electron with hot reload
npm test            # Vitest: protocol, connection, engine, safety logic
npm run lint        # ESLint (Prettier as warnings) + CSS colour check
npm run typecheck   # tsc for the Node side and the renderer
```

If the app starts and exits at once, or `electron --version` prints a Node version, the
environment variable `ELECTRON_RUN_AS_NODE` is set (VS Code's integrated terminals for extensions
set it). Remove it for that terminal: `Remove-Item Env:ELECTRON_RUN_AS_NODE` (PowerShell) or
`unset ELECTRON_RUN_AS_NODE` (bash).

Settings are stored in `%APPDATA%\Lever\settings.json`. Delete the file to return to the defaults.
Several copies of Lever can run at once, also on one PC; each one is a separate client to the
central unit.

## Testing against the dummy Z21 server

The dummy server is **Z21Sim** in Docker (image `z21sim-webui`): UDP 21105–21106, and its window
in the browser at <http://localhost:6080>. Start it with:

```powershell
docker run -d --name z21sim-lever -p 21105:21105/udp -p 21106:21106/udp -p 6080:6080 z21sim-webui
```

Then set the central unit to `127.0.0.1`, port `21105`, in Lever's settings.

**Restarting an old container does not work:** `docker start` on a stopped Z21Sim container makes
it crash at once with _"Could not load the Qt platform plugin xcb"_ (most likely a stale X display
lock left from the previous run). Remove the container and create a new one with the command
above instead. What Z21Sim supports is documented in [dummy-server.md](dummy-server.md) (Phase 1).

### A real Z21 connected to the PC

A Z21 central unit has the fixed address `192.168.0.111` from the factory. If the PC is on another
network, give its Ethernet adapter a second address in the Z21's network (PowerShell as
administrator):

```powershell
netsh interface ipv4 set interface interface="Ethernet" dhcpstaticipcoexistence=enabled
netsh interface ipv4 add address "Ethernet" 192.168.0.50 255.255.255.0
```

To undo it:

```powershell
netsh interface ipv4 delete address "Ethernet" 192.168.0.50
netsh interface ipv4 set interface interface="Ethernet" dhcpstaticipcoexistence=disabled
```

### What to look for in the protocol log

Turn on **Settings → Protocol log**. `>>` is sent, `<<` is received, `--` is an info line.

- On connect, the first datagram is `08 00 50 00 01 00 00 00 07 00 40 00 21 24 05`: broadcast
  flags plus a status request.
- Lever counts as **connected only after the first reply**.
- When idle, a keepalive (`07 00 40 00 21 24 05`) is sent about every 25 s.
- On quit, Lever sends `04 00 30 00` (logoff) before closing.
- Switching an accessory: activate (e.g. `09 00 40 00 53 00 04 89 DE`), then after the pulse
  (150 ms) deactivate (`… 81 D6`), then at least 150 ms before the next accessory command.

### Testing accessories and feedback without a layout

Until the track diagrams exist, the **Accessory and feedback test** panel in the main window
switches one accessory by its number in the Roco app (output 1 / output 2), asks its position, and
lists what the central unit reports, including changes made from other apps. It can also switch on
feedback sources (R-Bus, LocoNet, CAN) and lists occupied inputs.

Two copies of Lever, or Lever and the Roco app, should show each other's switching at once.

**Feedback:** Z21Sim does not emulate feedback. Start the test-only fake Z21 instead
(`npm run fake-z21`, UDP 21107; see [dummy-server.md](dummy-server.md#fake-z21-for-feedback-test-only)),
set Lever's central unit to `127.0.0.1` port `21107`, tick the feedback sources in the test panel,
and type e.g. `rbus 3 2 on` in the fake's window. The input appears as occupied in Lever.

Protocol-level tools, which also work against real hardware (see
[hardware-notes.md](hardware-notes.md)):

```powershell
node scripts/z21-probe.mjs 127.0.0.1 21105        # raw probe with three clients
$env:LEVER_Z21_HOST = '127.0.0.1'                 # two Lever engines against a live unit
npx vitest run src/engine/__tests__/liveCentralUnit.test.ts
Remove-Item Env:LEVER_Z21_HOST
```

## Sample and test layouts

- `samples/club-layout.lever`: the club's stations, imported from the Z21 app export with
  File → Import from Z21 app (2026-11-18), then saved. The file is the source now; edit it in
  Lever. `src/main/project/__tests__/sampleProject.test.ts` keeps it free of open ends and stray
  junctions (two known exceptions are listed there).
- `node scripts/make-stress-project.mjs stress.lever 12`: about 5,300 elements, for performance
  checks ([performance.md](performance.md)).

## UI automation (development only)

`src/main/uiAutomation.ts` runs Lever in a hidden window and plays a list of steps: clicks and keys
sent to Lever's page (not to Windows), button clicks by text, JavaScript, page captures and
main-thread metrics. It uses its own user data folder and never touches the screen.

```powershell
npx electron-vite build
$env:LEVER_UI_SCRIPT = 'steps.json'; $env:LEVER_UI_OUT = 'out-ui'; npx electron .
```

Example `steps.json`:

```json
[
  {"clickText": "Edit layout"},
  {"wait": 500},
  {"key": "t"},
  {"click": [48, 48], "relativeTo": ".diagram"},
  {"click": [336, 48], "relativeTo": ".diagram"},
  {"click": [336, 48], "relativeTo": ".diagram"},
  {"capture": "track.png"}
]
```

To test against a prepared layout, write `out-ui/userData/settings.json` first with
`lastProjectPath` (and `centralUnit` pointing at the fake Z21). Text fields cannot be typed into in
the hidden window. It is disabled in packaged builds.

## Building a release

```powershell
npm run dist        # out/ → release-builds/<version>/
```

This produces, for Windows x64:

- `Lever-<version>-setup-x64.exe`: the installer (NSIS; per user, no administrator rights needed);
- `Lever-<version>-portable-x64.zip`: unzip anywhere and run `Lever.exe`.

`npm run dist:dir` builds only the unpacked app (`release-builds/<version>/win-unpacked/`), which
is quicker for testing. Set the version in `package.json` (0.x while in development), then attach
both files to a GitHub release with the tag `v<version>`. There is no auto-updater (DST-2).

### Code signing

Builds are unsigned, so Windows SmartScreen shows "Windows protected your PC" on first start
(members click **More info → Run anyway**; see the install guides). To sign later, add the
certificate to `win` in `electron-builder.yml` (for example `signtoolOptions.certificateSubjectName`
for a certificate in the Windows certificate store); no code changes are needed.

## Upgrading Electron

Electron supports the latest three major versions, and a new major comes about every 8 weeks.
Upgrade at least every second major:

1. Check the [release notes](https://releases.electronjs.org/) for breaking changes in
   `utilityProcess`, `MessageChannelMain`, `contextBridge`, sandboxing and `webRequest`.
2. `npm install --save-exact electron@<version>`; check that electron-vite and electron-builder
   support it (`npm view electron-vite peerDependencies`), and upgrade them if needed.
3. Run `npm run typecheck`, `npm run lint`, `npm test`.
4. `npm run dist:dir`, start `Lever.exe` against Z21Sim, and check: it connects, STOP (Esc) works,
   the protocol log fills, quitting sends the logoff.
5. Commit the upgrade on its own.

Keep the dependency list short; each dependency makes upgrades slower.

## Changing colours

All colours are defined in [`src/renderer/theme/`](../src/renderer/theme/). Components never
contain colour values: inline styles and SVG use `color.<token>` from the theme, and stylesheets use
`var(--color-<token>)`. `npm run lint` fails on a colour written anywhere else, in TypeScript or CSS.

| File         | What it contains                                                         | When to edit it                         |
| ------------ | ------------------------------------------------------------------------ | --------------------------------------- |
| `palette.ts` | The raw colour values (`red700: '#C62828'`, …)                           | To change a shade everywhere it is used |
| `colors.ts`  | Semantic tokens for light **and** dark mode, pointing at palette entries | To change what a part of the app uses   |
| `diagram.ts` | Line widths and dash patterns for track states                           | To change how a state is drawn          |
| `tokens.ts`  | Spacing, corner radii, font sizes, minimum target size                   | Sizes                                   |

Example, a darker STOP button in both modes: in `colors.ts` set `stopButton: palette.red800` in
both `lightColors` and `darkColors`. For a new colour, add it to `palette.ts` first.

Rules:

- **Occupied track is always red and solid; a set route is always green and dashed** (LOOK-2).
  Shades may change, but they must stay recognisably red and green, and the solid/dashed
  difference must stay, because some members are colour-blind.
- Text on a status or STOP colour uses its matching text token. Keep a contrast ratio of at least
  4.5:1 for text and 3:1 for indicators.
- Never rely on colour alone: every status also has text, an icon or a line pattern.
