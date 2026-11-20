# Lever architecture

> **Status: approved by the user on 2026-11-17** (data model, project file extension `.lever`).
> Sections marked _proposed_ are not built yet.
> Requirement IDs (STK-4, LOOK-1, …) refer to the project brief.

## 1. Processes

```
┌──────────────── main process ────────────────┐
│ windows, menus, dialogs, files, settings      │
│ brokers one MessagePort per window ──────┐    │
└──────────────┬────────────────────────────┼───┘
               │ parentPort (control)       │ MessagePort per window
┌──────────────▼──────────────┐   ┌────────▼────────────────────┐
│ engine (utilityProcess)      │◄─►│ renderer (one per window)   │
│ connection: UDP, keepalive,  │   │ React UI, SVG diagrams,     │
│   accessory queue            │   │ editor; mirrors engine      │
│ interlocking: live state,    │   │ state in Zustand; never     │
│   levels, routes             │   │ decides interlocking logic  │
└──────────────┬──────────────┘   └─────────────────────────────┘
               │ UDP 21105 (ephemeral local port)
          central unit
```

- **Engine in a `utilityProcess`** (STK-4), as briefed. STOP goes renderer → MessagePort → engine →
  UDP, never through the main process, so a busy main process or another window cannot delay it.
  If the engine crashes, the main process restarts it and gives every window a new port
  (`src/main/engineHost.ts`). No reason to deviate was found.
- **Renderers are sandboxed** (`contextIsolation`, `sandbox`, no Node). The preload keeps the raw
  port and exposes a small typed API (`window.lever`). Navigation, new windows, permissions and all
  network requests are blocked; the Content-Security-Policy is strict in builds.
- **Engine API** (`src/shared/engineApi.ts`, ARC-1): versioned, JSON-safe commands and events,
  validated with Zod at every receiving end. The same messages can later go over a WebSocket
  (Throttle integration, area ownership).
- **Several windows** (Phase 4, VIEW-2/ARC-3): `src/main/windows.ts`. A window shows a target
  (`view:<id>` or `full:<arrangementId>`, `src/shared/windowTarget.ts`), given in its URL hash
  and reported back when it changes. Each window has its own engine port and its own working copy
  of the project (edits go through the main process, as before). The engine refreshes positions
  for the union of stations shown in all windows (`showViews`). Windows open at quit are saved in
  `settings.windows` and reopened where they were. The first window has the full interface;
  "New window" opens a **plain** window (hash prefix `plain;`, `PlainWorkspace.tsx`): only the
  diagram and the station picker, always operating, no menu (user, 2026-11-18). Closing a plain
  window closes it; closing the main window quits.
- **Several instances**: no single-instance lock, an ephemeral UDP port per instance (tested), and
  settings written atomically and only on change (MULTI-5). Project lock files come in Phase 2.

## 2. Folder structure

```
packages/z21-protocol/   pure protocol encode/decode, copied from Throttle (COPIED_FROM.md);
                         no Node/Electron/React imports (enforced by lint)
src/
  main/                  Electron main: windows, menus, IPC, settings file, engine host
  preload/               contextBridge API (api.ts = the types renderers see)
  engine/                utilityProcess entry + Engine (wires connection ↔ interlocking ↔ ports)
  connection/            ConnectionManager (from Throttle), Node dgram transport, accessory
                         queue (Phase 1), feedback sources (Phase 1)
  model/                 PURE: project schema (Zod), diagram model, topology builder, migrations
  interlocking/          PURE: live state, level modules, routing, signal rules
  shared/                PURE: engine API, settings schema, strings (CON-4)
  renderer/
    index.html
    theme/               palette, semantic tokens (UI + diagram), line patterns (CARRY-3)
    src/                 React app: components, views, editor, stores, safety shortcuts
docs/                    user and developer docs; docs/reference/* binaries are gitignored
scripts/                 small Node scripts (CSS colour check; later the test Z21 responder)
```

Lint rules keep `model/`, `interlocking/` and `shared/` free of Electron, React and Node imports,
so all safety logic runs and is tested in plain Node (STK-10, ARC-L2).

## 3. Libraries

Versions were checked on 2026-11-17 and are pinned exactly.

| Purpose     | Choice                                                                                    | Why                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime     | **Electron 45.3.3** (Node 24, current stable)                                             | STK-1. Released 2026-11-16; 45.0.0 was 2026-10-21.                                                                                                      |
| Build       | **electron-vite 6.0.0**, **Vite 8.3.8**                                                   | STK-6. `?modulePath` bundles the utility-process entry.                                                                                                 |
| Packaging   | **electron-builder 26.18.0**                                                              | NSIS + zip targets, signing is config-only (DST-3). Forge offers nothing extra here.                                                                    |
| Language    | **TypeScript 6.0.3**                                                                      | TS 7 (7.0.2) is out, but **typescript-eslint 8.73 supports only `<6.1`**. Upgrade when it does.                                                         |
| UI          | **React 19.3.1**, **Zustand 5.1.0**                                                       | STK-6, STK-9. Bundled into the renderer, so they are devDependencies.                                                                                   |
| Validation  | **Zod 4.6.7**                                                                             | STK-7, STK-11. The only runtime dependency outside the renderer bundle.                                                                                 |
| Tests       | **Vitest 5.1.0**                                                                          | STK-10. Runs Throttle's Jest-style protocol tests unchanged (`globals: true`).                                                                          |
| Lint/format | **ESLint 10.15**, typescript-eslint, `eslint-plugin-import-x`, react-hooks, Prettier 3.10 | Throttle's rules (import order, Prettier as warnings, no colour literals) without Expo's preset. Throttle uses ESLint 9; every plugin here supports 10. |

No other runtime dependencies. Diagrams are plain SVG in React (STK-8); undo/redo, pathfinding
and the grid editor are small enough to write without libraries.

## 4. Data model (built in Phase 2: `src/model/`)

### 4.1 Principles

- The **diagram** is what is stored and edited: elements placed on a **grid of integer points** per
  station view.
- The **topology** (a graph) is **derived** from the diagram by one pure function,
  `buildTopology(project)`, and rebuilt after each edit. Routing, interlocking and validation use
  only topology ids, never drawing positions.
- Grid coordinates are logical units, not pixels. Zoom and the full-view panel scale apply only
  when drawing.

### 4.2 Diagram geometry: lines between grid points

Track is drawn as **polylines between grid points**, with every step horizontal, vertical or 45°
(LOOK-1). A long straight is two points; a curve is a corner. This matches the JuliaData section
view better than one-tile-per-cell (fewer elements, straight lines of any length), and keeps large
layouts small.

```ts
type GridPoint = {x: number; y: number}; // integers
type Direction = 'E' | 'NE' | 'N' | 'NW' | 'W' | 'SW' | 'S' | 'SE';

type TrackSegment = {
  kind: 'track';
  id: string;
  points: GridPoint[]; // ≥ 2; each step is 0°, 45° or 90°
  blockId?: string; // the block / feedback section it belongs to
};
```

Point elements sit on a grid point and have **ports**: named connection points one grid step
away in fixed directions. A segment connects to a port when its end point is on the port's
position. Example, a right-hand turnout pointing east at (10, 4): `tip` at (9, 4),
`straight` at (11, 4), `diverging` at (11, 5).

```ts
type TurnoutKind =
  | 'left'
  | 'right'
  | 'wye'
  | 'threeWay'
  | 'crossing'
  | 'singleSlip'
  | 'doubleSlip';

type Turnout = {
  kind: 'turnout';
  id: string;
  name: string;
  type: TurnoutKind;
  at: GridPoint;
  orientation: Direction; // direction from the tip towards the frog
  control: AccessoryControl; // DCC outputs, or manual (ACC-5)
  positionFeedback?: {
    straight?: FeedbackInputRef;
    diverging?: FeedbackInputRef;
  }; // ACC-3
};

type Signal = {
  kind: 'signal';
  id: string;
  name: string;
  at: GridPoint; // on a track segment
  facing: Direction; // the direction of travel it governs: required (SIG-2)
  side: 'left' | 'right'; // drawing only
  signalTypeId: string; // built-in template or project type (SIG-1)
  outputs: SignalOutputs; // per-aspect accessory commands or extended value
  distantFor?: string; // signal id this distant signal repeats (RTE-5)
};

// Also: bufferStop, virtualPoint, stationConnector, uncoupler/genericAccessory,
// label, platform. Each is a variant of DiagramElement with its own `kind`.
```

Adding an element type means one schema variant, one renderer component and (if it has
track) one port table. Turntables and level crossings fit the same pattern (section 12).

### 4.3 Accessories and addresses

```ts
type AccessoryControl =
  | {kind: 'manual'} // drawn and routed, never commanded
  | {
      kind: 'dcc';
      outputs: AccessoryOutput[];
      invert: boolean;
      pulseMs?: number;
    };

type AccessoryOutput = {address: number}; // address as the Roco app shows it
```

- Addresses are stored **as Roco's tools display them**. The spec (§5) gives Roco's numbering as
  turnout #1 = `FAdr 0`, so `FAdr = address − 1 + project.addressOffset`. The offset (default 0)
  covers a DR5000 that numbers differently (LOAD-5). One conversion function, tested.
- A standard turnout has one output pair, a three-way two, a double slip one or two (ACC-1).
  `invert` swaps output 1 and 2.
- Commands use `LAN_X_SET_TURNOUT` with `Q=0`: Lever's queue sends activate, waits the pulse
  duration, sends deactivate, then waits the gap (spec §5.2.1). Extended accessories are offered
  for signals only on FW ≥ 1.40 (not the z21 start).

### 4.4 Feedback: source-independent

```ts
// Built in Phase 1: src/shared/feedback.ts
type FeedbackInputRef =
  | {source: 'rbus'; module: number; input: number} // module 1-20, input 1-8
  | {source: 'loconet'; address: number} // feedback address
  | {source: 'can'; module: number; port: number}; // module address, port 0-7

type Block = {
  id: string;
  name: string;
  inputs: FeedbackInputRef[]; // empty = no feedback (the normal case today)
  releaseDelayMs?: number; // default from project settings (BLK-3)
};
```

The connection layer (`FeedbackTracker`) turns each source's messages into one shape,
`FeedbackInputState` = `{input, occupied, locos, overload, …}`, and reports only changes. Adding a
source is a project setting (which broadcast flag to subscribe to, which status to ask for), not
code. CAN inputs are identified by the user-set module address and port; the detector's fixed
network id is shown for information.

### 4.5 Topology (derived)

```ts
type TopologyNode = {
  id: string;
  viewId: string;
  at: GridPoint;
  elementId?: string;
};
type TopologyEdge = {
  id: string;
  from: string;
  to: string;
  length: number;
  segmentId: string;
  blockId?: string;
  areaId: string;
};
type Transition = {
  elementId: string;
  fromPort: string;
  toPort: string;
  requires?: {turnoutId: string; position: TurnoutPosition};
  diverging: boolean;
};
```

- Turnouts become **switch nodes with allowed transitions** (tip↔straight, tip↔diverging; slips
  and crossings by table), so a route can only pass leg-to-leg in valid directions (RTE-2).
- Signals and virtual points split an edge and carry their facing direction.
- Paired station connectors join two views with an edge. Unpaired connectors are route end
  points (FULL-3). Built (Phase 4): `buildViewTopology` per view (validation, areas) and
  `buildProjectTopology` for the whole layout, which adds a `link` edge between the nodes of each
  mutual pair (`src/model/connectors.ts`; a one-sided pair is ignored and reported as
  `brokenConnectorPair`). Node ids include the view id, so views never share nodes by accident.
- Routing searches over **directed** edges, so signal directions and reversing rules are simple.
  Cost: `TURNOUT_WEIGHT · turnouts + SIGNAL_WEIGHT · signals + DIVERGING_WEIGHT · diverging moves`
  (named constants, tunable). Exact ties are returned as alternatives for the operator.

### 4.6 Automation areas

```ts
type AutomationArea = {id: string; name: string; level: 1 | 2 | 3 | 4};
```

- Each view has a default area (MIX-1); any element may name another `areaId`. An element with no
  area uses the project default level. `levelOf(elementId)` resolves this once, in `model/`.
- Prepared for ownership (MULTI-7): areas have stable ids, and the engine processes every command
  through `levelOf` and the area, so an `ownerInstance` check can be added in one place later.

### 4.6.1 Layout views (Phase 4, reworked)

`arrangements[]` (FULL-5) are the operator's **views** (called arrangements in code, so they are
not mixed up with `StationView`). A view starts empty; the operator draws **frames**
`{id, viewId, x, y, width, height, rotation}` and **lines** `{id, points}` on it
(`src/model/arrangement.ts`). A frame shows its station fitted inside (`frameTransform`: the
drawing's bounds plus a margin, scaled to fit, centred, turned by quarter turns) and draws the
station's **own grid coordinates** through `translate(x, y) scale(s) rotate(r)`, so editing a
station never moves its frame. A line point is a place on the view or `{frameId, connectorId}`, a
station exit in a frame, resolved when drawn, so lines follow their frames. Frames of deleted
stations are hidden (`arrangementsOf`); deleting a frame or changing its station drops the line
points at its exits. The renderer draws all frames in one `DiagramView` (one SVG, one viewport)
with `ViewLayer` per frame; element ids are unique per project, so hit testing is unchanged. Click
actions are shared with the station view (`useOperateActions`). Schema version 2 introduced this;
the v1 migration turns each old panel `{viewId, x, y, scale}` into a frame around exactly what it
showed, and the automatic lines between linked exits into drawn lines.

### 4.7 Project file

```ts
type Project = {
  schemaVersion: number; // migrations step from N to N+1, each tested (PRJ-5)
  id: string;
  name: string;
  settings: {
    defaultLevel: 1 | 2;
    addressOffset: number;
    feedbackSources: ('rbus' | 'loconet' | 'can')[];
    accessoryGapMs: number; // default 150
    pulseMs: number; // default 150, per accessory override
    blockReleaseDelayMs: number;
    autoSignalsOnRoute: boolean; // RTE-5, default true
    restoreTurnoutsOnStartup: boolean; // ACC-4, default false
  };
  views: StationView[]; // {id, name, elements: DiagramElement[]}
  arrangements: Arrangement[]; // views: {frames: StationFrame[], lines: ViewLine[]}
  areas: AutomationArea[];
  blocks: Block[];
  signalTypes: SignalType[]; // project-defined; built-in templates live in code
  routes: SavedRoute[]; // {id, name, from, to, via?: string[]}
};
```

Saved as pretty-printed JSON (diffable) with the extension **`.lever`** (decided by the user).
Autosave and rotating backups go next to the file in a
`.lever-backups/` folder; settings stay in the user data folder.

Last known turnout positions (ACC-4) are **not** in the project: throwing a turnout must not change
the file. The engine reports positions the central unit confirmed (seen switching; start-up reports
may be defaults) to main over parentPort (`engineReportSchema`); main keeps them per project id in
`turnout-positions.json` in the user data folder. The first time a project is operated in a run
and its setting is on, main sends `restoreTurnouts`; the engine commands them once after
connecting, through the interlocking and the queue, after the start-up queries.

## 5. Interlocking engine (Levels 1 and 2 built)

```ts
interface LevelModule {
  readonly level: 1 | 2 | 3 | 4;
  // May refuse a command for the elements it covers, with a reason the UI can show.
  check?(command: InterlockingCommand, context: LevelContext): Decision;
  // Reacts to central-unit events (turnout moved, block occupied): e.g. RTE-6c.
  onEvent?(event: StateEvent, context: LevelContext): Reaction[];
}
```

- The engine evaluates each element against the modules **up to that element's level**:
  `Level1Module` (direct turnouts, signals, indicative blocks), `Level2Module` (routing: set,
  cancel, release, undo, broken routes), and `Level3Module` / `Level4Module` as interfaces with
  documentation only.
- Live state is reconciled against broadcasts (ARC-2). For each turnout the engine tracks the
  commanded position, the reported position (`unknown` until reported) and its source (central
  unit, operator for manual turnouts, feedback). The display never claims more than that
  (MULTI-3).
- Everything here is pure and deterministic, with an injected clock, and tested as scenarios:
  "given this layout and state, when X, then Y" (ARC-L2, MIX-8).

As built (Phases 3 and 5):

- `src/interlocking/levels.ts`: level modules checking element commands; Levels 3 and 4 are
  documented placeholders and refused.
- `src/model/routing.ts`: route finding over **directed edges** of the project topology
  (stations joined at linked exits). A state is "this edge, in this direction"; the next edge is
  any other edge at its end except another passage of the same turnout, so routes go leg to leg
  and never reverse on the spot. Start signals are left in their facing direction; end signals
  are approached in it. Cost: `ROUTE_WEIGHTS` (turnout, diverging, signal, and a small length
  weight that separates clearly different lengths and rules out circles). Dijkstra keeps every
  equally cheap predecessor, so all tied routes are returned (the operator chooses). Via points
  chain stretches. A plan carries turnout positions, signals passed (facing or not, diverging
  ahead), areas with levels, blocks and polylines to draw.
- `src/model/routeSignals.ts`: all signal aspect rules for a route (RTE-5) in one place.
- `src/interlocking/routes.ts` (`RouteManager`, owned by the `Interlocking`): routes of this
  instance only (MULTI-6). The engine finds the route again from the points sent by a window and
  the chosen alternative's key. States: setting → set; failed; broken. Manual turnouts are recorded
  in the route's position when it is set (no confirmation) and listed in the `routeSet` notice. Every
  turnout change reaches it at once; a set route whose turnout moves sets its signals to stop
  before anything else (RTE-6c). Release, cancel, undo with history (RTE-6b). A route must start
  in a Level 2 area; Level 1 parts are allowed (the window warns first, MIX-4); higher levels
  are refused until built. Level 3 will add checks and locks per segment around this module.

## 6. Our layout

**Since 2026-11-18 the sample is imported** from the user's Z21 app export
(`docs/reference/z21-layout-import_control-station.z21`, local only) with File → Import from Z21
app, so it has the real addresses. The format and how it is read are in
[hardware-notes.md](hardware-notes.md#z21-app-export-z21-file). What the import showed:

- The _dettingen_ page only repeats the four turnouts (201–204) of the double crossover on
  inselburg-dettingen, so it is skipped, as the user decided below.
- The Z21 app draws both double crossovers (Dettingen 201–204, Sissach 309–312) as an X in four
  tiles; Lever draws each as two crossovers in a row with the same connections.
- Sissach has a **yard on the right** (turnouts 316–322, double slip 317) that the screenshot did
  not show. The tip of turnout 316 is open in the Z21 drawing too (to check with the user).
- One olten turnout has address **9999** in the Z21 app (between track 4 and the west crossovers;
  the Z21 routes use it). It is imported without an address (to check with the user).
- The two olten signals are 803 (track 3) and 804 (track 4). The Z21 app's first state is taken as
  Stop; to be tested.
- The 26 Z21 route buttons are not imported (Lever calculates routes, Level 2). Their turnout lists
  are a useful check for the Level 2 router (Phase 5).

The rest of this section is the earlier draft from the screenshots, kept for the user's answers.

Three Z21 control-station pages are available: **olten** (main station: platform tracks 1–4 and
7–12, several crossings or double slips, two signals, exits labelled _Nebenbahn_, _Päärata Pun_,
_Päärata Kel_), **inselburg-dettingen** (tracks 1–4, two return loops on the left, crossings at
the top right) and **Sissach** (four tracks, both main lines through, crossovers each end and a
crossing at the right). No addresses are visible. The Z21 app also has a **dettingen** page with
no screenshot; the user decided to draft the three stations and fill in addresses later. The
older `.z21` export in `docs/reference/` (`z21_layout_import.z21`) is a demo layout and is not
used.

Answers from the user (2026-11-17), for the sample project:

- olten is modelled on Olten (Switzerland). **Tracks 5 and 6 do not exist** on the layout; the
  numbering follows the real station. Draw tracks 1–4 and 7–12 only.
- olten's two tracks at the bottom are the **main-line passing tracks**. In reality they join the
  lines leaving tracks 3–6 and 7–12 through a **spiral** that the Z21 app could not draw (no
  overpasses). In Lever, this connection can be drawn with station connectors (two views, or two
  connectors in the same view), so routing knows about it.
- **Black dots on a crossing = double slip.** All double slips on the layout use **one address**
  that switches both ends together: both routes straight, or both diverging, at the same time.
  So a double slip with one address has two states: _straight_ (A1–B1 and A2–B2 straight through)
  and _diverging_ (both curved routes). The model must allow this one-address mode (ACC-1 allows
  one or two addresses).
- _Pun_ / _Kel_ (_Punainen_ / _Keltainen_, red / yellow) are the colour names of the **two main
  lines**. Exits are named after the line they lead to.

More answers (2026-11-18):

- inselburg-dettingen: the X at the south end is a **double crossover** between the two main
  lines (switching from either to the other). **Dettingen is that crossover** (the Z21 app's
  separate _dettingen_ page); it belongs to inselburg-dettingen. Drawn as two crossovers in a row.
- inselburg-dettingen: the left _Päärata Kel_ is only a note; no track connects there.
- olten: every drawn line exists on the layout; the user corrects inconsistencies in the editor.
- olten: the two signals are **departure signals for tracks 3 and 4 towards the east**.

## 7. Plan

The phases of the brief, unchanged:

| Phase | Content                                                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Setup, process model, theme, lint, protocol package, packaged app connecting to Z21Sim (**this phase**)                                            |
| 1     | Probe Z21Sim → `docs/dummy-server.md`; accessory + feedback protocol with byte-exact tests; accessory queue; two-instance broadcast check          |
| 2     | Project schema + migrations, files, autosave/backups, lock file; single-view editor, validation, address table, test mode; SVG stress test (STK-8) |
| 3     | Operating mode Level 1: turnouts, signals, blocks, feedback monitor, STOP everywhere; automation areas                                             |
| 4     | Several views, multiple windows, full layout view, station connectors                                                                              |
| 5     | Level 2 routing, mixed-level scenario tests                                                                                                        |
| 6     | Packaging, README, install guides (fi/en), user guide                                                                                              |
