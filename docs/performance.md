# Performance (STK-8)

Track diagrams are SVG. This file records how that performs with a large layout, so the decision
"SVG, not canvas" can be revisited with data.

## How to measure

```sh
node scripts/make-stress-project.mjs stress.lever 12    # one view, ~5,300 elements
```

Open it in Lever and zoom, pan, select and drag. For numbers without touching the screen, the
development-only UI automation (`src/main/uiAutomation.ts`) can run Lever hidden, zoom with the
mouse wheel and print the renderer's main-thread work (`{"metrics": "label"}` steps, DevTools
Performance metrics).

## Results (2026-11-17, development PC: Ryzen 7 3700X, Windows 10)

Layout with **5,328 elements** (1,152 turnouts, 1,152 signals, 1,728 tracks, 1,152 buffer stops,
144 labels):

| Action                                  | Main-thread work                  |
| --------------------------------------- | --------------------------------- |
| Operating mode, 40 zoom steps           | 184–200 ms in total (≈ 5 ms each) |
| Entering edit mode (incl. validation)   | ≈ 330 ms once                     |
| Edit mode, 40 zoom steps                | ≈ 410 ms in total (≈ 10 ms each)  |
| Validating the whole project (per edit) | 44 ms (topology 15 ms)            |
| Address table                           | 2 ms                              |

At normal speed zooming runs at the full 60 frames per second. Most of the remaining time is the
browser's own SVG layout and painting; Lever's script time per zoom step is under 1 ms, because
the element layer is not re-rendered when only the viewport changes.

Changes made because of these measurements:

- The diagram's element layer is memoised, so zooming and panning only change the `viewBox`.
- Only the canvas follows the viewport; the rest of the window does not re-render while zooming.
- Validation runs once per change, only in edit mode, and at low priority (`useDeferredValue`):
  the drawing updates at once, the problem list a moment later.

## Low-spec hardware: still to check

A club PC may be 3–5 times slower than the development PC. Estimated from the table: zooming
≈ 15–25 ms per step in operating mode (smooth), 30–50 ms in edit mode, and ≈ 150–250 ms of
validation after each edit of a very large layout. The real club layouts are far smaller (the
three drafted stations have about 270 elements together).

Measuring with CPU throttling in a hidden window did not give usable numbers (Chromium throttles
hidden windows' timers to about one per second), so **the check on a real club PC is still
open**: open the stress layout there, and zoom, pan and drag. If it feels sluggish, note the PC's
CPU and RAM in `docs/hardware-notes.md`.

SVG is therefore kept. Switching to canvas is not needed for the club's layouts.
