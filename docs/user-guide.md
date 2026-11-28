# Lever user guide

> How to operate the layout with Lever (Levels 1 and 2), edit layouts, and use several windows.
> Installing Lever and connecting it: [install-en.md](install-en.md) (Finnish:
> [install-fi.md](install-fi.md)).

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
**Esc is STOP**, also while editing (another key can be chosen, see below).

**Quick keys** (**Settings → Quick keys**): a key each for STOP, track power on / resume, track
power off, undo last route, new route and fit to view. Only STOP has one by default. Click
**Change** and press any key (without Ctrl, Alt or Windows); a key another action has is refused.
Letters work with or without Shift. Quick keys work in every window, but not while typing in a text
field, and **not while Settings is open** (so a key can be chosen there): the STOP key does nothing
then either, but the STOP button on screen always works. The number keys **1–9** open the tabs from
left to right (views first, then stations), unless one of them is a quick key; tabs beyond the
ninth have no number key.

Stations appear as tabs. While editing, drag a tab to put it somewhere else (stations among
stations, views among views). **+ Add station** creates a new one; its name and default automation level
are set in the properties when nothing is selected.

## Operating (Level 1)

In **Operate**, click an element on the diagram. A click anywhere on a turnout, its legs included,
counts; so does a click just beside an element (within one and a half times its size) when nothing
else that can be clicked is that close:

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
| new leg dotted, blinking      | **commanded**: sent, waiting for the central unit; back to the old leg (with **!**) if it does not move          |
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

Clicks always go first: when Lever is busy asking the central unit for positions (after starting
or after a connection break), a turnout you click is switched before the remaining questions.

Occupied track is **solid red**. A block stays red for its release delay after its detectors become
free. Status is never shown by colour alone: there is always a pattern, marker or text too.

**Feedback** (top bar) opens the feedback monitor: every detector input in the layout or reported
by the central unit, whether it is occupied, and which block or turnout uses it. Use it to check
wiring. **Feedback**, **Accessory test** and **Protocol log** are developer tools: they appear in
the top bar only when **Settings → Developer tools** is on.

**Levels** shows the automation areas and their level. You can change a level while operating,
without the edit password. Lowering a level never moves turnouts or changes signals. Raising an
area to Level 3 or 4 first lists routes you have set there over occupied track, and asks.

**Restore turnout positions on startup** (layout properties, off by default): when Lever opens the
layout, it switches every connected turnout to the last position the central unit confirmed, one
after another through the normal queue. Lever only knows the positions it saw on this PC; manual
turnouts are not touched.

## Automation levels and areas

Every part of the layout runs at an **automation level**:

- **Level 1, manual:** turnouts and signals one by one, by clicking them. Occupancy and train
  numbers are shown; nothing is automatic or protected.
- **Level 2, manual routing:** routes from a start to an end (next section). Signals are set by
  routes only; turnouts can still be thrown one by one. Nothing is locked and occupancy is not
  checked.
- **Level 3, train protection:** as Level 2, and routes are checked: a route over occupied track
  is set only if you confirm (**Set anyway**), and one that shares track with a route you have set
  is refused (release that one first). The turnouts of a set route are locked: release the route
  to throw them. Trains with a loco are stopped automatically (see Trains below).
- **Level 4, automatic routing and driving:** as Level 3, and Lever can drive trains to a block or
  along a schedule by itself (see Trains below).

Levels 3 and 4 are new and have not been tried on a layout yet: watch them closely the first
times.

The parts are **automation areas**. Every station is one; in the editor you can add areas for part
of a station or the line between stations, and choose an element's area in its properties. Each
station's level is shown in the bar (and in a view, on each station's title); boundaries
between areas are marked on the diagram.

To change a level, open **Levels** and choose it; no edit password is needed. Lowering a level
never moves a turnout or changes a signal. A route may run from a Level 2 area into a Level 1
area: Lever warns first and sets it normally there.

## Routes (Level 2)

Routes are for areas at **Level 2** (switch an area's level under **Levels**). They are handled
in the **traffic strip** along the bottom of every operating window: **New route**, **Undo last
route** and the routes you have set, on one line, so the diagram keeps the whole width. **More**
opens the saved routes and the occupied track above that line. The **Traffic** tab (first of the
tabs) shows the same without a diagram, and **New window** opens it in a window of its own, e.g.
on a second monitor; routes are set there from the saved ones.

1. Click a **signal**, **station exit** or **route point** and choose **Route from here**. Then
   click where the route ends and choose **Route ends here**; to make it go a certain way, click
   a route point (or signal) on the way first and choose **Via here**. (**New route** in the
   traffic strip works too, and also takes a turnout as start or end.) A route leaves a signal in the
   direction it faces and ends in front of a signal facing the train. While you are making a
   route, clicking turnouts does nothing.
2. Lever shows the route dashed on the diagram. It picks the route with the fewest turnouts,
   diverging movements and signals; if several are equally good, choose **Route 1**, **Route 2**,
   …. Turnouts thrown by hand are listed. If part of the route lies in a **Level 1** area, Lever
   says so: it is set normally there, but nothing there is meant to be routed or protected.
3. **Set route**: the turnouts move one after another; the route shows moving dashes until every
   turnout has reported its position. Manual turnouts are not asked about: Lever records them in
   the route's position and lists them (in the notice and under the route) for you to throw by
   hand. Then the route is **set** (green dashes), and its signals are set: the
   start signal and signals facing the route to proceed (reduced speed before a diverging turnout,
   where the signal has it), signals facing the other way and the end signal to stop; distant
   signals repeat their main signal. (Layout properties: _Set signals along routes
   automatically_.)
4. **Release** returns the route's signals to stop and leaves the turnouts as they are. **Undo
   last route** also puts its turnouts back where they were, except any moved since (Lever says
   which) and manual ones (Lever lists them to put back by hand). A key for undo can be chosen in
   **Settings → Quick keys** (never Ctrl+Z).

If a turnout of a set route moves, for whatever reason (another control station, a Throttle, the
Roco app, a handset, WinDigipet, or a click here), the route's signals go to **stop at once** and
the route is **released**; a notice names the turnout. This also holds when Lever finds the move
by asking the central unit (_Ask for turnout positions every (s)_, or after the connection was
back).

A set route stays set while the connection is interrupted (top left: _Connection interrupted,
asking again…_); when the central unit answers again, Lever asks for every turnout's position, and
only a turnout found moved releases the route. Only after the connection was **lost** (no answer
for 30 seconds), when no turnout position is known, is the route shown **not confirmed** (amber),
with its signals left as they are, until the positions are reported again: a route whose turnouts
are all where it needs them is **set** again (green), and one with a turnout elsewhere is released.
**Release** works on a route that is not confirmed too.

A turnout that does not move makes the route **fail**; **Cancel** drops it. Level 2 does not lock turnouts or check occupancy (that is Level 3): occupied track
stays red under the green route.

**Conflicting routes.** A new route that shares track or a turnout with one of your routes
**cancels** that route: the preview names it, and when you set the new route the old one's
signals go to stop before any turnout moves. Routes that only meet end to end (one ends at a
signal, the next starts there) do not conflict. One exception: two routes that **cross inside a
double slip** (or a crossing or single slip) without sharing a leg, with the slip in the same
position, or straight across the middle of a scissors crossover, can both be set. The preview warns that trains on them would meet there, and **Set
route** asks once more (**Set anyway** / **Back**).

**Save…** keeps a route by name, with its route points; saved routes are listed under **More** and in the Traffic tab, and
clicking the same start and end uses the saved one.

**Signals at Level 2 are set by routes only:** clicking such a signal offers **Route from here**,
not its aspects (at Level 1 you set aspects by hand, as before). Turnouts can still be thrown by
hand at Level 2.

**Several control stations:** each Lever knows only its own routes. Another station's routes
look like turnouts set by someone else, and a turnout thrown by another station can break your
route. Operate each area from one control station at a time.

## Trains (Levels 3 and 4)

A **train** is a train number you give to occupied track (click it). The number now follows the
train: when the next block becomes occupied, the train moves on, and the blocks it leaves are
freed behind it. Lever then also knows which way it runs. If Lever cannot tell which train
entered a block, it says so; give that train its number again. If a train's track becomes free and
it did not run on, its number is removed.

**Locos** (top bar) lists the locos Lever may drive, with their **address**, **speed steps**,
**top speed**, **acceleration** and **braking** (km/h per second, as in Throttle's loco editor),
and for Level 4 the **cruising** and **approach** speeds. Click a train's track to choose its
**Loco**. Lever drives a loco only while it stops or drives the train; otherwise the driver (a
Throttle, a handset) has it.

**Train protection (Level 3).** A train with a loco, whose direction Lever knows (it has run from
one block to the next), is braked to a stop when:

- the signal at the end of its block shows stop;
- fewer blocks ahead are free than **Free blocks needed ahead** (layout properties, default 1;
  each block can have its own). With **0** the train may run into an occupied block and is stopped
  there;
- the track ends ahead, or a turnout ahead is set the other way or its position is not known.

It brakes at the loco's own braking rate, like a driver would; it is not an emergency stop. If a
driver accelerates the train while it must stand, Lever brakes it again. When the way is clear,
the driver can go on. A driver can always reverse out. Protection applies in Level 3 and 4 areas
and to trains entering them, not after they leave them.

The **traffic strip** (**More**) and the **Traffic** tab list the trains: train number, loco,
speed and direction, where it is, and what Lever does with it (_Driver_, _Stopping: …_, or the
automatic state).

**Automatic driving (Level 4).** In a Level 4 area, choose **Drive to…** a block for a train, or a
**Schedule…** (made under **Locos**: blocks to drive to in turn, with a wait at each, optionally
starting again). Lever finds the route (only through Level 4 areas; a train in one block may also
reverse), checks it as Level 3 does, sets it, and drives the loco: up to cruising speed, approach
speed when the next block is the stop, then braking to a stop in it, after which the route is
released. If the way is occupied or another route is in the way, the train waits and starts when
it can. **Stop** (in the list) brakes the train and gives it back to its driver. A train's
direction must be known first: drive it one block by hand.

**Pause automation** (in the strip and the Traffic tab) brakes every automatic train to a stop and
keeps their destinations; **Resume automation** drives them on. It is not STOP: track power stays
on. STOP, track power off and a short circuit pause automation too, so trains never start again by
themselves when power returns.

**One control station per Level 3 or 4 area.** Each Lever protects and drives only its own trains
and knows only its own routes. Two Levers running the same Level 3 or 4 area would work against
each other.

## Views, linked stations and windows

A **view** is a page you put together yourself: frames with stations in them, and lines drawn
between them. Make as many as you need, for example one large station on one monitor and two
smaller stations side by side on another. Views have their own tabs, before the stations' tabs. A
view works like a station: click turnouts, signals and tracks as usual; each frame shows its
station's automation level in its title. Double-click a title to open that station.

To make one, switch to **Edit layout** and click **+ View**. A new view is empty:

- **Frame for** (left): choose a station, then drag on the canvas. The station is fitted inside
  the frame, as large as fits. Drag a frame (or its title) to move it, and the square at its
  bottom-right corner to resize it. With a frame selected you can change its **Station**, turn it
  with **Rotate left** / **Rotate right** (a quarter turn each; names and numbers stay upright),
  or delete it. Turning a station here changes only how it sits in this view, not its own drawing.
- **Line**: click to add points. Station exits are marked with circles; a click near one attaches
  the line to that exit, so the line follows when the frame moves. Finish on an exit, by clicking
  the last point again, or with Enter; Backspace removes the last point. Lines are a drawing only
  (dashed): they show no occupancy or routes.
- **Select**: click a frame or a line to change or delete it (Delete key works too). Rename or
  delete the view on the right.

Projects from Lever 0.1.2 and earlier keep their arrangements as views, with the lines between
linked exits as drawn lines.

**Linking stations:** select a station exit in the editor and choose where it **leads to**: the
exit at the other end of the line, in another station or in the same one (for example the two
ends of a line through a hidden spiral). Lever joins the stations there, so routes can continue
through it, and in operating mode clicking a linked exit opens the other end. Unlinked exits are
normal where the line between stations is not drawn.

**New window** opens what is shown (a station or a view) in a plain window, e.g. on a second
monitor: only the diagram and the view and station tabs, for operating. Editing, settings and track
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

A **scissors crossover** is drawn as four turnouts whose diverging legs meet in the middle (an
X). Lever treats the middle as a crossing: routes go straight across it, never turn there.

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
- **Text and station exits**: **Text colour**, for example to mark the red and yellow main lines.
  Click the colour to open the picker: drag in the square (saturation and brightness) and on the
  hue bar, type a hex value such as `#c62828`, or click one of the ready colours; _Normal_ goes
  back to the usual label colour. If a colour would be hard to read on the diagram, Lever draws it
  a little lighter (dark theme) or darker (light theme).

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
