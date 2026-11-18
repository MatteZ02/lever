// Windows (VIEW-2, ARC-3): any station view or full-view arrangement can be
// opened in its own window, e.g. one per monitor. All windows show the same
// engine state (each gets its own engine port) and the same project. The
// first window has the full interface; "New window" opens a plain station
// window: only the diagram and the station picker (user, 2026-11-18).
// The windows open at quit are reopened at start-up where they were.
import {join} from 'node:path';
import {app, BrowserWindow, Rectangle, screen} from 'electron';
import iconPath from '../../assets/icon.png?asset';
import {Settings} from '../shared/settings';
import {strings} from '../shared/strings';
import {formatWindowHash} from '../shared/windowTarget';

export type SavedWindow = Settings['windows'][number];

const DEFAULT_SIZE = {width: 1280, height: 800};
// A new window opens this far below and right of the one that opened it.
const CASCADE_PX = 32;

export type WindowManagerOptions = {
  // Development-only UI automation: windows stay hidden.
  hidden: boolean;
  // Called once a window has loaded (UI automation drives the first one).
  onReady?: (window: BrowserWindow, first: boolean) => void;
  // Closing the main window quits Lever (asking about an unsaved layout);
  // plain windows have no menu, settings or editor of their own.
  onCloseMain: () => void;
  isQuitting: () => boolean;
};

// Part of a window on screen, so a window saved on a monitor that is gone
// does not reopen out of reach.
const visibleOnSomeDisplay = (bounds: Rectangle): boolean =>
  screen.getAllDisplays().some(({workArea}) => {
    const width =
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
      Math.max(bounds.x, workArea.x);
    const height =
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
      Math.max(bounds.y, workArea.y);
    return width >= 100 && height >= 50;
  });

export class WindowManager {
  // What each window shows (window target text), by webContents id.
  private readonly targets = new Map<number, string>();
  // Plain station windows, by webContents id.
  private readonly plain = new Set<number>();
  private created = 0;

  constructor(private readonly options: WindowManagerOptions) {}

  open(
    target = '',
    placement?: {bounds?: Rectangle; maximized?: boolean; plain?: boolean},
  ) {
    const opener = BrowserWindow.getFocusedWindow();
    const bounds =
      placement?.bounds && visibleOnSomeDisplay(placement.bounds)
        ? placement.bounds
        : opener
          ? {
              ...opener.getNormalBounds(),
              x: opener.getNormalBounds().x + CASCADE_PX,
              y: opener.getNormalBounds().y + CASCADE_PX,
            }
          : DEFAULT_SIZE;
    const window = new BrowserWindow({
      ...bounds,
      minWidth: 640,
      minHeight: 480,
      show: false,
      title: strings.appName,
      icon: iconPath,
      autoHideMenuBar: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
        // Hidden automation windows must still render (uiAutomation.ts).
        backgroundThrottling: !this.options.hidden,
      },
    });
    const id = window.webContents.id;
    this.targets.set(id, target);
    const plain = placement?.plain ?? false;
    if (plain) {
      this.plain.add(id);
      // No menu (nor its shortcuts): the window is only the diagram. Esc is
      // still STOP (handled in the page).
      window.removeMenu();
    }
    const first = this.created === 0;
    this.created++;

    // A plain window simply closes. Closing the main window quits Lever,
    // through the quit path, so that "Cancel" in its unsaved-changes
    // question keeps it (and the plain windows) open.
    window.on('close', (event) => {
      if (this.options.isQuitting() || this.options.hidden || plain) {
        return;
      }
      event.preventDefault();
      this.options.onCloseMain();
    });
    window.on('closed', () => {
      this.targets.delete(id);
      this.plain.delete(id);
    });
    window.once('ready-to-show', () => {
      if (!this.options.hidden) {
        if (placement?.maximized) {
          window.maximize();
        }
        window.show();
      }
      this.options.onReady?.(window, first);
    });

    const hash = encodeURIComponent(formatWindowHash(target, plain));
    const devServer = process.env['ELECTRON_RENDERER_URL'];
    if (!app.isPackaged && devServer) {
      void window.loadURL(`${devServer}#${hash}`);
    } else {
      void window.loadFile(join(__dirname, '../renderer/index.html'), {hash});
    }
    return window;
  }

  // The renderer reports what it shows whenever that changes.
  setTarget(webContentsId: number, target: string): void {
    if (this.targets.has(webContentsId)) {
      this.targets.set(webContentsId, target);
    }
  }

  // The open windows, to reopen next time.
  snapshot(): SavedWindow[] {
    return BrowserWindow.getAllWindows()
      .filter((window) => !window.isDestroyed())
      .sort((a, b) => a.webContents.id - b.webContents.id)
      .map((window) => {
        const {x, y, width, height} = window.getNormalBounds();
        return {
          target: this.targets.get(window.webContents.id) ?? '',
          bounds: {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.max(100, Math.round(width)),
            height: Math.max(100, Math.round(height)),
          },
          maximized: window.isMaximized(),
          plain: this.plain.has(window.webContents.id),
        };
      });
  }

  // Reopens saved windows, or one default window.
  restore(saved: SavedWindow[]): void {
    if (saved.length === 0 || this.options.hidden) {
      this.open();
      return;
    }
    // Exactly one main window: the first saved one that was, else the first.
    const main = Math.max(
      0,
      saved.findIndex((entry) => !entry.plain),
    );
    saved.forEach((entry, index) => {
      this.open(entry.target, {
        bounds: entry.bounds,
        maximized: entry.maximized,
        plain: index !== main,
      });
    });
  }
}
