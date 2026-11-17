import {create} from 'zustand';
import {
  defaultSettings,
  Settings,
  SettingsUpdate,
} from '../../../shared/settings';

type SettingsState = {
  settings: Settings;
  loaded: boolean;
};

export const useSettingsStore = create<SettingsState>()(() => ({
  settings: defaultSettings(),
  loaded: false,
}));

export const updateSettings = async (update: SettingsUpdate): Promise<void> => {
  const settings = await window.lever.settings.update(update);
  useSettingsStore.setState({settings});
};

// Loads settings and follows changes made in other windows. Call once.
export const bindSettingsStore = (): (() => void) => {
  void window.lever.settings.get().then((settings) => {
    useSettingsStore.setState({settings, loaded: true});
  });
  return window.lever.settings.onChange((settings) => {
    useSettingsStore.setState({settings, loaded: true});
  });
};
