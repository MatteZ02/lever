// Operating mode (Level 1, section 8.5–8.7): the live diagram. Click a
// turnout to throw it (or record a manual turnout's position), a signal to
// choose its aspect, an accessory to switch it, and a track with feedback to
// set the train number. Dragging empty space pans.
import {useMemo, useState} from 'react';
import {DiagramElement, Signal} from '../../../model/elements';
import {nextTurnoutPosition} from '../../../model/ports';
import {Project, StationView} from '../../../model/project';
import {findSignalType} from '../../../model/signalTypes';
import {strings} from '../../../shared/strings';
import {AreaBoundaries} from '../diagram/AreaBoundaries';
import {DiagramPointer, DiagramView} from '../diagram/DiagramView';
import {sendCommand, useEngineStore} from '../store/engineStore';
import {
  DEFAULT_VIEWPORT,
  setViewport,
  useProjectStore,
} from '../store/projectStore';
import {buildDisplays} from './displays';

type Popup =
  | {kind: 'aspects'; signal: Signal; x: number; y: number}
  | {kind: 'label'; blockId: string; x: number; y: number};

export const OperateCanvas = ({
  project,
  view,
}: {
  project: Project;
  view: StationView;
}) => {
  const viewport = useProjectStore(
    (state) => state.viewports[view.id] ?? DEFAULT_VIEWPORT,
  );
  const layout = useEngineStore((state) => state.layout);
  const [popup, setPopup] = useState<Popup | null>(null);
  const displays = useMemo(
    () => buildDisplays(project, view, layout),
    [project, view, layout],
  );

  const act = (element: DiagramElement, pointer: DiagramPointer) => {
    const rect = (
      pointer.event.currentTarget as Element
    ).getBoundingClientRect();
    const x = pointer.event.clientX - rect.left;
    const y = pointer.event.clientY - rect.top;
    switch (element.kind) {
      case 'turnout': {
        const live = layout.turnouts[element.id];
        const position = nextTurnoutPosition(
          element,
          live?.commanded ?? live?.position,
        );
        if (position) {
          sendCommand({type: 'setTurnout', elementId: element.id, position});
        }
        return;
      }
      case 'signal':
        setPopup({kind: 'aspects', signal: element, x, y});
        return;
      case 'accessory': {
        const on =
          element.buttonType === 'momentary'
            ? true
            : !(layout.accessories[element.id]?.on ?? false);
        sendCommand({type: 'pressAccessory', elementId: element.id, on});
        return;
      }
      case 'track':
        if (element.blockId && layout.blocks[element.blockId]?.hasFeedback) {
          setPopup({kind: 'label', blockId: element.blockId, x, y});
        }
        return;
      default:
        return;
    }
  };

  return (
    <>
      <DiagramView
        className="diagram"
        project={project}
        view={view}
        viewport={viewport}
        onViewportChange={(next) => setViewport(view.id, next)}
        displays={displays}
        panOnEmpty
        onPointerUp={(pointer) => {
          if (pointer.moved) {
            return;
          }
          const element = view.elements.find(
            (candidate) => candidate.id === pointer.elementId,
          );
          setPopup(null);
          if (element) {
            act(element, pointer);
          }
        }}
      >
        <AreaBoundaries project={project} view={view} />
      </DiagramView>
      {popup?.kind === 'aspects' && (
        <AspectMenu
          project={project}
          signal={popup.signal}
          x={popup.x}
          y={popup.y}
          onClose={() => setPopup(null)}
        />
      )}
      {popup?.kind === 'label' && (
        <TrainLabelEditor
          blockId={popup.blockId}
          current={layout.blocks[popup.blockId]?.label ?? ''}
          x={popup.x}
          y={popup.y}
          onClose={() => setPopup(null)}
        />
      )}
    </>
  );
};

// SIG-3: choose one of the signal's aspects. Large buttons; closes with
// Cancel or after choosing (Esc stays STOP).
const AspectMenu = ({
  project,
  signal,
  x,
  y,
  onClose,
}: {
  project: Project;
  signal: Signal;
  x: number;
  y: number;
  onClose: () => void;
}) => {
  const type = findSignalType(project.signalTypes, signal.signalTypeId);
  return (
    <div
      className="popup"
      style={{left: x, top: y}}
      role="menu"
      aria-label={signal.name || strings.kinds.signal}
    >
      <strong>{signal.name || strings.kinds.signal}</strong>
      {type?.aspects.map((aspect) => (
        <button
          key={aspect.id}
          type="button"
          role="menuitem"
          className="button"
          onClick={() => {
            sendCommand({
              type: 'setSignal',
              elementId: signal.id,
              aspectId: aspect.id,
            });
            onClose();
          }}
        >
          {aspect.name}
        </button>
      ))}
      <button type="button" className="button button--small" onClick={onClose}>
        {strings.modes.cancel}
      </button>
    </div>
  );
};

// BLK-4: set, change or clear a block's train number.
const TrainLabelEditor = ({
  blockId,
  current,
  x,
  y,
  onClose,
}: {
  blockId: string;
  current: string;
  x: number;
  y: number;
  onClose: () => void;
}) => {
  const [text, setText] = useState(current);
  const apply = (label: string | null) => {
    sendCommand({type: 'setTrainLabel', blockId, label});
    onClose();
  };
  return (
    <form
      className="popup"
      style={{left: x, top: y}}
      onSubmit={(event) => {
        event.preventDefault();
        apply(text);
      }}
    >
      <label className="field">
        <span>{strings.operate.trainNumber}</span>
        <input
          type="text"
          value={text}
          maxLength={40}
          autoFocus
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <div className="button-row">
        <button type="submit" className="button">
          {strings.operate.setLabel}
        </button>
        {current && (
          <button type="button" className="button" onClick={() => apply(null)}>
            {strings.operate.clearLabel}
          </button>
        )}
        <button type="button" className="button" onClick={onClose}>
          {strings.modes.cancel}
        </button>
      </div>
    </form>
  );
};
