// Operate / Edit switch (EDT-1). Operating is the default; editing is entered
// deliberately, with the project's edit password if one is set. A read-only
// project (open in another instance) cannot be edited.
import {FormEvent, useState} from 'react';
import {strings} from '../../../shared/strings';
import {checkPassword} from '../editor/password';
import {setMode, useProjectStore} from '../store/projectStore';
import {Modal} from './Modal';

export const ModeSwitch = () => {
  const mode = useProjectStore((state) => state.mode);
  const document = useProjectStore((state) => state.document);
  const project = useProjectStore((state) => state.project);
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);
  const readOnly = document?.readOnly ?? true;

  const startEditing = () => {
    if (project?.settings.editPassword) {
      setAsking(true);
      setPassword('');
      setWrong(false);
    } else {
      setMode('edit');
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const stored = project?.settings.editPassword;
    if (!stored) {
      return;
    }
    void checkPassword(password, stored).then((ok) => {
      if (ok) {
        setAsking(false);
        setMode('edit');
      } else {
        setWrong(true);
      }
    });
  };

  return (
    <div className="mode-switch" role="group" aria-label={strings.modes.edit}>
      <button
        type="button"
        className={`mode-button${mode === 'operate' ? ' mode-button--active' : ''}`}
        aria-pressed={mode === 'operate'}
        onClick={() => setMode('operate')}
      >
        {strings.modes.operate}
      </button>
      <button
        type="button"
        className={`mode-button mode-button--edit${mode === 'edit' ? ' mode-button--active' : ''}`}
        aria-pressed={mode === 'edit'}
        disabled={readOnly}
        title={readOnly ? strings.modes.readOnly : undefined}
        onClick={startEditing}
      >
        {strings.modes.edit}
      </button>
      {asking && (
        <Modal title={strings.modes.passwordTitle}>
          <form className="form" onSubmit={submit}>
            <label className="field">
              <span>{strings.modes.passwordPrompt}</span>
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {wrong && (
              <p className="form-error" role="alert">
                {strings.modes.wrongPassword}
              </p>
            )}
            <div className="button-row">
              <button type="submit" className="button">
                {strings.modes.unlock}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => setAsking(false)}
              >
                {strings.modes.cancel}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
