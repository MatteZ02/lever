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
import {Project} from '../model/project';
import {ProjectFileAction, ProjectState} from '../shared/projectApi';
import {Settings, settingsUpdateSchema} from '../shared/settings';
import {strings} from '../shared/strings';
import {EngineHost} from './engineHost';
import {ProjectController} from './project/projectController';
import {applySecurityPolicy} from './security';
import {applySettingsUpdate, loadSettings, saveSettings} from './settingsFile';
import {runUiScript, uiScriptPath} from './uiAutomation';

// Several instances may run at once, also on one PC (MULTI-5), so there is
// deliberately no app.requestSingleInstanceLock().

const engine = new EngineHost();
// Development-only UI automation (never in packaged builds). It uses its own
// settings and recovery folder, never the user's.
const uiScript = uiScriptPath();
if (uiScript) {
  app.setPath('userData', join(process.env['LEVER_UI_OUT'] ?? '.', 'userData'));
}
let settings: Settings;
let projects: ProjectController;
// The last central-unit profile sent to the engine, to send only changes.
let appliedProfile = '';

const PROJECT_ACTIONS: ProjectFileAction[] = [
  'new',
  'open',
  'save',
  'saveAs',
  'exportCopy',
  'import',
  'restoreBackup',
];

const broadcastProject = (state: ProjectState): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('project:changed', state);
  }
  applyProjectToEngine(state.project);
};

const applyProjectToEngine = (project: Project): void => {
  const {accessoryGapMs, feedbackSources} = project.settings.centralUnit;
  const key = JSON.stringify({accessoryGapMs, feedbackSources});
  if (key !== appliedProfile) {
    appliedProfile = key;
    engine.configureLayout({accessoryGapMs, feedbackSources});
  }
};

const rememberProjectPath = (path: string | null): void => {
  if (settings.lastProjectPath !== path) {
    settings = {...settings, lastProjectPath: path};
    void saveSettings(settings);
  }
};

const runProjectAction = (action: ProjectFileAction): void => {
  const window = BrowserWindow.getFocusedWindow() ?? undefined;
  void projects.run(action, window).catch((error: unknown) => {
    void dialog.showMessageBox({type: 'error', message: String(error)});
  });
};

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
      // Hidden automation windows must still render (uiAutomation.ts).
      backgroundThrottling: uiScript === undefined,
    },
  });
  if (uiScript) {
    window.once('ready-to-show', () => void runUiScript(window, uiScript));
  } else {
    window.once('ready-to-show', () => window.show());
  }

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
      submenu: [
        {
          label: strings.menu.newProject,
          accelerator: 'CmdOrCtrl+N',
          click: () => runProjectAction('new'),
        },
        {
          label: strings.menu.open,
          accelerator: 'CmdOrCtrl+O',
          click: () => runProjectAction('open'),
        },
        {
          label: strings.menu.save,
          accelerator: 'CmdOrCtrl+S',
          click: () => runProjectAction('save'),
        },
        {
          label: strings.menu.saveAs,
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => runProjectAction('saveAs'),
        },
        {type: 'separator'},
        {
          label: strings.menu.exportCopy,
          click: () => runProjectAction('exportCopy'),
        },
        {
          label: strings.menu.importCopy,
          click: () => runProjectAction('import'),
        },
        {
          label: strings.menu.restoreBackup,
          click: () => runProjectAction('restoreBackup'),
        },
        {type: 'separator'},
        {role: 'quit', label: strings.menu.quit},
      ],
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

  ipcMain.handle('project:get', (event) =>
    isAppFrame(event) ? projects.document.get() : undefined,
  );

  // A whole project from the editor; validated by the document. Returns the
  // new revision, or an error message (e.g. read-only).
  ipcMain.handle(
    'project:update',
    (event, project: unknown, clientId: unknown) => {
      if (!isAppFrame(event)) {
        return {error: 'not allowed'};
      }
      try {
        return {
          revision: projects.document.update(
            project,
            typeof clientId === 'string' ? clientId : undefined,
          ),
        };
      } catch (error) {
        return {error: String(error)};
      }
    },
  );

  ipcMain.handle('project:action', async (event, action: unknown) => {
    if (
      isAppFrame(event) &&
      PROJECT_ACTIONS.includes(action as ProjectFileAction)
    ) {
      await projects.run(
        action as ProjectFileAction,
        BrowserWindow.fromWebContents(event.sender) ?? undefined,
      );
    }
  });
};

const start = async (): Promise<void> => {
  await app.whenReady();
  app.setAppUserModelId('fi.alppirautatiet.lever');
  applySecurityPolicy();
  settings = await loadSettings();
  projects = new ProjectController({
    onState: broadcastProject,
    rememberPath: rememberProjectPath,
  });
  buildMenu();
  registerIpc();

  engine.start();
  engine.setProtocolLog(settings.protocolLog);
  applyProjectToEngine(projects.document.get().project);
  engine.connect(settings.centralUnit.host, settings.centralUnit.port);
  await projects.reopen(settings.lastProjectPath);
  createWindow();
};

let stopping = false;
app.on('before-quit', (event) => {
  if (stopping) {
    return;
  }
  // Save the project, then log off from the central unit (REU-4).
  event.preventDefault();
  const ready = uiScript
    ? projects.document.close().then(() => true)
    : projects.beforeQuit();
  void ready.then((proceed) => {
    if (!proceed) {
      return;
    }
    stopping = true;
    void engine.stop().finally(() => app.quit());
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

void start();
