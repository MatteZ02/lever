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
    const {settings, settingsOpen} = useSettingsStore.getState();
    // Off while Settings is open, so keys can be chosen there (the STOP
    // button on screen still works).
    if (settingsOpen) {
      return;
    }
    // A quick key acts here and goes no further (e.g. not to the editor).
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    const action = shortcutAction(event, settings.shortcuts);
    if (action === 'stop') {
      handled();
      sendCommand({type: 'emergencyStop'});
    } else if (action === 'trackPowerOff') {
      handled();
      sendCommand({type: 'setTrackPower', on: false});
    } else if (action === 'resume') {
      handled();
      sendCommand({type: 'setTrackPower', on: true});
    } else if (action === 'undoRoute') {
      handled();
      sendCommand({type: 'undoRoute'});
    } else if (action === 'newRoute') {
      handled();
      startNewRoute();
    } else if (action === 'fitView') {
      handled();
      requestFit();
    } else {
      const tab = tabNumberKey(event);
      if (tab !== undefined && switchToTab(tab)) {
        handled();
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
