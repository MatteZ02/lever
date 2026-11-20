# Installing Lever

Lever runs on Windows 10 and Windows 11 (64-bit). You need about 350 MB of disk space and no
administrator rights.

## 1. Installer or portable version?

Both are on the [Releases](https://github.com/MatteZ02/lever/releases) page. Take the newest
release.

| File                               | Choose it when                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Lever-<version>-setup-x64.exe`    | **Lever stays on this PC** (e.g. the club's control station PC). It adds Lever to the Start menu and the desktop, and can be removed under Windows settings → Apps. |
| `Lever-<version>-portable-x64.zip` | You **cannot or do not want to install** (e.g. on a borrowed PC), or you want to run it from a USB stick.                                                           |

Both are the same program. Your settings are kept separately, so you can switch between them.

## 2. Installing

**Installer:** double-click `Lever-<version>-setup-x64.exe`, choose a folder (or keep the one
offered) and click **Install**. Lever starts from the desktop or the Start menu.

**Portable version:** right-click the zip, choose **Extract all…**, pick a folder (for example
`Documents\Lever`), then open the folder and double-click `Lever.exe`.

### "Windows protected your PC"

Lever is not signed with a paid certificate, so on first start Windows may show a blue window:
**"Windows protected your PC"**.

1. Click **More info**.
2. Check that it says **App: Lever…**, then click **Run anyway**.

Windows asks only once. If there is no **Run anyway** button, your PC is managed by an
organisation that blocks unknown programs; ask whoever manages it.

### "Windows Defender Firewall has blocked some features"

On first start Windows may ask whether Lever may use the network. Lever needs it to talk to the
central unit.

1. Tick **Private networks**.
2. Click **Allow access**.

If you clicked **Cancel** by mistake, see _Troubleshooting_ below.

## 3. Connecting the PC to the layout

Lever talks to the central unit (DR5000, Z21 or z21 start) over the layout's own network.

- Connect the PC to the **same network as the central unit**: the layout's WiFi, or a network cable
  to the layout's router. At the club, the control station PCs are already set up for this.
- When Windows asks whether the network is public or private, choose **Private**.

## 4. The central unit's address

Lever can also be used in Finnish: **Settings** → **Language** → **Suomi** reloads its windows in
Finnish.

1. Start Lever.
2. Click **Settings** (top right).
3. Under **Central unit**, enter the **IP address**. A central unit straight from the factory has
   `192.168.0.111`; this is also the address of the club's DR5000. Keep the **port** at `21105`.
4. Click **Connect**.

The top left of the window says **Connected**, with the central unit's type, when it works. Lever
remembers the address.

## 5. Opening a layout

The track diagrams are kept in a layout file (`.lever`).

1. **File → Open…** and choose the layout file (for the club: the one you were given, or the
   sample `alppirata.lever`).
2. Lever opens it and opens it again by itself next time.

Lever saves changes by itself. If the same layout is already open for editing in another copy of
Lever (on this PC or another one), it opens **read-only**; you can still operate.

Lever starts in **Operate**. Click a turnout to throw it, a signal to set it, and press **Esc** for
**STOP** at any time. The [user guide](user-guide.md) explains the rest.

## Troubleshooting

| What you see                                     | What to do                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Connection lost, retrying…** and it stays so   | Is the central unit switched on? Is the PC on the layout's network (WiFi or cable)? Is the IP address in **Settings** right? Can another app (Throttle, the Roco app) reach the central unit?                                                                                                            |
| It never connects, although the network is right | The Windows firewall may block Lever. Open **Windows Security → Firewall & network protection → Allow an app through firewall**, click **Change settings**, find **Lever** and tick **Private**. If Lever is not listed, click **Allow another app…** and choose `Lever.exe`. Lever uses UDP port 21105. |
| Connected, but nothing happens on the layout     | Is the track power on (the button at the top)? Did someone press STOP (**Resume**)? Turnouts that move the wrong way or not at all are fixed in the layout's central unit settings; ask whoever maintains the layout.                                                                                    |
| Turnouts show a dashed leg or a **?**            | Lever does not know yet where they really are (for example after the central unit was switched on). Throw them once and they show their position.                                                                                                                                                        |
| "Opened read-only"                               | The layout is being edited in another copy of Lever. Close it there to edit it here.                                                                                                                                                                                                                     |
| The screen is hard to read                       | **Settings → Colours**: light, dark, or the same as Windows. Ctrl + plus / minus makes everything larger or smaller.                                                                                                                                                                                     |

Lever keeps its settings in `%APPDATA%\Lever`. Deleting that folder resets them (the layout files
are elsewhere and are not affected).

## Updating and removing

There are no automatic updates. To update, download the new release and install it over the old
one (installer), or extract it over the old folder (portable). To remove Lever: Windows settings →
Apps → Lever → Uninstall (installer), or delete the folder (portable).
