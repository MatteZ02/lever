import {FormEvent, useState} from 'react';
import {LANGUAGES} from '../../../shared/language';
import {Settings} from '../../../shared/settings';
import {strings} from '../../../shared/strings';
import {useEngineStore} from '../store/engineStore';
import {updateSettings, useSettingsStore} from '../store/settingsStore';

type CentralUnitFormProps = {host: string; port: number};

// Remounted (via key) when the saved address changes, e.g. in another window.
const CentralUnitForm = (props: CentralUnitFormProps) => {
  const [host, setHost] = useState(props.host);
  const [port, setPort] = useState(String(props.port));
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const portNumber = Number(port);
    if (host.trim() === '') {
      setError(strings.errors.invalidHost);
      return;
    }
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      setError(strings.errors.invalidPort);
      return;
    }
    setError(null);
    void updateSettings({centralUnit: {host: host.trim(), port: portNumber}});
  };

  return (
    <form className="form" onSubmit={submit}>
      <fieldset>
        <legend>{strings.connection.centralUnit}</legend>
        <label>
          {strings.connection.address}
          <input
            type="text"
            value={host}
            onChange={(event) => setHost(event.target.value)}
            spellCheck={false}
          />
        </label>
        <label>
          {strings.connection.port}
          <input
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(event) => setPort(event.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button">
          {strings.connection.connect}
        </button>
      </fieldset>
    </form>
  );
};

// Keys offered for the quick keys: none of them is typed text, Ctrl+Z is
// never used (RTE-6b), and F11 belongs to the menu (full screen). Esc is
// offered for STOP only.
const QUICK_KEYS = [
  ...Array.from({length: 12}, (_, i) => `F${i + 1}`).filter(
    (key) => key !== 'F11',
  ),
  'Backspace',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
];

const QUICK_KEY_ACTIONS = [
  'stop',
  'resume',
  'trackPowerOff',
  'undoRoute',
  'newRoute',
  'fitView',
] as const;
type QuickKeyAction = (typeof QUICK_KEY_ACTIONS)[number];

const QuickKeys = ({shortcuts}: {shortcuts: Settings['shortcuts']}) => {
  // Which action has a key, so one key is never given to two actions.
  const usedBy = (key: string, except: QuickKeyAction) =>
    QUICK_KEY_ACTIONS.find(
      (action) => action !== except && shortcuts[action] === key,
    );
  return (
    <fieldset>
      <legend>{strings.settings.quickKeys}</legend>
      <small className="muted">{strings.settings.quickKeysHelp}</small>
      {QUICK_KEY_ACTIONS.map((action) => {
        const keys = action === 'stop' ? ['Escape', ...QUICK_KEYS] : QUICK_KEYS;
        return (
          <label key={action} className="field">
            <span>{strings.settings.quickKeyActions[action]}</span>
            <select
              value={shortcuts[action] ?? ''}
              onChange={(event) =>
                void updateSettings({
                  shortcuts: {
                    ...shortcuts,
                    [action]: event.target.value || null,
                  },
                })
              }
            >
              {/* STOP always has a key. */}
              {action !== 'stop' && (
                <option value="">{strings.settings.noKey}</option>
              )}
              {keys.map((key) => {
                const other = usedBy(key, action);
                return (
                  <option key={key} value={key} disabled={other !== undefined}>
                    {other
                      ? strings.settings.keyUsedBy(
                          key,
                          strings.settings.quickKeyActions[other],
                        )
                      : key}
                  </option>
                );
              })}
            </select>
          </label>
        );
      })}
    </fieldset>
  );
};

export const SettingsPanel = () => {
  const settings = useSettingsStore((state) => state.settings);
  const protocolLog = useEngineStore((state) => state.protocolLog);
  const {host, port} = settings.centralUnit;

  return (
    <section className="panel" aria-labelledby="settings-title">
      <h2 id="settings-title">{strings.settings.title}</h2>
      <CentralUnitForm key={`${host}:${port}`} host={host} port={port} />

      <fieldset>
        <legend>{strings.settings.theme}</legend>
        {(['system', 'light', 'dark'] as const).map((theme) => (
          <label key={theme} className="choice">
            <input
              type="radio"
              name="theme"
              checked={settings.theme === theme}
              onChange={() => void updateSettings({theme})}
            />
            {theme === 'system'
              ? strings.settings.themeSystem
              : theme === 'light'
                ? strings.settings.themeLight
                : strings.settings.themeDark}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>{strings.settings.language}</legend>
        {LANGUAGES.map((language) => (
          <label key={language} className="choice" lang={language}>
            <input
              type="radio"
              name="language"
              checked={settings.language === language}
              onChange={() => void updateSettings({language})}
            />
            {strings.settings.languageNames[language]}
          </label>
        ))}
        <small className="muted">{strings.settings.languageHelp}</small>
      </fieldset>

      <label className="choice">
        <input
          type="checkbox"
          checked={settings.devTools}
          onChange={(event) =>
            void updateSettings({devTools: event.target.checked})
          }
        />
        {strings.settings.devTools}
      </label>
      <small className="muted">{strings.settings.devToolsHelp}</small>

      <label className="choice">
        <input
          type="checkbox"
          checked={protocolLog}
          // The main process applies the setting to the engine.
          onChange={(event) =>
            void updateSettings({protocolLog: event.target.checked})
          }
        />
        {strings.settings.protocolLog}
      </label>

      <QuickKeys shortcuts={settings.shortcuts} />
    </section>
  );
};
