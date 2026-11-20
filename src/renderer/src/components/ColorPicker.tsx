// A colour picker: a button showing the colour, which opens a panel with a
// saturation/brightness area, a hue slider, preset colours and a hex field.
// Generic: the value is '#rrggbb', or undefined when `noneLabel` is given and
// the default colour is wanted. Dragging changes the panel's preview only;
// the colour is committed when the pointer or key is released, so one choice
// is one undo step. The panel closes with its button or a click elsewhere,
// never with Esc (Esc is STOP).
import {KeyboardEvent, PointerEvent, useEffect, useRef, useState} from 'react';
import {strings} from '../../../shared/strings';
import {
  hexToHsv,
  Hsv,
  hsvToHex,
  normalizeHex,
  pickerAreaBackground,
  pickerHueBackground,
  pickerMarker,
  pickerStartColor,
} from '../../theme';

export type ColorPreset = {color: string; name: string};

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const STEP = 0.05;

export const ColorPicker = ({
  label,
  value,
  onCommit,
  presets = [],
  noneLabel,
  disabled,
}: {
  label: string;
  value: string | undefined;
  onCommit: (value: string | undefined) => void;
  presets?: readonly ColorPreset[];
  // Offer "no colour" (undefined) under this name.
  noneLabel?: string;
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() =>
    hexToHsv(value ?? pickerStartColor),
  );
  // The value the draft was last taken from: when it changes elsewhere (undo,
  // another window), the draft follows. The hue is kept for greys, whose hex
  // carries none.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (value && value !== hsvToHex(hsv)) {
      setHsv(hexToHsv(value));
    }
  }
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const draftHex = hsvToHex(hsv);
  const commit = (next: string | undefined) => {
    if (next !== value) {
      onCommit(next);
    }
  };
  const commitDraft = () => commit(draftHex);

  // The colour under the pointer in the area (also used on release, so a
  // quick click commits where it landed, not the previous render's draft).
  const fromPointer = (event: PointerEvent<HTMLDivElement>): Hsv => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return hsv;
    }
    const next = {
      h: hsv.h,
      s: clamp((event.clientX - rect.left) / rect.width),
      v: 1 - clamp((event.clientY - rect.top) / rect.height),
    };
    setHsv(next);
    return next;
  };
  // The hue slider's value, read from the element for the same reason.
  const commitHue = (input: HTMLInputElement) =>
    commit(hsvToHex({...hsv, h: Number(input.value)}));

  const onAreaKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const change: Partial<Record<string, [number, number]>> = {
      ArrowLeft: [-STEP, 0],
      ArrowRight: [STEP, 0],
      ArrowUp: [0, STEP],
      ArrowDown: [0, -STEP],
    };
    const delta = change[event.key];
    if (!delta) {
      return;
    }
    // Keep the arrows from also reaching the editor (moving elements).
    event.preventDefault();
    event.stopPropagation();
    setHsv((prev) => ({
      h: prev.h,
      s: clamp(prev.s + delta[0]),
      v: clamp(prev.v + delta[1]),
    }));
  };

  const shown = value ?? '';
  return (
    <div className="field color-picker" ref={rootRef}>
      <span>{label}</span>
      <button
        type="button"
        className="color-picker-button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            setHsv(hexToHsv(value ?? draftHex));
          }
          setOpen(!open);
        }}
      >
        <span
          className="color-swatch"
          style={value ? {background: value} : undefined}
          data-none={value ? undefined : true}
        />
        {value ?? noneLabel ?? strings.colorPicker.none}
      </button>
      {open && !disabled && (
        <div className="color-picker-panel">
          <div
            ref={areaRef}
            className="color-picker-area"
            role="slider"
            tabIndex={0}
            aria-label={strings.colorPicker.area}
            aria-valuetext={strings.colorPicker.areaValue(
              Math.round(hsv.s * 100),
              Math.round(hsv.v * 100),
            )}
            style={{background: pickerAreaBackground(hsv.h)}}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              fromPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                fromPointer(event);
              }
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                commit(hsvToHex(fromPointer(event)));
              }
            }}
            onKeyDown={onAreaKey}
            onKeyUp={(event) => {
              if (event.key.startsWith('Arrow')) {
                commitDraft();
              }
            }}
          >
            <span
              className="color-picker-marker"
              style={{
                left: `${hsv.s * 100}%`,
                top: `${(1 - hsv.v) * 100}%`,
                borderColor: pickerMarker.inner,
                outlineColor: pickerMarker.outer,
              }}
            />
          </div>
          <input
            type="range"
            className="color-picker-hue"
            aria-label={strings.colorPicker.hue}
            min={0}
            max={359}
            value={Math.round(hsv.h)}
            style={{background: pickerHueBackground}}
            onChange={(event) =>
              setHsv((prev) => ({...prev, h: Number(event.target.value)}))
            }
            onKeyDown={(event) => {
              // Arrows change the hue, not the editor; Esc still reaches STOP.
              if (event.key.startsWith('Arrow')) {
                event.stopPropagation();
              }
            }}
            onPointerUp={(event) => commitHue(event.currentTarget)}
            onKeyUp={(event) => commitHue(event.currentTarget)}
          />
          <div className="color-picker-row">
            <span
              className="color-swatch color-swatch-large"
              style={{background: draftHex}}
            />
            <label className="color-picker-hex">
              <span>{strings.colorPicker.hex}</span>
              <input
                type="text"
                value={hexDraft ?? (value ? draftHex : '')}
                placeholder={draftHex}
                spellCheck={false}
                onFocus={() => setHexDraft(value ? draftHex : '')}
                onChange={(event) => setHexDraft(event.target.value)}
                onBlur={() => {
                  const typed = normalizeHex(hexDraft ?? '');
                  setHexDraft(null);
                  if (typed) {
                    setHsv(hexToHsv(typed));
                    commit(typed);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    (event.target as HTMLInputElement).blur();
                  }
                }}
              />
            </label>
          </div>
          {(presets.length > 0 || noneLabel) && (
            <div
              className="color-picker-presets"
              role="group"
              aria-label={strings.colorPicker.presets}
            >
              {noneLabel && (
                <button
                  type="button"
                  className="color-picker-preset"
                  aria-pressed={value === undefined}
                  title={noneLabel}
                  onClick={() => commit(undefined)}
                >
                  <span className="color-swatch" data-none />
                  {noneLabel}
                </button>
              )}
              {presets.map((preset) => {
                const hex = normalizeHex(preset.color) ?? preset.color;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    className="color-picker-preset"
                    aria-pressed={shown === hex}
                    title={`${preset.name} ${hex}`}
                    onClick={() => {
                      setHsv(hexToHsv(hex));
                      commit(hex);
                    }}
                  >
                    <span className="color-swatch" style={{background: hex}} />
                    {preset.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
