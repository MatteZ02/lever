// Reads and writes settings.json in the user data folder. Invalid or missing
// values fall back to defaults; a broken file is kept as a backup.
import {existsSync} from 'node:fs';
import {readFile, rename, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {app} from 'electron';
import {
  defaultSettings,
  Settings,
  settingsSchema,
  SettingsUpdate,
} from '../shared/settings';

const settingsPath = () => join(app.getPath('userData'), 'settings.json');

export const loadSettings = async (): Promise<Settings> => {
  const path = settingsPath();
  if (!existsSync(path)) {
    return defaultSettings();
  }
  try {
    const parsed = settingsSchema.safeParse(
      JSON.parse(await readFile(path, 'utf8')),
    );
    if (parsed.success) {
      return parsed.data;
    }
    console.error('Settings invalid, using defaults:', parsed.error.message);
  } catch (error) {
    console.error('Settings unreadable, using defaults:', error);
  }
  await rename(path, `${path}.broken-${Date.now()}`).catch(() => undefined);
  return defaultSettings();
};

// Writes atomically (temporary file, then rename), so another instance never
// reads a half-written file.
export const saveSettings = async (settings: Settings): Promise<void> => {
  const path = settingsPath();
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
};

export const applySettingsUpdate = (
  settings: Settings,
  update: SettingsUpdate,
): Settings =>
  settingsSchema.parse({
    ...settings,
    ...update,
    centralUnit: update.centralUnit ?? settings.centralUnit,
    shortcuts: update.shortcuts ?? settings.shortcuts,
  });
