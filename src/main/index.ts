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
import {windowTargetTextSchema} from '../shared/windowTarget';
import {EngineHost} from './engineHost';
import {ProjectController} from './project/projectController';
import {applySecurityPolicy} from './security';
import {applySettingsUpdate, loadSettings, saveSettings} from './settingsFile';
import {TurnoutPositionStore} from './turnoutPositions';
import {runUiScript, uiScriptPath} from './uiAutomation';
import {WindowManager} from './windows';

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
// The last project sent to the engine, to send only changes.
let appliedProject: Project | null = null;
let turnoutPositions: TurnoutPositionStore;
// Projects whose turnouts were restored in this run (ACC-4: once, on start).
const restoredProjects = new Set<string>();

const PROJECT_ACTIONS: ProjectFileAction[] = [
  'new',
  'open',
  'save',
  'saveAs',
  'exportCopy',
  'import',
  'importZ21',
  'restoreBackup',
];

const broadcastProject = (state: ProjectState): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('project:changed', state);
  }
  applyProjectToEngine(state.project);
};

// The engine operates the open project (STK-4: the live state lives there).
const applyProjectToEngine = (project: Project): void => {
  if (project !== appliedProject) {
    appliedProject = project;
    engine.loadLayout(project);
    restoreTurnouts(project);
  }
};

// ACC-4: the first time a project is operated in this run, and only when
// its setting is on, the engine commands the last known positions once
// connected.
const restoreTurnouts = (project: Project): void => {
  if (restoredProjects.has(project.id)) {
    return;
  }
  restoredProjects.add(project.id);
  const positions = turnoutPositions.get(project.id);
  if (
    project.settings.restoreTurnoutsOnStartup &&
    Object.keys(positions).length > 0
  ) {
    engine.restoreTurnouts(project.id, positions);
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

// Windows (VIEW-2): created in start(); several may be open.
let windows: WindowManager;

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
          label: strings.menu.importZ21,
          click: () => runProjectAction('importZ21'),
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
  // Opens a station view or the full view in a new window (VIEW-2).
  ipcMain.on('window:open', (event, target: unknown) => {
    const parsed = windowTargetTextSchema.safeParse(target);
    if (isAppFrame(event) && parsed.success) {
      windows.open(parsed.data, {plain: true});
    }
  });
  // What the sending window shows now; saved with it at quit.
  ipcMain.on('window:target', (event, target: unknown) => {
    const parsed = windowTargetTextSchema.safeParse(target);
    if (isAppFrame(event) && parsed.success) {
      windows.setTarget(event.sender.id, parsed.data);
    }
  });

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
        // The window shows a short message; the details are for developers.
        console.error('Project update refused:', error);
        return {
          error: projects.document.get().readOnly ? 'readOnly' : 'invalid',
        };
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
  turnoutPositions = new TurnoutPositionStore(
    join(app.getPath('userData'), 'turnout-positions.json'),
  );
  await turnoutPositions.load();
  engine.onReport((report) => {
    if (report.type === 'turnoutPositions') {
      turnoutPositions.update(report.projectId, report.positions);
    }
  });
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
  windows = new WindowManager({
    hidden: uiScript !== undefined,
    isQuitting: () => stopping,
    onCloseMain: () => app.quit(),
    onChange: saveWindowsSoon,
    onReady: (window, first) => {
      if (uiScript && first) {
        void runUiScript(window, uiScript);
      }
    },
  });
  windows.restore(settings.windows);
};

let stopping = false;
// The open windows are saved shortly after any change (and at quit), so they
// are reopened even if Lever is ended without quitting (e.g. stopping the
// development server). UI automation saves into its own user data folder.
const WINDOWS_SAVE_DELAY_MS = 1000;
let windowsSaveTimer: ReturnType<typeof setTimeout> | null = null;
function saveWindowsSoon(): void {
  if (windowsSaveTimer) {
    clearTimeout(windowsSaveTimer);
  }
  windowsSaveTimer = setTimeout(() => {
    windowsSaveTimer = null;
    if (stopping) {
      return;
    }
    settings = {...settings, windows: windows.snapshot()};
    void saveSettings(settings).catch((error: unknown) =>
      console.error('Windows not saved:', error),
    );
  }, WINDOWS_SAVE_DELAY_MS);
}

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
    if (windowsSaveTimer) {
      clearTimeout(windowsSaveTimer);
    }
    // Reopen the same windows next time.
    settings = {...settings, windows: windows.snapshot()};
    void saveSettings(settings)
      .catch((error: unknown) => console.error('Settings not saved:', error))
      .then(() => turnoutPositions.flush())
      .then(() => engine.stop())
      .finally(() => app.quit());
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

void start();
