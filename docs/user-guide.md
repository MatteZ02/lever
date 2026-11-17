# Lever user guide

> Work in progress. This version covers the layout editor (Phase 2). Operating mode, routes and
> automation levels are added in later phases.

## Layout files

A layout is one file with the extension `.lever`. **File** menu:

- **New layout**, **Open…**, **Save**, **Save as…**
- **Save a copy…**: writes a copy elsewhere (for sharing or a USB stick); you keep working in the
  open file.
- **Import as new copy…**: opens someone else's layout as a new, unsaved copy, so their file is
  never changed.
- **Restore a backup…**: Lever saves your changes automatically a moment after each edit, and keeps
  automatic backups (at most one every 10 minutes, the last 20) in a `.lever-backups` folder next
  to the layout file. Restoring first backs up the current state, so it can be undone.

Lever reopens the last layout when it starts. If the layout is already open for editing in another
copy of Lever (on this PC or another one on the network share), it opens **read-only** and says
where it is open.

A sample is included: `samples/club-layout.lever`, a **draft** of olten, inselburg-dettingen and
Sissach drawn from the Z21 app screenshots. Its turnouts have no addresses yet.

## Operating and editing

The window opens in **Operate**. To change the layout, click **Edit layout**; if the layout has an
edit password, Lever asks for it. While editing, an orange line and the word **EDITING** are shown.
**Esc is always STOP**, also while editing.

Stations appear as tabs. **+ Add station** creates a new one; its name and default automation level
are set in the properties when nothing is selected.

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
all. Mouse wheel zooms; the middle button (or Alt + drag) pans.

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
