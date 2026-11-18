// Line styles for the track diagram (LOOK-1–LOOK-4). Each state has a shape or
// pattern cue as well as a colour, so nothing depends on colour alone.
// Values are in grid-cell units scaled by the stroke width where noted.
//
// | State                            | Colour token          | Pattern                                    |
// | -------------------------------- | --------------------- | ------------------------------------------ |
// | Free track                       | trackFree             | solid, normal width                        |
// | Occupied (LOOK-2, fixed)         | trackOccupied         | solid, wide                                |
// | Route set (LOOK-2, fixed)        | trackRouteSet         | dashes over the track                      |
// | Route being set                  | trackRouteSetting     | the same dashes, moving (animated)         |
// | Route locked (Level 3, later)    | trackRouteLocked      | dashes plus a thin solid centre line       |
// | Route broken (RTE-6c)            | trackRouteBroken      | short dash-dot, with a "!" marker          |
// | Turnout inactive leg (LOOK-5)    | trackInactiveLeg      | interrupted near the switch point, dimmed  |
// | Turnout position unknown         | turnoutUnknown        | both legs interrupted, "?" marker          |
// | Turnout commanded, unconfirmed   | turnoutUnconfirmed    | new leg drawn dotted until confirmed       |
// | Turnout only reported at start   | trackFree             | active leg in fine dashes                  |
// | Turnout failed / mismatch        | trackRouteBroken      | "!" marker                                 |
// | Manual turnout (ACC-5)           | turnoutManual         | hand marker; position text "recorded"      |
// | Unpaired station connector       | connectorUnpaired     | open arrow head (paired: filled)           |
// | Area boundary, per level (MIX-3) | areaLevel1…areaLevel4 | boundary tick with the level number badge  |
//
// Occupied plus set route draws the red line first and the green dashes on
// top, so both stay visible.

export const diagramStroke = {
  // Stroke widths as a fraction of a grid cell.
  track: 0.14,
  trackOccupied: 0.2,
  routeOverlay: 0.1,
  inactiveLeg: 0.1,
} as const;

// SVG stroke-dasharray values, in grid cells.
export const diagramDash = {
  routeSet: '0.45 0.25',
  routeSetting: '0.45 0.25',
  routeBroken: '0.3 0.15 0.05 0.15',
  turnoutUnconfirmed: '0.08 0.12',
  // Position only reported at start-up, not seen switching (z21 start reports
  // output 1 for never-switched turnouts).
  turnoutReported: '0.22 0.1',
  // Gap left in an inactive turnout leg next to the switch point.
  inactiveLegGap: 0.3,
} as const;

// One full cycle of the "route being set" dash movement.
export const ROUTE_SETTING_ANIMATION_MS = 800;
