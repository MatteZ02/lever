// Form fields for the properties panel. Text and number fields commit on
// Enter or when focus leaves, so one change is one undo step. (Esc in a
// field does nothing: Esc is STOP everywhere else, CARRY-2.)
import {ReactNode, useState} from 'react';

type CommitProps<T> = {
  label: string;
  value: T;
  onCommit: (value: T) => void;
  disabled?: boolean;
  help?: string;
};

export const TextField = ({
  label,
  value,
  onCommit,
  disabled,
  help,
}: CommitProps<string>) => {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const shown = editing ? draft : value;
  const commit = () => {
    setEditing(false);
    if (draft !== value) {
      onCommit(draft);
    }
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        value={shown}
        disabled={disabled}
        onFocus={() => {
          setDraft(value);
          setEditing(true);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
      {help && <small className="muted">{help}</small>}
    </label>
  );
};

type NumberProps = CommitProps<number | undefined> & {
  min?: number;
  max?: number;
  placeholder?: string;
  // Allow clearing the field (undefined = default).
  optional?: boolean;
};

export const NumberField = ({
  label,
  value,
  onCommit,
  disabled,
  help,
  min,
  max,
  placeholder,
  optional,
}: NumberProps) => {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  const [editing, setEditing] = useState(false);
  const shown = editing ? draft : value === undefined ? '' : String(value);
  const commit = () => {
    setEditing(false);
    if (draft.trim() === '') {
      if (optional && value !== undefined) {
        onCommit(undefined);
      }
      return;
    }
    const number = Number(draft);
    if (
      Number.isInteger(number) &&
      (min === undefined || number >= min) &&
      (max === undefined || number <= max) &&
      number !== value
    ) {
      onCommit(number);
    }
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={shown}
        min={min}
        max={max}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setDraft(value === undefined ? '' : String(value));
          setEditing(true);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
      {help && <small className="muted">{help}</small>}
    </label>
  );
};

export const SelectField = <T extends string>({
  label,
  value,
  options,
  onCommit,
  disabled,
}: {
  label: string;
  value: T;
  options: {value: T; label: string}[];
  onCommit: (value: T) => void;
  disabled?: boolean;
}) => (
  <label className="field">
    <span>{label}</span>
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onCommit(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
);

export const CheckField = ({
  label,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  value: boolean;
  onCommit: (value: boolean) => void;
  disabled?: boolean;
}) => (
  <label className="choice">
    <input
      type="checkbox"
      checked={value}
      disabled={disabled}
      onChange={(event) => onCommit(event.target.checked)}
    />
    {label}
  </label>
);

export const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <fieldset className="properties-section">
    <legend>{title}</legend>
    {children}
  </fieldset>
);
