// All user-visible text (CON-4). English only. Used by the main process
// (menus, dialogs) and the renderer. Keep wording plain, without jargon
// (CARRY-4).

export const strings = {
  appName: 'Lever',

  menu: {
    file: 'File',
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
  },

  settings: {
    title: 'Settings',
    theme: 'Colours',
    themeSystem: 'Same as Windows',
    themeLight: 'Light',
    themeDark: 'Dark',
    protocolLog: 'Protocol log (for troubleshooting)',
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
    extAccessoryUnsupported:
      'The central unit’s firmware is too old for extended accessories (needs 1.40). Nothing was sent.',
    dismiss: 'Dismiss',
  },

  // Developer tools: test accessories and feedback without a layout.
  developer: {
    title: 'Accessory and feedback test',
    turnoutNumber: 'Turnout number (as in the Roco app)',
    output1: 'Output 1',
    output2: 'Output 2',
    askPosition: 'Ask position',
    dccAddress: (dccAddress: number, port: number) =>
      `DCC decoder address ${dccAddress}, port ${port}`,
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
} as const;
