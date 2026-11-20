import {FormEvent, useState} from 'react';
import {LANGUAGES} from '../../../shared/language';
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

// Keys offered for "undo last route": none of them is Esc (STOP) or
// typed text, and Ctrl+Z is never used (RTE-6b).
const UNDO_ROUTE_KEYS = [
  ...Array.from({length: 12}, (_, i) => `F${i + 1}`),
  'Backspace',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
];

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
          checked={protocolLog}
          // The main process applies the setting to the engine.
          onChange={(event) =>
            void updateSettings({protocolLog: event.target.checked})
          }
        />
        {strings.settings.protocolLog}
      </label>

      <label className="field">
        <span>{strings.settings.undoRouteKey}</span>
        <select
          value={settings.shortcuts.undoRoute ?? ''}
          onChange={(event) =>
            void updateSettings({
              shortcuts: {
                ...settings.shortcuts,
                undoRoute: event.target.value || null,
              },
            })
          }
        >
          <option value="">{strings.settings.noKey}</option>
          {UNDO_ROUTE_KEYS.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
};
