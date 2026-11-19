# Lever user guide

> Work in progress. This version covers the layout editor (Phase 2), operating at Level 1
> (Phase 3), the full layout view, station links and several windows (Phase 4), and routes at
> Level 2 (Phase 5).

## Layout files

A layout is one file with the extension `.lever`. **File** menu:

- **New layout**, **Open…**, **Save**, **Save as…**
- **Save a copy…**: writes a copy elsewhere (for sharing or a USB stick); you keep working in the
  open file.
- **Import as new copy…**: opens someone else's layout as a new, unsaved copy, so their file is
  never changed.
- **Import from Z21 app…**: reads a control station exported from the Roco Z21 app (a `.z21`
  file) into a new, unsaved layout: tracks, turnouts with their addresses, double slips, signals,
  exits and notes. Route buttons are not imported, because Lever finds routes itself. Lever then
  lists what it could not take over. Check the result under **Problems** before operating.
- **Restore a backup…**: Lever saves your changes automatically a moment after each edit, and keeps
  automatic backups (at most one every 10 minutes, the last 20) in a `.lever-backups` folder next
  to the layout file. Restoring first backs up the current state, so it can be undone.

Lever never drops unsaved work silently. Before it closes, or before **New**, **Open**, **Import**
or **Import from Z21 app** replace the open layout, it asks to **Save…** a layout that has not been
saved to a file yet; and if the last automatic save of a file failed, it offers **Try again**.
**Cancel** always leaves everything as it was.

Lever reopens the last layout when it starts. If the layout is already open for editing in another
copy of Lever (on this PC or another one on the network share), it opens **read-only** and says
where it is open.

A sample is included: `samples/alppirata.lever`, the club's olten, inselburg-dettingen and
Sissach, imported from the Z21 app with their addresses.

## Operating and editing

The window opens in **Operate**. To change the layout, click **Edit layout**; if the layout has an
edit password, Lever asks for it. While editing, an orange line and the word **EDITING** are shown.
**Esc is always STOP**, also while editing.

Stations appear as tabs. **+ Add station** creates a new one; its name and default automation level
are set in the properties when nothing is selected.

## Operating (Level 1)

In **Operate**, click an element on the diagram:

| Element                   | Click does                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Turnout**               | Throws it to the next position (straight → diverging → …).                                                         |
| **Signal**                | Opens a menu of its aspects (Stop, Proceed, …).                                                                    |
| **Uncoupler / accessory** | Presses it (a momentary button) or switches it on/off.                                                             |
| **Occupied track**        | Lets you type a train number or name, shown on the track while it stays occupied. Needs feedback on that block.    |
| **Manual turnout**        | Records the position you set by hand on the layout (marked **M**). Lever cannot check it; it is "recorded by you". |

The leg a turnout is set to is drawn **yellow** (for a double slip: the X when straight, the two
curves when diverging); the other leg is cut short and dimmed. What the diagram shows never claims
more than the central unit has reported:

| Turnout drawn as              | Meaning                                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| set leg solid yellow          | **confirmed**: seen switching (by Lever, a Throttle or the Roco app) or confirmed by position feedback           |
| set leg in yellow fine dashes | **reported**: only the start-up answer of the central unit; it may be a default, not where the turnout really is |
| set leg dotted                | **commanded**: sent, waiting for the central unit to report it                                                   |
| both legs cut short, **?**    | **unknown**: nothing reported yet (also after the connection was lost), or outputs that fit no position          |
| **!** below the turnout       | **failed** (it did not move, see below) or **mismatch** (position feedback disagrees with the central unit)      |

**DR5000:** the DR5000 does not tell Lever about turnouts switched by other programs (WinDigipet
over USB, the Z21 app, Throttle, another Lever). Set _Central unit settings → Ask for turnout
positions every (s)_ to **10**: Lever then asks for the positions of the station on screen every
10 seconds, and at once when you click something, and shows such changes with that delay. On a Z21
this works without the setting.

When a turnout's report does not arrive within 2 seconds, Lever asks the central unit where the
turnout is. If it has moved, it is shown as set; if not, Lever sends the command once more and
asks again. Only if it still has not moved is it shown as **failed**, in the position the central
unit reports, so the next click sends the right position.

Occupied track is **solid red**. A block stays red for its release delay after its detectors become
free. Status is never shown by colour alone: there is always a pattern, marker or text too.

**Feedback** (top bar) opens the feedback monitor: every detector input in the layout or reported
by the central unit, whether it is occupied, and which block or turnout uses it. Use it to check
wiring.

**Levels** shows the automation areas and their level. You can change a level while operating,
without the edit password. Lowering a level never moves turnouts or changes signals. Level 3 and 4
are not available yet.

**Restore turnout positions on startup** (layout properties, off by default): when Lever opens the
layout, it switches every connected turnout to the last position the central unit confirmed, one
after another through the normal queue. Lever only knows the positions it saw on this PC; manual
turnouts are not touched.

## Routes (Level 2)

Routes are for areas at **Level 2** (switch an area's level under **Levels**). The **Routes** panel
appears at the top right of the diagram, in every window.

1. **New route**, then click where the route starts and where it ends: a signal, a turnout, a
   route point or a station exit, in any station or in the full layout. A signal's menu also has
   **Route from here**. A route leaves a signal in the direction it faces and ends in front of a
   signal facing the train.
2. Lever shows the route dashed on the diagram. It picks the route with the fewest turnouts,
   diverging movements and signals; if several are equally good, choose **Route 1**, **Route 2**,
   …. Turnouts thrown by hand are listed. If part of the route lies in a **Level 1** area, Lever
   says so: it is set normally there, but nothing there is meant to be routed or protected.
3. **Set route**: the turnouts move one after another; the route shows moving dashes until every
   turnout has reported its position. If it has manual turnouts, throw them by hand and press
   **Thrown by hand**. Then the route is **set** (green dashes), and its signals are set: the
   start signal and signals facing the route to proceed (reduced speed before a diverging turnout,
   where the signal has it), signals facing the other way and the end signal to stop; distant
   signals repeat their main signal. (Layout properties: _Set signals along routes
   automatically_.)
4. **Release** returns the route's signals to stop and leaves the turnouts as they are. **Undo
   last route** also puts its turnouts back where they were, except any moved since (Lever says
   which) and manual ones (Lever lists them to put back by hand). A key for undo can be chosen in
   **Settings** (never Ctrl+Z).

If a turnout of a set route moves, for whatever reason (another control station, a Throttle, the
Roco app, a handset, or a click here), the route's signals go to **stop at once** and the route
is shown **broken** (amber). A turnout that does not move makes the route **fail**; **Cancel**
drops it. Level 2 does not lock turnouts or check occupancy (that is Level 3): occupied track
stays red under the green route.

**Save…** keeps a route by name, with its route points; saved routes are listed in the panel, and
clicking the same start and end uses the saved one.

**Several control stations:** each Lever knows only its own routes. Another station's routes
look like turnouts set by someone else, and a turnout thrown by another station can break your
route. Operate each area from one control station at a time.

## Full layout, linked stations and windows

**Full layout** (the first tab when there are several stations) shows every station on one
canvas. It works like a station: click turnouts, signals and tracks as usual; each station shows
its automation level in its title. Double-click a station's title to open it.

To arrange it, switch to **Edit layout** while on **Full layout**: drag a station by its frame or
title, click it and change its **Size**. **Lines between linked exits** draws a dashed line
between stations whose exits are linked. **New arrangement** keeps several arrangements (for
example one per monitor); **Stations below each other** starts over.

**Linking stations:** select a station exit in the editor and choose where it **leads to**: the
exit at the other end of the line, in another station or in the same one (for example the two
ends of a line through a hidden spiral). Lever joins the stations there, so routes can continue
through it, and in operating mode clicking a linked exit opens the other end. Unlinked exits are
normal where the line between stations is not drawn.

**New window** opens what is shown (a station or the full layout) in a plain window, e.g. on a
second monitor: only the diagram and the station tabs, for operating. Editing, settings and track
power stay in the main window. All windows show the same live state, and **Esc is STOP in every
window**. Closing a plain window just closes it; closing the main window quits Lever. When Lever
starts again, it reopens its windows where they were.

## Drawing

| Tool                                                               | How                                                                                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track** (T)                                                      | Click the start, click every corner, then click the last point again (or double-click, or Enter). Track runs straight or at 45°. Backspace removes the last corner. |
| **Turnouts**, crossings, slips                                     | Click where it goes. Dropped onto a drawn line, it cuts the line so the line ends at its legs. R rotates before placing.                                            |
| **Signal**                                                         | Click a point on a track. It faces along the track; R before placing, or **Reverse direction** later, turns it round.                                               |
| **Buffer stop**, **Station exit**                                  | Click the end of a track. A station exit marks where the drawn layout ends (a line to another station or not drawn).                                                |
| **Route point**, **Uncoupler / accessory**, **Text**, **Platform** | Click to place.                                                                                                                                                     |
| **Select** (V)                                                     | Click to select, Shift+click to add, drag to move, drag on empty space to select an area. A selected track shows its corners; drag a corner to move it.             |

Other keys while editing: **R** rotate, **Delete** delete, **Ctrl+C / Ctrl+X / Ctrl+V** copy, cut,
paste (copies get no addresses), **Ctrl+Z / Ctrl+Y** undo, redo, **Ctrl+A** select all, **F** show
all. Mouse wheel zooms; the middle button (or Alt + drag) pans. On a touchpad, drag with two
fingers to move the layout and pinch to zoom; on a touchscreen, pinch to zoom and drag with two
fingers to move (one finger works like the mouse).

## Properties

Select an element to see its properties on the right:

- **Turnouts**: type, and **Connection**: _Not connected_ (thrown by hand), _DCC accessory
  addresses_, or _Extended accessory_ (needs firmware 1.40). Addresses are the numbers the Roco app
  shows; the decoder address and port they end up on are shown below. **Swap outputs 1 and 2** if
  a turnout moves the wrong way. **Outputs per position** changes the mapping completely. Double
  slips can use one address (both ends together) or two.
- **Signals**: type (main signal with 2 or 3 aspects, distant, shunting), side, direction,
  addresses, and for distant signals the main signal they repeat.
- **Track**: the block it belongs to, with feedback inputs (R-Bus module/input, LocoNet address,
  CAN module/port) and the release delay.
- **Area**: every station is one automation area. Add areas (layout properties, **Automation
  areas**) for parts of a station or the line between stations, then choose the area for an
  element, or for several selected elements at once. Area borders are drawn while editing.

Nothing selected: the station, the layout, the **central unit settings** and the **edit password**.

### Central unit settings

These exist so that differences between central units (z21, Z21, DR5000) or wiring can be fixed
without a new version of Lever:

| Setting                          | Change it when                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------- |
| Address offset                   | every turnout is off by the same number (e.g. 4) compared with the Roco app     |
| Output for "straight"            | most turnouts move the wrong way                                                |
| Pulse length                     | turnouts do not move reliably (longer) or coils get warm (shorter)              |
| Pause between accessory commands | several turnouts in a row do not all move                                       |
| Turnout commands                 | only if the central unit needs queued commands                                  |
| Turnout position confirmed       | the central unit never reports turnout positions (positions stay "unconfirmed") |
| Feedback buses used              | the layout gets occupancy detectors                                             |

## Checking the layout

- **Problems** (bottom): open track ends, tracks meeting without a turnout, missing or duplicate
  addresses and more. Notes (turnouts thrown by hand, track without feedback, station exits not
  linked yet) are normal; untick **Show notes** to hide them. Click a line to show the element.
- **Addresses**: every address in the layout, with the decoder and port; sort by clicking a
  heading, filter by station, kind or text. Addresses used twice are marked.
- **Test outputs**: with this ticked, clicking a turnout, signal or accessory sends the next
  position or aspect to the layout. The properties also have a **Test** button per position or
  aspect. Use this to check addresses and wiring one element at a time.
