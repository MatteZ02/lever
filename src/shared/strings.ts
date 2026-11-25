// All user-visible text (CON-4): English here, Finnish in strings.fi.ts
// (same shape, checked by the type). Used by the main process (menus,
// dialogs) and the renderer. Keep wording plain, without jargon (CARRY-4).
//
// The language is fixed when a page loads (the preload passes the setting
// as `window.lever.language`), so module-level copies of a string are fine
// in the renderer. The main process switches with setLanguage() and builds
// its menu again.
import {Language} from './language';
import {fi} from './strings.fi';

const en = {
  appName: 'Lever',

  project: {
    fileType: 'Lever layout',
    untitled: 'New layout',
    openTitle: 'Open layout',
    saveAsTitle: 'Save layout as',
    exportTitle: 'Save a copy of the layout',
    importTitle: 'Import a layout as a new copy',
    restoreTitle: 'Restore a backup',
    z21FileType: 'Z21 app layout',
    importZ21Title: 'Import a control station from the Z21 app',
    z21Failed: 'The Z21 file could not be imported.',
    z21Imported: (stations: number) =>
      `Imported ${stations} station${stations === 1 ? '' : 's'} from the Z21 app as a new layout. Save it to keep it. Check it in Edit layout → Problems before operating.`,
    z21Issues: {
      duplicatePage: (page: string, of: string) =>
        `Page “${page}” was skipped: all its turnouts are also on “${of}”.`,
      unknownControl: (type: number, count: number) =>
        `${count} element${count === 1 ? '' : 's'} of an unknown kind (${type}) skipped.`,
      oddAngle: (page: string, count: number) =>
        `${count} element${count === 1 ? '' : 's'} on “${page}” at an angle Lever cannot draw, skipped.`,
      invalidAddress: (page: string, address: number) =>
        `Address ${address} on “${page}” is not a valid accessory address; that element has no address now.`,
      routesNotImported: (count: number) =>
        `${count} route button${count === 1 ? '' : 's'} not imported: Lever calculates routes itself (Level 2).`,
      signalsAssumed: (count: number) =>
        `${count} signal${count === 1 ? '' : 's'} imported as two-aspect main signals, with the Z21 app’s first state as Proceed. Test them.`,
    },
    noBackups:
      'Backups exist only for a layout saved as a file and open for editing.',
    saveFailed: 'The layout could not be saved.',
    openFailed: (path: string) => `“${path}” could not be opened.`,
    openedReadOnly:
      'This layout is open for editing in another copy of Lever, so it is opened read-only here.',
    lockedBy: (host: string) =>
      `Open on: ${host}. Close it there to edit it here.`,
    migrated: (version: number) =>
      `This layout was made with an older version of Lever (format ${version}). It has been updated; the original is kept in the backups.`,
    saveBeforeQuit: 'Save the new layout before closing?',
    saveBeforeReplace: 'Save the new layout before opening another one?',
    unsavedDetail:
      'It has not been saved to a file yet. If you do not save it, it is lost.',
    saveFailedClose: 'The latest changes to the layout could not be saved.',
    saveFailedCloseDetail:
      'If you continue without saving, these changes are lost.',
    tryAgain: 'Try again',
    discardChanges: 'Discard changes',
    save: 'Save…',
    dontSave: 'Don’t save',
    cancel: 'Cancel',
    errors: {
      notAProject: 'This is not a Lever layout file.',
      newerVersion:
        'This layout was made with a newer version of Lever. Update Lever to open it.',
      missingMigration: (version: number) =>
        `Lever cannot update layouts of format ${version}.`,
      invalid: (details: string) =>
        `The file is damaged or was edited by hand:\n${details}`,
    },
  },

  menu: {
    file: 'File',
    newProject: 'New layout',
    open: 'Open…',
    save: 'Save',
    saveAs: 'Save as…',
    exportCopy: 'Save a copy…',
    importCopy: 'Import as new copy…',
    importZ21: 'Import from Z21 app…',
    restoreBackup: 'Restore a backup…',
    quit: 'Quit',
    view: 'View',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetZoom: 'Actual size',
    fullScreen: 'Full screen',
    developerTools: 'Developer tools',
    help: 'Help',
    about: 'About Lever',
  },

  about: {
    title: 'About Lever',
    detail: (version: string) =>
      `Version ${version}\n\nControl station for model railways on a Z21-compatible central unit.\nMIT licence.`,
  },

  connection: {
    disconnected: 'Not connected',
    connecting: 'Connecting…',
    connected: 'Connected',
    reconnecting: 'Connection lost, retrying…',
    interrupted: 'Connection interrupted, asking again…',
    centralUnit: 'Central unit',
    address: 'IP address',
    port: 'Port',
    connect: 'Connect',
    firmware: (version: string) => `Firmware ${version}`,
    unknownDevice: 'Central unit type not reported',
  },

  hardwareTypes: {
    0x200: 'Z21 (black, 2012)',
    0x201: 'Z21 (black, 2013)',
    0x202: 'SmartRail',
    0x203: 'z21 (white)',
    0x204: 'z21 start',
    0x211: 'Z21 XL',
  } as Record<number, string>,

  trackStatus: {
    unknown: 'Track status unknown',
    normal: 'Track power on',
    emergencyStop: 'Emergency stop',
    powerOff: 'Track power off',
    shortCircuit: 'SHORT CIRCUIT',
    programming: 'Programming mode',
  },

  stop: {
    button: 'STOP',
    buttonHint: (key: string) => `Stop all trains (${key})`,
    powerOn: 'Track power on',
    powerOff: 'Track power off',
    resume: 'Resume',
    // Second line of the track status while stopped: it is the resume button.
    clickToResume: 'Click to resume',
    clickToPowerOn: 'Click to switch power on',
  },

  settings: {
    title: 'Settings',
    theme: 'Colours',
    themeSystem: 'Same as Windows',
    themeLight: 'Light',
    themeDark: 'Dark',
    language: 'Language',
    languageNames: {en: 'English', fi: 'Suomi'} as Record<string, string>,
    languageHelp: 'Lever’s windows reload in the new language.',
    protocolLog: 'Protocol log (for troubleshooting)',
    devTools: 'Developer tools',
    devToolsHelp:
      'Shows Feedback, Accessory test and Protocol log in the main bar.',
    quickKeys: 'Quick keys',
    quickKeysHelp:
      'They work in every window, except while typing in a text field and while Settings is open (the STOP button on screen always works). Letters work with or without Shift.',
    quickKeyActions: {
      stop: 'STOP',
      resume: 'Track power on / resume',
      trackPowerOff: 'Track power off',
      undoRoute: 'Undo last route',
      newRoute: 'New route',
      fitView: 'Fit to view',
    } as Record<string, string>,
    changeKey: 'Change',
    cancelKey: 'Cancel',
    removeKey: 'Remove',
    pressKey: 'Press a key…',
    keyTaken: (action: string) => `That key is already used for “${action}”.`,
    keyWithModifier: 'Choose a key without Ctrl, Alt or Windows.',
    noKey: 'None',
  },

  protocolLog: {
    title: 'Protocol log',
    empty: 'Nothing logged yet.',
    clear: 'Clear',
  },

  errors: {
    invalidPort: 'Enter a port between 1 and 65535.',
    invalidHost: 'Enter the central unit’s IP address.',
    invalidTurnoutNumber: 'Enter a turnout number between 1 and 2048.',
  },

  // The eight grid directions as arrows (screen up = north).
  directionArrows: {
    E: '→',
    NE: '↗',
    N: '↑',
    NW: '↖',
    W: '←',
    SW: '↙',
    S: '↓',
    SE: '↘',
  } as Record<string, string>,

  windows: {
    open: 'New window',
    openHelp:
      'Open what is shown here in a new window, e.g. for a second monitor. Lever reopens its windows where they were.',
  },

  routes: {
    title: 'Routes',
    fold: 'Hide',
    newRoute: 'New route',
    undoLast: 'Undo last route',
    clickStart:
      'Click where the route starts: a signal, turnout, route point or station exit.',
    clickEnd: (start: string) =>
      `From ${start}. Click where the route ends, or a route point to pass on the way.`,
    notFound: {
      noPath:
        'No route between these points (signals are passed in their direction only).',
      notRoutePoint:
        'Routes start and end at signals, turnouts, route points or exits.',
      samePoint: 'Start and end are the same.',
    } as Record<string, string>,
    via: (points: string) => `via ${points}`,
    options: 'Equally good routes',
    option: (n: number) => `Route ${n}`,
    tie: 'These routes are equally good. Choose one; it is shown on the diagram.',
    summary: (turnouts: number, areas: string[]) =>
      `${turnouts} turnout${turnouts === 1 ? '' : 's'}; through ${areas.join(', ')}.`,
    startLevel1:
      'Routes start in a Level 2 area. Change the level under Levels to use routes here.',
    levelNotAvailable:
      'This route crosses an area at a level that is not available yet.',
    level1Warning: (areas: string) =>
      `Part of this route lies in a Level 1 area (${areas}), where no routing logic or protection is intended. It is set normally there.`,
    manualList: (turnouts: string) =>
      `Not connected, throw by hand: ${turnouts}.`,
    set: 'Set route',
    cancels: (routes: string) =>
      `Setting this route cancels ${routes} (they share track or turnouts).`,
    crosses: (routes: string, at: string) =>
      `This route crosses ${routes} in ${at}. Both can be set, but trains on them would meet there.`,
    crossQuestion: 'Set this route although it crosses another route?',
    crossConfirm: 'Set anyway',
    crossBack: 'Back',
    save: 'Save…',
    saveName: 'Name',
    saveConfirm: 'Save route',
    saved: 'Saved routes',
    show: 'Show',
    deleteSaved: 'Delete',
    states: {
      setting: 'Setting… (turnouts moving)',
      set: 'Set',
      failed: (turnout: string) => `Not set: ${turnout} did not move`,
      unconfirmed: 'Not confirmed: waiting for the central unit',
    },
    manualToSet: (turnouts: string) => `Throw by hand: ${turnouts}.`,
    release: 'Release',
    cancelRoute: 'Cancel',
    fromHere: 'Route from here',
    endHere: 'Route ends here',
    viaHere: 'Via here',
    followExit: 'Go to the other end',
  },

  // Layout views: canvases with station frames and drawn lines.
  full: {
    title: 'View',
    newName: (n: number) => `View ${n}`,
    add: 'View',
    tabsLabel: 'Views and stations',
    name: 'Name',
    remove: 'Delete view',
    editHelp:
      'A view shows the stations you draw frames for, joined by lines you draw. Open it in its own window with New window, e.g. one view per monitor.',
    tools: 'View tools',
    select: 'Select',
    line: 'Line',
    frameFor: 'Frame for',
    selectHelp:
      'Drag a frame or its title to move it, its corner to resize it. Double-click a title to open that station.',
    frameHelp: 'Drag on the canvas to draw the frame. The station fits inside.',
    lineHelp:
      'Click to add points; a click near a station exit attaches the line to it. Finish on an exit, by clicking the last point again, or with Enter. Backspace removes the last point.',
    station: 'Station',
    rotation: (degrees: number) => `Rotation: ${degrees}°`,
    rotateLeft: 'Rotate left',
    rotateRight: 'Rotate right',
    openStation: 'Open station',
    deleteFrame: 'Delete frame',
    deleteLine: 'Delete line',
    lineTitle: 'Line',
    linePoints: (n: number) => `${n} points`,
    selectHint: 'Click a frame or a line to change it.',
    empty:
      'This view is empty. Choose a station under "Frame for" and drag on the canvas to draw its frame.',
    emptyOperate:
      'This view is empty. Switch to Edit layout to draw station frames on it.',
  },

  operate: {
    trainNumber: 'Train number or name',
    setLabel: 'Show',
    clearLabel: 'Remove',
    feedbackMonitor: 'Feedback monitor',
    feedbackShort: 'Feedback',
    noFeedbackSources:
      'No feedback bus is switched on for this layout (Edit layout → nothing selected → Central unit settings).',
    feedbackSources: (list: string) => `Listening to: ${list}.`,
    input: 'Input',
    state: 'State',
    usedBy: 'Used by',
    notReported: 'Not reported yet',
    notUsed: '—',
    areas: 'Automation levels',
    areasShort: 'Levels',
    areasHelp:
      'Level 1: switch turnouts and signals by hand. Level 2: also set routes. Changing a level never moves a turnout or changes a signal.',
    stationDefault: 'whole station',
    levelLater: (level: number) => `Level ${level} (later)`,
    levelBadge: (level: number) => `Level ${level}`,
  },

  modes: {
    operate: 'Operate',
    edit: 'Edit layout',
    editing: 'EDITING',
    readOnly: 'Read-only: open in another copy of Lever',
    passwordTitle: 'Edit password',
    passwordPrompt: 'Enter the edit password to change the layout.',
    wrongPassword: 'Wrong password.',
    unlock: 'Edit',
    cancel: 'Cancel',
  },

  editor: {
    tools: {
      select: 'Select',
      track: 'Track',
      turnoutLeft: 'Turnout left',
      turnoutRight: 'Turnout right',
      wye: 'Wye',
      threeWay: 'Three-way',
      crossing: 'Crossing',
      singleSlip: 'Single slip',
      doubleSlip: 'Double slip',
      signal: 'Signal',
      bufferStop: 'Buffer stop',
      virtualPoint: 'Route point',
      connector: 'Station exit',
      accessory: 'Uncoupler / accessory',
      label: 'Text',
      platform: 'Platform',
    },
    toolHelp: {
      select:
        'Click to select, Shift+click to add, drag to move. Drag empty space to select an area.',
      track:
        'Click to start, click for each corner, click the last point again or double-click to finish.',
      place: 'Click to place. R rotates before placing.',
    },
    undo: 'Undo',
    redo: 'Redo',
    rotate: 'Rotate (R)',
    delete: 'Delete',
    fit: 'Fit to view',
    testMode: 'Test outputs',
    testModeHelp:
      'Test mode: click a turnout, signal or accessory to step through its positions. Commands are sent to the layout.',
    addView: 'Add station',
    deleteView: 'Delete this station',
    confirmDeleteView: (name: string) =>
      `Delete the station “${name}” and everything drawn in it?`,
    replaceTitle: 'Replace element',
    confirmReplace: (what: string) =>
      `Replace ${what}? Its name, addresses and settings are removed. Undo (Ctrl+Z) brings them back.`,
    replace: 'Replace',
    newViewName: 'New station',
    hints: {
      notOnTrack: 'Place this on a track.',
      notAtTrackEnd: 'Place this at the end of a track.',
      notStraight: 'Track can only run straight or at 45°.',
    },
    problems: 'Problems',
    addresses: 'Addresses',
    showNotes: 'Show notes',
    noProblems: 'No problems found.',
    unsaved: 'Saving…',
    saved: 'Saved',
    notSavedYet: 'Not saved yet',
    changeNotSaved:
      'That change could not be made: it would have damaged the layout. Nothing was changed. (Details in the developer console.)',
    changeReadOnly:
      'That change was not saved: this layout is open read-only (it is being edited elsewhere).',
    migrated: (version: number) => `Updated from format ${version}`,
  },

  colorPicker: {
    none: 'None',
    area: 'Saturation and brightness',
    areaValue: (saturation: number, brightness: number) =>
      `Saturation ${saturation} %, brightness ${brightness} %`,
    hue: 'Hue',
    hex: 'Hex',
    presets: 'Colours',
  },
  properties: {
    title: 'Properties',
    nothingSelected: 'Nothing selected.',
    selectedCount: (count: number) => `${count} elements selected`,
    name: 'Name',
    area: 'Automation area',
    areas: 'Automation areas',
    areasHelp:
      'Every station is one area. Add areas for parts of a station or for the line between stations, then choose the area in an element’s properties (or for several selected elements at once).',
    areaName: 'Area name',
    areaLevel: 'Level',
    addArea: 'Add area',
    removeArea: 'Remove area',
    newAreaName: 'New area',
    mixedAreas: 'Different areas',
    areaDefault: (name: string, level: number) =>
      `Station default (${name}, Level ${level})`,
    level: (level: number) => `Level ${level}`,
    type: 'Type',
    rotate: 'Rotate',
    reverse: 'Reverse direction',
    side: 'Side of the track',
    sideLeft: 'Left',
    sideRight: 'Right',
    control: 'Connection',
    controlManual: 'Not connected (thrown by hand)',
    controlDcc: 'DCC accessory addresses',
    controlExtended: 'Extended accessory (firmware 1.40+)',
    address: (index: number) =>
      index === 0 ? 'Address' : `Address ${index + 1}`,
    addressCount: 'Number of addresses',
    decoder: (dccAddress: number, port: number) =>
      `Decoder ${dccAddress}, port ${port + 1}`,
    invert: 'Swap outputs 1 and 2',
    pulse: 'Pulse length (ms)',
    pulseDefault: (ms: number) => `Project default (${ms} ms)`,
    outputMap: 'Outputs per position',
    outputMapReset: 'Use defaults',
    output: (n: number) => `Output ${n}`,
    extendedAddress: 'Extended address',
    extendedValue: 'Value',
    test: 'Test',
    testHint: 'Sends the command to the layout.',
    positionFeedback: 'Position feedback (optional)',
    signalType: 'Signal type',
    distantFor: 'Repeats main signal',
    none: 'None',
    block: 'Block',
    newBlock: 'New block',
    blockName: 'Block name',
    feedbackInputs: 'Feedback inputs',
    addInput: 'Add input',
    removeInput: 'Remove',
    releaseDelay: 'Release delay (ms)',
    source: 'Source',
    module: 'Module',
    input: 'Input',
    port: 'Port',
    feedbackAddress: 'Address',
    role: 'Kind',
    roles: {
      uncoupler: 'Uncoupler track',
      light: 'Light',
      other: 'Other',
    } as Record<string, string>,
    buttonType: 'Button',
    momentary: 'Momentary (pulse)',
    toggle: 'On / off',
    text: 'Text',
    size: 'Size',
    sizes: {small: 'Small', normal: 'Normal', large: 'Large'} as Record<
      string,
      string
    >,
    textColor: 'Text colour',
    textColorDefault: 'Normal',
    textColorPresets: {
      red: 'Red',
      orange: 'Orange',
      yellow: 'Yellow',
      green: 'Green',
      blue: 'Blue',
      violet: 'Violet',
      grey: 'Grey',
    } as Record<string, string>,
    width: 'Width',
    height: 'Height',
    stationName: 'Station name',
    layoutName: 'Layout name',
    project: 'Layout',
    station: 'Station',
    defaultLevel: 'Default automation level',
    editPassword: 'Edit password',
    setPassword: 'Set password',
    changePassword: 'Change password',
    removePassword: 'Remove password',
    passwordSet: 'An edit password is set.',
    passwordNotSet: 'No edit password.',
    newPassword: 'New password',
    centralUnit: 'Central unit settings',
    centralUnitHelp:
      'Settings that may differ between central units (z21, Z21, DR5000). Change these if turnouts move the wrong way or not at all.',
    addressOffset: 'Address offset',
    addressOffsetHelp: '0 = numbers as in the Roco app.',
    straightOutput: 'Output for “straight”',
    gap: 'Pause between accessory commands (ms)',
    commandMode: 'Turnout commands',
    commandModePulse: 'Lever times each pulse (works everywhere)',
    commandModeQueued: 'Queued by the central unit (firmware 1.24+)',
    confirmation: 'Turnout position confirmed',
    confirmationReport: 'Only when the central unit reports it',
    confirmationAssume: 'Also after a timeout without report',
    confirmTimeout: 'Timeout (ms)',
    positionRefresh: 'Ask for turnout positions every (s)',
    positionRefreshHelp:
      '0 = off. For central units that do not report turnouts switched by other programs (DR5000: WinDigipet over USB). Lever then asks for the positions of the station on screen this often, and at once when you act.',
    statusRefresh: 'Ask for central unit status every (s)',
    statusRefreshHelp:
      '0 = only every 25 s. Shows STOP, track power and short circuits caused by other devices at once on central units that do not report them (DR5000), and notices a broken connection sooner.',
    feedbackSources: 'Feedback buses used',
    blockReleaseDelay: 'Default block release delay (ms)',
    autoSignals: 'Set signals along routes automatically',
    pairedWith: 'Leads to',
    notPaired: 'Not linked (line not drawn)',
    unnamedExitAt: (arrow: string, x: number, y: number) =>
      `exit ${arrow} at ${x}, ${y}`,
    linkedElsewhere: 'linked elsewhere',
    pairingHelp:
      'Link this exit with the exit at the other end of the line, in another station or in this one. Routes then continue through it, and in operating mode clicking the exit opens the other end.',
    restoreTurnouts: 'Restore turnout positions on startup',
    restoreTurnoutsHelp:
      'When Lever opens this project, it switches every connected turnout to its last confirmed position, one after another. Only the positions this PC saw are known.',
  },

  validation: {
    severity: {error: 'Error', warning: 'Warning', info: 'Note'},
    invalidTrackAngle: () => 'Track with a bend that is not 45° or 90°.',
    signalNotOnTrack: () => 'Signal is not on a track.',
    signalFacingAcrossTrack: () => 'Signal does not point along its track.',
    unknownSignalType: () => 'Signal type is missing.',
    duplicateAddress: (p: Record<string, string | number>) =>
      `Address ${p['address']} is used by more than one element.`,
    missingAddress: (p: Record<string, string | number>) =>
      `Needs ${p['required']} address${p['required'] === 1 ? '' : 'es'}, has ${p['count']}.`,
    addressOutOfRange: () => 'Address out of range (check the address offset).',
    openTrackEnd: () =>
      'Open track end (add a buffer stop, a station exit, or more track).',
    junctionWithoutTurnout: () => 'Tracks meet without a turnout.',
    trackThroughTurnout: () => 'Track runs through the middle of a turnout.',
    overlappingTrack: () => 'Two tracks lie on top of each other.',
    endMarkerNotAtTrackEnd: () =>
      'Buffer stop or station exit is not at the end of a track.',
    feedbackInputConflict: (p: Record<string, string | number>) =>
      `Feedback input ${p['input']} is used by more than one block.`,
    invalidDistantSignal: () =>
      'Distant signal setting does not match a main signal.',
    manualTurnout: () => 'Turnout is not connected (thrown by hand).',
    trackWithoutFeedback: (p: Record<string, string | number>) =>
      `${p['count']} track piece${p['count'] === 1 ? '' : 's'} without feedback.`,
    unpairedConnector: () => 'Station exit not linked to another station.',
    brokenConnectorPair: () =>
      'Station exit linked to an exit that is gone or linked elsewhere. Choose its partner again.',
    tracksCrossWithoutConnection: () =>
      'Tracks cross without being connected (an overpass).',
  },

  addressTable: {
    station: 'Station',
    name: 'Name',
    kind: 'Kind',
    address: 'Address',
    decoder: 'Decoder / port',
    detail: 'Detail',
    conflict: 'Used twice',
    allStations: 'All stations',
    allKinds: 'All kinds',
    search: 'Search',
    empty: 'No addresses used yet.',
    types: {accessory: 'Accessory', extended: 'Extended', feedback: 'Feedback'},
  },

  kinds: {
    track: 'Track',
    turnout: 'Turnout',
    signal: 'Signal',
    bufferStop: 'Buffer stop',
    virtualPoint: 'Route point',
    connector: 'Station exit',
    accessory: 'Accessory',
    label: 'Text',
    platform: 'Platform',
    block: 'Block',
  } as Record<string, string>,

  turnoutTypes: {
    left: 'Turnout, left',
    right: 'Turnout, right',
    wye: 'Wye turnout',
    threeWay: 'Three-way turnout',
    crossing: 'Crossing',
    singleSlip: 'Single slip',
    doubleSlip: 'Double slip',
  } as Record<string, string>,

  positions: {
    straight: 'Straight',
    diverging: 'Diverging',
    left: 'Left',
    right: 'Right',
  } as Record<string, string>,

  test: {
    sent: 'sent',
    manual: 'not connected: set it by hand',
    on: 'on',
    off: 'off',
    incomplete: {
      missingAddress: 'no address set',
      addressOutOfRange: 'address out of range (check the address offset)',
      unknownPosition: 'unknown signal type or position',
      noOutputs: 'no outputs set for this position',
      noExtendedValue: 'no extended accessory value set',
    },
  },

  signalTypes: {
    main2: 'Main signal, 2 aspects',
    main3: 'Main signal, 3 aspects',
    distant: 'Distant signal',
    shunting: 'Shunting signal',
    aspects: {
      stop: 'Stop',
      proceed: 'Proceed',
      reduced: 'Proceed, reduced speed',
      expectStop: 'Expect stop',
      expectProceed: 'Expect proceed',
      shuntStop: 'Stop',
      shuntAllowed: 'Shunting allowed',
    },
  },

  notices: {
    extAccessoryUnsupported: () =>
      'The central unit’s firmware is too old for extended accessories (needs 1.40). Nothing was sent.',
    refused: (name: string, reason?: string) =>
      reason === 'signalNeedsRoute'
        ? `${name}: at Level 2 signals are set by routes. Click it for "Route from here".`
        : `${name}: not possible at this automation level.`,
    incomplete: (name: string, reason: string) =>
      `${name}: ${(strings.test.incomplete as Record<string, string>)[reason] ?? reason}. Nothing was sent.`,
    failed: (name: string) =>
      `${name}: the central unit did not confirm the change, also after a second try. Check the turnout or signal.`,
    labelNeedsFeedback: (name: string) =>
      `${name}: train numbers can only be shown on track with feedback.`,
    routeRefused: (reason: string) =>
      ({
        noRoute: 'No route between these points.',
        changed:
          'The layout changed since the route was shown. Choose the route again.',
        needsLevel2:
          'Routes start in a Level 2 area. Change the area’s level under Levels.',
        levelNotAvailable:
          'This route crosses an area at a level that is not available yet.',
        crossing:
          'This route crosses another route. Show it again and confirm the crossing.',
      })[reason] ?? 'The route could not be set.',
    routeSet: (manual: string[]) =>
      manual.length > 0
        ? `Route set. Throw by hand: ${manual.join(', ')}.`
        : 'Route set.',
    routeFailed: (turnout: string) =>
      `Route not set: ${turnout} did not move. Check it, then cancel the route or try again.`,
    routeReleasedMoved: (turnout: string) =>
      `Route released: ${turnout} moved. Its signals were set to stop.`,
    routeCancelled: (from: string, to: string) =>
      `Route ${from} → ${to} cancelled: the new route conflicts with it. Its signals were set to stop.`,
    routeUndone: (skipped: string[], manualBack: string[]) =>
      [
        'Last route undone.',
        skipped.length > 0
          ? `Left alone (moved since): ${skipped.join(', ')}.`
          : '',
        manualBack.length > 0
          ? `Put back by hand: ${manualBack.join(', ')}.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    dismiss: 'Dismiss',
  },

  // Developer tools: test accessories and feedback without a layout.
  developer: {
    title: 'Accessory and feedback test',
    short: 'Accessory test',
    turnoutNumber: 'Turnout number (as in the Roco app)',
    output1: 'Output 1',
    output2: 'Output 2',
    askPosition: 'Ask position',
    dccAddress: (dccAddress: number, port: number) =>
      `DCC decoder address ${dccAddress}, port ${port + 1}`,
    queue: (count: number) =>
      count === 0
        ? 'No accessory commands waiting'
        : `${count} accessory command${count === 1 ? '' : 's'} waiting`,
    accessoriesHeading: 'Accessories seen',
    noAccessories: 'None yet. Switch one here, or from another app.',
    feedbackHeading: 'Feedback',
    noFeedback: 'No feedback inputs reported.',
    feedbackSources: {
      rbus: 'R-Bus',
      loconet: 'LocoNet detectors',
      can: 'CAN detectors',
    },
    occupiedOnly: 'Occupied inputs',
  },

  accessoryState: {
    unknown: 'Unknown',
    notSwitched: 'Not switched since power-up',
    output1: 'Output 1',
    output2: 'Output 2',
    invalid: 'Invalid report',
    waiting: (output: number) => `Waiting for output ${output}…`,
  },

  feedback: {
    occupied: 'Occupied',
    free: 'Free',
    overload: (level: number) => `Overload ${level}`,
    input: (key: string) => {
      const [source, a, b] = key.split(':');
      switch (source) {
        case 'rbus':
          return `R-Bus module ${a}, input ${b}`;
        case 'loconet':
          return `LocoNet address ${a}`;
        case 'can':
          return `CAN module ${a}, port ${b}`;
        default:
          return key;
      }
    },
    locos: (addresses: number[]) => `Locos: ${addresses.join(', ')}`,
  },
};

export type Strings = typeof en;

const TABLES: Record<Language, Strings> = {en, fi};

// The language of this page: renderers get it from the preload; elsewhere
// (main process, engine, tests) it starts in English.
const pageLanguage = (): Language =>
  (globalThis as {lever?: {language?: unknown}}).lever?.language === 'fi'
    ? 'fi'
    : 'en';

export let strings: Strings = TABLES[pageLanguage()];

export const setLanguage = (language: Language): void => {
  strings = TABLES[language];
};
