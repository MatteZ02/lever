// Main process: windows, menus, dialogs and file access only (STK-4). The
// connection and interlocking run in the engine utility process.
import {join} from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
  Menu,
  MenuItemConstructorOptions,
} from 'electron';
import iconPath from '../../assets/icon.png?asset';
import {Settings, settingsUpdateSchema} from '../shared/settings';
import {strings} from '../shared/strings';
import {EngineHost} from './engineHost';
import {applySecurityPolicy} from './security';
import {applySettingsUpdate, loadSettings, saveSettings} from './settingsFile';

// Several instances may run at once, also on one PC (MULTI-5), so there is
// deliberately no app.requestSingleInstanceLock().

const engine = new EngineHost();
let settings: Settings;

const isAppFrame = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => {
  const url = event.senderFrame?.url ?? '';
  const devServer = process.env['ELECTRON_RENDERER_URL'];
  return (
    url.startsWith('file:') ||
    (devServer !== undefined && url.startsWith(devServer))
  );
};

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
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
    },
  });
  window.once('ready-to-show', () => window.show());

  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devServer) {
    void window.loadURL(devServer);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return window;
};

const showAbout = (): void => {
  void dialog.showMessageBox({
    type: 'info',
    title: strings.about.title,
    message: strings.appName,
    detail: strings.about.detail(app.getVersion()),
    icon: iconPath,
  });
};

const buildMenu = (): void => {
  const template: MenuItemConstructorOptions[] = [
    {
      label: strings.menu.file,
      submenu: [{role: 'quit', label: strings.menu.quit}],
    },
    {
      label: strings.menu.view,
      submenu: [
        {role: 'zoomIn', label: strings.menu.zoomIn},
        {role: 'zoomOut', label: strings.menu.zoomOut},
        {role: 'resetZoom', label: strings.menu.resetZoom},
        {type: 'separator'},
        {role: 'togglefullscreen', label: strings.menu.fullScreen},
        ...(app.isPackaged
          ? []
          : [
              {
                role: 'toggleDevTools',
                label: strings.menu.developerTools,
              } as const,
            ]),
      ],
    },
    {
      label: strings.menu.help,
      submenu: [{label: strings.menu.about, click: showAbout}],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const registerIpc = (): void => {
  ipcMain.on('engine:request-port', (event) => {
    if (isAppFrame(event)) {
      engine.attach(event.sender);
    }
  });

  ipcMain.handle('settings:get', (event) =>
    isAppFrame(event) ? settings : undefined,
  );

  ipcMain.handle('settings:update', async (event, update: unknown) => {
    if (!isAppFrame(event)) {
      return settings;
    }
    const parsed = settingsUpdateSchema.parse(update);
    const previous = settings;
    settings = applySettingsUpdate(settings, parsed);
    await saveSettings(settings);
    if (
      parsed.centralUnit &&
      (parsed.centralUnit.host !== previous.centralUnit.host ||
        parsed.centralUnit.port !== previous.centralUnit.port)
    ) {
      engine.connect(settings.centralUnit.host, settings.centralUnit.port);
    }
    if (settings.protocolLog !== previous.protocolLog) {
      engine.setProtocolLog(settings.protocolLog);
    }
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('settings:changed', settings);
    }
    return settings;
  });

  ipcMain.handle('app:info', (event) =>
    isAppFrame(event) ? {version: app.getVersion()} : undefined,
  );
};

const start = async (): Promise<void> => {
  await app.whenReady();
  app.setAppUserModelId('fi.alppirautatiet.lever');
  applySecurityPolicy();
  settings = await loadSettings();
  buildMenu();
  registerIpc();

  engine.start();
  engine.setProtocolLog(settings.protocolLog);
  engine.connect(settings.centralUnit.host, settings.centralUnit.port);
  createWindow();
};

let stopping = false;
app.on('before-quit', (event) => {
  if (stopping) {
    return;
  }
  // Log off from the central unit before quitting (REU-4).
  event.preventDefault();
  stopping = true;
  void engine.stop().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  app.quit();
});

void start();
