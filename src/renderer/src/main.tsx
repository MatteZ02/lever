import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {applyTheme, resolveThemeMode} from '../theme';
import {App} from './App';
import {shortcutAction} from './safety/shortcuts';
import {bindEngineStore, sendCommand} from './store/engineStore';
import {bindSettingsStore, useSettingsStore} from './store/settingsStore';
import './styles.css';

bindEngineStore();
bindSettingsStore();

// Theme follows the setting, and Windows when set to "system".
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const updateTheme = () => {
  applyTheme(
    resolveThemeMode(
      useSettingsStore.getState().settings.theme,
      darkQuery.matches,
    ),
    document.documentElement,
  );
};
updateTheme();
darkQuery.addEventListener('change', updateTheme);
useSettingsStore.subscribe(updateTheme);

// STOP and track power shortcuts (CARRY-2). Registered in the capture phase
// on window, so no component can swallow them.
window.addEventListener(
  'keydown',
  (event) => {
    const action = shortcutAction(
      event,
      useSettingsStore.getState().settings.shortcuts,
    );
    if (action === 'stop') {
      event.preventDefault();
      sendCommand({type: 'emergencyStop'});
    } else if (action === 'trackPowerOff') {
      event.preventDefault();
      sendCommand({type: 'setTrackPower', on: false});
    }
  },
  {capture: true},
);

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
