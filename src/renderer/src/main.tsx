import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {applyTheme, resolveThemeMode} from '../theme';
import {App} from './App';
import {requestFit, startNewRoute, switchToTab} from './quickKeys';
import {shortcutAction, tabNumberKey} from './safety/shortcuts';
import {bindEngineStore, sendCommand} from './store/engineStore';
import {bindProjectStore} from './store/projectStore';
import {bindSettingsStore, useSettingsStore} from './store/settingsStore';
import './styles.css';

// The page's language (screen readers, hyphenation); strings.ts uses it too.
document.documentElement.lang = window.lever.language;

bindEngineStore();
bindSettingsStore();
bindProjectStore();

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

// STOP, track power and the other quick keys (CARRY-2), and 1–9 for the
// tabs. Registered in the capture phase on window, so no component can
// swallow them.
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
    } else if (action === 'resume') {
      event.preventDefault();
      sendCommand({type: 'setTrackPower', on: true});
    } else if (action === 'undoRoute') {
      event.preventDefault();
      sendCommand({type: 'undoRoute'});
    } else if (action === 'newRoute') {
      event.preventDefault();
      startNewRoute();
    } else if (action === 'fitView') {
      event.preventDefault();
      requestFit();
    } else {
      const tab = tabNumberKey(event);
      if (tab !== undefined && switchToTab(tab)) {
        event.preventDefault();
      }
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
