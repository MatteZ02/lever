# Lever

A control station (interlocking) for model railways, for Windows. Lever shows track diagrams of
the layout and lets an operator throw turnouts, set signals, see track occupancy and set routes.
It talks directly to a Z21-compatible central unit over the local network: no server, no cloud,
no accounts, no telemetry.

Lever is the companion to [Throttle](https://github.com/MatteZ02/throttle), the mobile app for
driving trains. Both talk to the same central unit at the same time; each works without the other.
What one does (a turnout thrown, a train stopped) the other sees as far as the central unit
reports it.

**Download:** the installer and the portable version are on the
[Releases](https://github.com/MatteZ02/lever/releases) page. Installation, in Finnish and English:
[docs/install-fi.md](docs/install-fi.md), [docs/install-en.md](docs/install-en.md).

## What it does

- **Track diagrams** of every station, drawn in Lever's editor (straight lines and 45° angles,
  like a signal box panel) or imported from the Roco Z21 app's control station.
- **Live state** from the central unit: turnout positions, signal aspects, occupied track (red),
  set routes (green dashes), with every state also shown by shape, not by colour alone. Lever never
  shows more certainty than the central unit gives: a position only reported at start-up, or not
  reported at all, is shown as such.
- **STOP** (Esc) and track power in every window, always.
- **Full layout view**: all stations on one canvas, each placed and sized freely; stations linked
  at their exits. Any station or the full layout can be opened in its own window, e.g. one per
  monitor.
- **Several control stations** at once (also several on one PC), next to Throttles, the Roco app
  and other software, with all commands paced so the central unit is not flooded.

## Automation levels

Each part of the layout runs at a level. Each level adds to the one below it.

| Level | What it means                                                                                                                                                                                                                                   | State     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **1** | **Manual.** Throw turnouts and set signals one by one; occupancy and train numbers are shown. No automation, no protection.                                                                                                                     | available |
| **2** | **Manual routing.** Click a start and an end; Lever finds the route, throws its turnouts through the queue and sets its signals. If a turnout of a set route moves, its signals go to stop at once. Signals are set by routes only. No locking. | available |
| **3** | **Train protection:** route checks and locking, automatic train stop, block signalling.                                                                                                                                                         | planned   |
| **4** | **Automatic routing and driving.**                                                                                                                                                                                                              | planned   |

**Mixed levels.** Every station is an automation area, and an area can also be part of a station
or the line between stations. Areas can run at different levels at the same time, and the operator
changes an area's level while operating. A route from a Level 2 area may continue into a Level 1
area: Lever warns first, and sets it normally there. Lowering a level never moves turnouts or
changes signals. Each area's level is shown in its view, with its boundaries on the diagram.

Each Lever knows only its own routes; operate each area from one control station at a time.

## Central units

| Central unit                   | Status                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| Roco **z21 start** (FW 1.33)   | tested                                                                                        |
| DigiKeijs **DR5000** (FW 1.29) | tested on the club layout; differences handled (see [hardware notes](docs/hardware-notes.md)) |
| Roco **Z21** / **z21** (white) | expected to work (same protocol); not tested yet                                              |

Differences between central units (address offset, which output means "straight", pulse length,
pacing, how positions are confirmed) are settings of the layout, not code. Extended accessories
need firmware 1.40 or newer.

## Windows

Windows 10 and 11, 64-bit. Tested on Windows 10; light enough for older club PCs. The builds are
not code-signed yet, so Windows shows an "unknown publisher" warning on first start (the install
guides show what to do).

## For developers

Electron, React and TypeScript; the connection and interlocking run in their own process.
[docs/development.md](docs/development.md) (setup, dummy server, building releases),
[docs/architecture.md](docs/architecture.md), [docs/user-guide.md](docs/user-guide.md),
[CLAUDE.md](CLAUDE.md).

Licence: [MIT](LICENSE).
