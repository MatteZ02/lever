// What a click does in operating mode (Level 1, section 8.5–8.7), shared by
// a station view and the full layout view: throw a turnout (or record a
// manual turnout's position), choose a signal's aspect, switch an accessory,
// set the train number of an occupied block, or follow a paired station exit.
//
// Routes (Level 2): clicking a signal, station exit or route point in a
// Level 2 area opens a menu with "Route from here". While a route is being
// made, clicking another of them offers "Route ends here" and "Via here";
// other clicks switch nothing then. At Level 2 signals are set by routes
// only, so a signal there has no aspect menu (user, 2026-11-19).
import {useState} from 'react';
import {levelOf} from '../../../model/areas';
import {
  DiagramElement,
  Signal,
  StationConnector,
} from '../../../model/elements';
import {nextTurnoutPosition} from '../../../model/ports';
import {Project} from '../../../model/project';
import {isRoutePoint} from '../../../model/routing';
import {findSignalType} from '../../../model/signalTypes';
import {viewOfElement} from '../../../model/validation';
import {strings} from '../../../shared/strings';
import {describeElement} from '../describe';
import {DiagramPointer} from '../diagram/DiagramView';
import {sendCommand, useEngineStore} from '../store/engineStore';
import {
  addVia,
  pickPoint,
  setRouteEnd,
  startPicking,
  useRouteStore,
} from '../store/routeStore';

type RouteChoice = 'from' | 'to' | 'via' | 'follow';

// Elements a route can be started, ended or led through by clicking.
const CLICK_ROUTE_KINDS = new Set(['signal', 'connector', 'virtualPoint']);

type Popup =
  | {kind: 'aspects'; signal: Signal; x: number; y: number}
  | {
      kind: 'route';
      element: DiagramElement;
      choices: RouteChoice[];
      x: number;
      y: number;
    }
  | {kind: 'label'; blockId: string; x: number; y: number};

export const useOperateActions = (
  project: Project,
  onConnector?: (connector: StationConnector) => void,
) => {
  const layout = useEngineStore((state) => state.layout);
  const [popup, setPopup] = useState<Popup | null>(null);

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
        if (routesFrom(project, element)) {
          setPopup({kind: 'route', element, choices: ['from'], x, y});
        } else {
          setPopup({kind: 'aspects', signal: element, x, y});
        }
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
      case 'connector': {
        const choices: RouteChoice[] = routesFrom(project, element)
          ? ['from']
          : [];
        if (element.pairedWith && onConnector) {
          choices.push('follow');
        }
        if (choices.length === 1 && choices[0] === 'follow') {
          onConnector?.(element);
        } else if (choices.length > 0) {
          setPopup({kind: 'route', element, choices, x, y});
        }
        return;
      }
      case 'virtualPoint':
        if (routesFrom(project, element)) {
          setPopup({kind: 'route', element, choices: ['from'], x, y});
        }
        return;
      default:
        return;
    }
  };

  // Call on every pointer release that was not a drag.
  const click = (
    element: DiagramElement | undefined,
    pointer: DiagramPointer,
  ) => {
    setPopup(null);
    const pick = useRouteStore.getState().pick;
    if (pick) {
      // Choosing a route: only route points react.
      if (!element || !isRoutePoint(element)) {
        return;
      }
      if (!pick.from || !CLICK_ROUTE_KINDS.has(element.kind)) {
        pickPoint(project, element.id);
        return;
      }
      if (element.id === pick.from) {
        return;
      }
      const rect = (
        pointer.event.currentTarget as Element
      ).getBoundingClientRect();
      setPopup({
        kind: 'route',
        element,
        choices: ['to', 'via'],
        x: pointer.event.clientX - rect.left,
        y: pointer.event.clientY - rect.top,
      });
      return;
    }
    if (element) {
      act(element, pointer);
    }
  };

  const chooseRoute = (element: DiagramElement, choice: RouteChoice) => {
    setPopup(null);
    switch (choice) {
      case 'from':
        startPicking(element.id);
        return;
      case 'to':
        setRouteEnd(project, element.id);
        return;
      case 'via':
        addVia(element.id);
        return;
      case 'follow':
        if (element.kind === 'connector') {
          onConnector?.(element);
        }
        return;
    }
  };

  const popups = (
    <>
      {popup?.kind === 'route' && (
        <RouteMenu
          element={popup.element}
          choices={popup.choices}
          x={popup.x}
          y={popup.y}
          onChoose={(choice) => chooseRoute(popup.element, choice)}
          onClose={() => setPopup(null)}
        />
      )}
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

  return {click, popups, layout};
};

// SIG-3: choose one of the signal's aspects. Large buttons; closes with
// Cancel or after choosing (Esc stays STOP).
// Routes start in Level 2 areas (Level 1 is manual operation only).
const routesFrom = (project: Project, element: DiagramElement) => {
  const view = viewOfElement(project, element.id);
  return view !== undefined && levelOf(project, view, element) === 2;
};

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

const ROUTE_CHOICE_LABELS: Record<RouteChoice, string> = {
  from: strings.routes.fromHere,
  to: strings.routes.endHere,
  via: strings.routes.viaHere,
  follow: strings.routes.followExit,
};

// The route menu of a signal, exit or route point (Level 2).
const RouteMenu = ({
  element,
  choices,
  x,
  y,
  onChoose,
  onClose,
}: {
  element: DiagramElement;
  choices: RouteChoice[];
  x: number;
  y: number;
  onChoose: (choice: RouteChoice) => void;
  onClose: () => void;
}) => (
  <div
    className="popup"
    style={{left: x, top: y}}
    role="menu"
    aria-label={describeElement(element)}
  >
    <strong>{describeElement(element)}</strong>
    {choices.map((choice) => (
      <button
        key={choice}
        type="button"
        role="menuitem"
        className="button"
        onClick={() => onChoose(choice)}
      >
        {ROUTE_CHOICE_LABELS[choice]}
      </button>
    ))}
    <button type="button" className="button button--small" onClick={onClose}>
      {strings.modes.cancel}
    </button>
  </div>
);
