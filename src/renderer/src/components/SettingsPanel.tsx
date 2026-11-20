import {FormEvent, useEffect, useState} from 'react';
import {LANGUAGES} from '../../../shared/language';
import {Settings} from '../../../shared/settings';
import {strings} from '../../../shared/strings';
import {isModifierKey, keyLabel, keyMatches} from '../safety/shortcuts';
import {useEngineStore} from '../store/engineStore';
import {
  setSettingsOpen,
  updateSettings,
  useSettingsStore,
} from '../store/settingsStore';

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

const QUICK_KEY_ACTIONS = [
  'stop',
  'resume',
  'trackPowerOff',
  'undoRoute',
  'newRoute',
  'fitView',
] as const;
type QuickKeyAction = (typeof QUICK_KEY_ACTIONS)[number];

// Any key can be a quick key: "Change", then press it. Keys with Ctrl, Alt
// or Windows are not taken (they belong to the system and the menu), nor
// a key another action has. Quick keys are off while this panel is open,
// so the press only records.
const QuickKeys = ({shortcuts}: {shortcuts: Settings['shortcuts']}) => {
  const [recording, setRecording] = useState<QuickKeyAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const text = strings.settings;

  useEffect(() => {
    if (!recording) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (isModifierKey(event.key)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey || event.altKey || event.metaKey) {
        setMessage(text.keyWithModifier);
        return;
      }
      const other = QUICK_KEY_ACTIONS.find((action) => {
        const key = shortcuts[action];
        return action !== recording && key && keyMatches(event.key, key);
      });
      if (other) {
        setMessage(text.keyTaken(text.quickKeyActions[other]));
        return;
      }
      setMessage(null);
      setRecording(null);
      void updateSettings({shortcuts: {...shortcuts, [recording]: event.key}});
    };
    window.addEventListener('keydown', onKey, {capture: true});
    return () => window.removeEventListener('keydown', onKey, {capture: true});
  }, [recording, shortcuts, text]);

  return (
    <fieldset>
      <legend>{text.quickKeys}</legend>
      <small className="muted">{text.quickKeysHelp}</small>
      {QUICK_KEY_ACTIONS.map((action) => {
        const key = shortcuts[action];
        const isRecording = recording === action;
        return (
          <div key={action} className="quick-key">
            <span>{text.quickKeyActions[action]}</span>
            <kbd className="quick-key-value">
              {isRecording ? text.pressKey : key ? keyLabel(key) : text.noKey}
            </kbd>
            <button
              type="button"
              className="button button--small"
              aria-pressed={isRecording}
              onClick={() => {
                setMessage(null);
                setRecording(isRecording ? null : action);
              }}
            >
              {isRecording ? text.cancelKey : text.changeKey}
            </button>
            {/* STOP always has a key. */}
            {action !== 'stop' && key && !isRecording && (
              <button
                type="button"
                className="button button--small"
                onClick={() =>
                  void updateSettings({
                    shortcuts: {...shortcuts, [action]: null},
                  })
                }
              >
                {text.removeKey}
              </button>
            )}
          </div>
        );
      })}
      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}
    </fieldset>
  );
};

export const SettingsPanel = () => {
  const settings = useSettingsStore((state) => state.settings);
  // Quick keys are off while this panel is open.
  useEffect(() => {
    setSettingsOpen(true);
    return () => setSettingsOpen(false);
  }, []);
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
