// SVG shapes for diagram elements (section 8.0). One grid unit = one SVG user
// unit; the view's viewBox does the zooming. Colours come from theme tokens;
// line patterns from theme/diagram.ts.
//
// Every shape draws an invisible, wider hit area with data-element-id, so
// clicks are easy at any zoom. Live state (positions, aspects, occupancy) is
// optional: the editor draws plain geometry.
import {CSSProperties, memo} from 'react';
import {
  BufferStop,
  DiagramElement,
  GenericAccessory,
  Label,
  Platform,
  Signal,
  StationConnector,
  TextColor,
  Track,
  Turnout,
  VirtualPoint,
} from '../../../model/elements';
import {
  Direction,
  GridPoint,
  rotateDirection,
  vector,
} from '../../../model/geometry';
import {turnoutGeometry, turnoutPorts} from '../../../model/ports';
import {AspectIcon} from '../../../model/signalTypes';
import {LiveStatus} from '../../../shared/liveState';
import {color, diagramDash, diagramStroke, diagramTextColor} from '../../theme';
import {useScreenDirection, useUpright} from './upright';

// --- live state (Phase 3 fills these in) -----------------------------------

export type TurnoutDisplay = {
  // Undefined: position unknown.
  position?: string;
  status: LiveStatus;
  // Commanded by this station, waiting for the central unit: drawn blinking
  // in this position. If it fails, the reported position is drawn again.
  commanded?: string;
};

export type ElementDisplay = {
  turnout?: TurnoutDisplay;
  aspect?: AspectIcon | 'unknown';
  // Track: its block is occupied (LOOK-2: always solid red).
  occupied?: boolean;
  // Track: train number shown on it (BLK-4), once per block.
  trainLabel?: string;
  // Generic accessory switched on.
  accessoryOn?: boolean;
};

// --- helpers ---------------------------------------------------------------

const HIT_WIDTH = 0.7;

// The colour of a label or exit name.
const textFill = (textColor: TextColor | undefined) =>
  textColor ? diagramTextColor(textColor) : color.diagramLabel;
const unit = (direction: Direction) => {
  const v = vector(direction);
  const length = Math.hypot(v.x, v.y);
  return {x: v.x / length, y: v.y / length};
};
const along = (point: GridPoint, direction: Direction, distance: number) => {
  const u = unit(direction);
  return {x: point.x + u.x * distance, y: point.y + u.y * distance};
};
const trackStroke = {
  stroke: color.trackFree,
  strokeWidth: diagramStroke.track,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
};

const Halo = ({d}: {d: string}) => (
  <path
    d={d}
    style={{
      stroke: color.accent,
      strokeWidth: 0.42,
      strokeOpacity: 0.45,
      fill: 'none',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }}
  />
);

const polylinePath = (list: GridPoint[]) =>
  list.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');

// --- track -----------------------------------------------------------------

const TrackShape = ({
  track,
  selected,
  display,
}: {
  track: Track;
  selected: boolean;
  display?: ElementDisplay;
}) => {
  const d = polylinePath(track.points);
  const occupied = display?.occupied ?? false;
  return (
    <g>
      {selected && <Halo d={d} />}
      <path
        d={d}
        style={
          occupied
            ? {
                ...trackStroke,
                stroke: color.trackOccupied,
                strokeWidth: diagramStroke.trackOccupied,
              }
            : trackStroke
        }
      />
      {display?.trainLabel && (
        <TrainLabel points={track.points} text={display.trainLabel} />
      )}
      <path
        d={d}
        data-element-id={track.id}
        style={{stroke: 'transparent', strokeWidth: HIT_WIDTH, fill: 'none'}}
        pointerEvents="stroke"
      />
    </g>
  );
};

// Train number on its block (BLK-4): a small box in the middle of the track.
const TrainLabel = ({points, text}: {points: GridPoint[]; text: string}) => {
  // Middle of the longest straight piece.
  let best = {a: points[0], b: points[1], length: 0};
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
    if (length > best.length) {
      best = {a: points[i - 1], b: points[i], length};
    }
  }
  const x = (best.a.x + best.b.x) / 2;
  const y = (best.a.y + best.b.y) / 2;
  const width = Math.max(1.2, text.length * 0.32 + 0.4);
  const upright = useUpright();
  return (
    <g pointerEvents="none" transform={upright(x, y)}>
      <rect
        x={x - width / 2}
        y={y - 0.33}
        width={width}
        height={0.66}
        rx={0.1}
        style={{
          fill: color.trainNumberBackground,
          stroke: color.trackOccupied,
          strokeWidth: 0.05,
        }}
      />
      <text
        x={x}
        y={y + 0.17}
        textAnchor="middle"
        style={{fill: color.trainNumberText, fontSize: 0.48, fontWeight: 700}}
      >
        {text}
      </text>
    </g>
  );
};

// --- turnouts, crossings, slips ----------------------------------------------

// The gap left in an inactive leg next to the centre (LOOK-5).
const GAP = diagramDash.inactiveLegGap;

const TurnoutShape = ({
  turnout,
  selected,
  display,
}: {
  turnout: Turnout;
  selected: boolean;
  display?: TurnoutDisplay;
}) => {
  const upright = useUpright();
  const geometry = turnoutGeometry(turnout.type, turnout.orientation);
  const ports = turnoutPorts(turnout);
  const centre = turnout.at;
  // Legs that the current position uses (all legs when there is no state).
  const activePorts = new Set<string>();
  if (!display || geometry.positions.length === 0) {
    ports.forEach((port) => activePorts.add(port.name));
  } else if (display.position) {
    geometry.transitions
      .filter((transition) => transition.positions.includes(display.position!))
      .forEach((transition) => {
        activePorts.add(transition.from);
        activePorts.add(transition.to);
      });
  }
  const status = display?.status;
  const unknown = status === 'unknown' || status === 'inconsistent';
  const problem = status === 'failed' || status === 'mismatch';
  const waiting = status === 'commanded' || status === 'retrying';
  const manual = turnout.control.kind === 'manual';
  const legsPath = ports
    .map((port) => `M${centre.x} ${centre.y} L${port.at.x} ${port.at.y}`)
    .join(' ');
  const isSlip = turnout.type === 'singleSlip' || turnout.type === 'doubleSlip';
  const switchable = geometry.positions.length > 0;
  // The set leg (or slip paths) is drawn as plain track and again in the
  // turnout colour on top; patterns let the plain track show through.
  const setStroke = {
    ...trackStroke,
    stroke: color.trackFree,
    strokeWidth: diagramStroke.track,
  };
  const pointsStroke = {
    ...trackStroke,
    stroke: waiting ? color.turnoutUnconfirmed : color.turnoutSet,
    strokeWidth: diagramStroke.track,
    // Dots: commanded, waiting for the report. Fine dashes: only reported at
    // start-up, not seen switching (LOOK-3).
    strokeDasharray: waiting
      ? diagramDash.turnoutUnconfirmed
      : status === 'reported'
        ? diagramDash.turnoutReported
        : undefined,
  };
  const unsetStroke = {
    ...trackStroke,
    stroke: color.trackInactiveLeg,
    strokeWidth: diagramStroke.inactiveLeg,
  };
  // Yellow: the leg the turnout is set to, its whole length (not the tip
  // side, which every position uses), once the position is known. Slips:
  // their set paths (X = straight, curves = diverging).
  const setLegs = ports.filter(
    (port) => port.name !== 'tip' && activePorts.has(port.name),
  );
  // Waiting for a commanded position: the points blink in it.
  const target = waiting ? display?.commanded : undefined;
  const pointsDisplay =
    target && display ? {...display, position: target} : display;
  const pointsLegs = target
    ? ports.filter(
        (port) =>
          port.name !== 'tip' &&
          geometry.transitions.some(
            (transition) =>
              transition.positions.includes(target) &&
              (transition.from === port.name || transition.to === port.name),
          ),
      )
    : setLegs;

  return (
    <g>
      {selected && <Halo d={legsPath} />}
      {isSlip ? (
        // Slips are drawn per path, since every leg is used in both positions:
        // straight = the two lines crossing at the centre, diverging = curves
        // that pass beside the centre. Paths not set are thin underneath.
        <SlipPaths
          turnout={turnout}
          display={display}
          setStroke={setStroke}
          unsetStroke={unsetStroke}
        />
      ) : (
        ports.map((port) => {
          const active = activePorts.has(port.name);
          const start = active ? centre : along(centre, port.direction, GAP);
          return (
            <line
              key={port.name}
              x1={start.x}
              y1={start.y}
              x2={port.at.x}
              y2={port.at.y}
              style={active ? setStroke : unsetStroke}
            />
          );
        })
      )}
      {/* Dotted while commanded, fine dashes when only reported. */}
      {switchable && (
        <>
          <g className={target ? 'turnout-waiting' : undefined}>
            {isSlip ? (
              <SlipPaths
                turnout={turnout}
                display={pointsDisplay}
                setStroke={pointsStroke}
                unsetStroke={unsetStroke}
                onlySet
              />
            ) : (
              pointsLegs.map((port) => (
                <line
                  key={port.name}
                  x1={centre.x}
                  y1={centre.y}
                  x2={port.at.x}
                  y2={port.at.y}
                  style={pointsStroke}
                />
              ))
            )}
          </g>
        </>
      )}
      {/* Switch point: a dot, hollow and coloured for manual turnouts. */}
      {geometry.positions.length > 0 && (
        <circle
          cx={centre.x}
          cy={centre.y}
          r={manual ? 0.2 : isSlip ? 0.13 : 0.17}
          style={{
            fill: manual ? color.diagramBackground : color.turnoutSet,
            stroke: manual ? color.turnoutManual : color.diagramBackground,
            strokeWidth: manual ? 0.08 : 0.05,
          }}
        />
      )}
      {manual && (
        <text
          x={centre.x}
          y={centre.y - 0.35}
          transform={upright(centre.x, centre.y - 0.47)}
          textAnchor="middle"
          style={{fill: color.turnoutManual, fontSize: 0.36, fontWeight: 700}}
        >
          M
        </text>
      )}
      {(unknown || problem) && (
        <text
          x={centre.x}
          y={centre.y + 0.6}
          transform={upright(centre.x, centre.y + 0.4)}
          textAnchor="middle"
          style={{
            fill: problem ? color.trackRouteBroken : color.turnoutUnknown,
            fontSize: 0.55,
            fontWeight: 800,
          }}
        >
          {problem ? '!' : '?'}
        </text>
      )}
      <circle
        cx={centre.x}
        cy={centre.y}
        r={0.75}
        data-element-id={turnout.id}
        style={{fill: 'transparent'}}
      />
    </g>
  );
};

type Stroke = CSSProperties;

// The paths through a slip: set paths in the turnout style, others thin.
const SlipPaths = ({
  turnout,
  display,
  setStroke,
  unsetStroke,
  onlySet = false,
}: {
  turnout: Turnout;
  display?: TurnoutDisplay;
  setStroke: Stroke;
  unsetStroke: Stroke;
  // Only the set paths (for the highlighted points).
  onlySet?: boolean;
}) => {
  const geometry = turnoutGeometry(turnout.type, turnout.orientation);
  const at = new Map(turnoutPorts(turnout).map((port) => [port.name, port.at]));
  const centre = turnout.at;
  const isSet = (positions: string[]) =>
    !display || (!!display.position && positions.includes(display.position));
  const paths = geometry.transitions.map((transition) => {
    const from = at.get(transition.from)!;
    const to = at.get(transition.to)!;
    // A diverging path bends at the centre; as a curve it passes beside it,
    // so the two slip curves never look like the straight crossing.
    const d = transition.diverging
      ? `M${from.x} ${from.y} Q${centre.x} ${centre.y} ${to.x} ${to.y}`
      : `M${from.x} ${from.y} L${to.x} ${to.y}`;
    return {
      key: `${transition.from}-${transition.to}`,
      d,
      set: isSet(transition.positions),
    };
  });
  return (
    <>
      {paths
        .filter((path) => !path.set && !onlySet)
        .map((path) => (
          <path
            key={path.key}
            d={path.d}
            style={{...unsetStroke, fill: 'none'}}
          />
        ))}
      {paths
        .filter((path) => path.set)
        .map((path) => (
          <path
            key={path.key}
            d={path.d}
            style={{...setStroke, fill: 'none'}}
          />
        ))}
    </>
  );
};

// --- signals ---------------------------------------------------------------

const ASPECT_LAMPS: Record<AspectIcon | 'unknown', string[]> = {
  stop: [color.signalStop],
  proceed: [color.signalProceed],
  reduced: [color.signalProceed, color.signalCaution],
  expectStop: [color.signalCaution, color.signalCaution],
  expectProceed: [color.signalProceed, color.signalProceed],
  shuntStop: [color.signalStop],
  shuntAllowed: [color.signalShunting],
  dark: [color.signalDark],
  unknown: [color.signalUnknown],
};

const SignalShape = ({
  signal,
  selected,
  category,
  aspect,
}: {
  signal: Signal;
  selected: boolean;
  category: 'main' | 'distant' | 'shunting';
  aspect?: AspectIcon | 'unknown';
}) => {
  // Beside the track, on the given side of the direction of travel.
  const sideDirection = rotateDirection(
    signal.facing,
    signal.side === 'right' ? -2 : 2,
  );
  const base = along(signal.at, sideDirection, 0.45);
  const head = along(base, signal.facing, 0.35);
  const tail = along(base, signal.facing, -0.25);
  const lamps = aspect ? ASPECT_LAMPS[aspect] : [];
  const radius = category === 'shunting' ? 0.13 : 0.17;
  const headShape =
    category === 'distant' ? (
      <rect
        x={head.x - radius}
        y={head.y - radius}
        width={radius * 2}
        height={radius * 2}
        transform={`rotate(45 ${head.x} ${head.y})`}
        style={{
          fill: lamps[0] ?? 'none',
          stroke: color.signalBody,
          strokeWidth: 0.05,
        }}
      />
    ) : (
      <circle
        cx={head.x}
        cy={head.y}
        r={radius}
        style={{
          fill: lamps[0] ?? 'none',
          stroke: color.signalBody,
          strokeWidth: 0.05,
        }}
      />
    );
  const second = lamps[1]
    ? along(head, sideDirection, radius * 2.1)
    : undefined;
  return (
    <g>
      {selected && <Halo d={`M${tail.x} ${tail.y} L${head.x} ${head.y}`} />}
      {/* Mast from the track side, pointing in the direction of travel. */}
      <line
        x1={tail.x}
        y1={tail.y}
        x2={head.x}
        y2={head.y}
        style={{
          stroke: color.signalBody,
          strokeWidth: 0.07,
          strokeLinecap: 'round',
        }}
      />
      {headShape}
      {second && (
        <circle
          cx={second.x}
          cy={second.y}
          r={radius * 0.8}
          style={{fill: lamps[1], stroke: color.signalBody, strokeWidth: 0.04}}
        />
      )}
      <circle
        cx={base.x}
        cy={base.y}
        r={0.5}
        data-element-id={signal.id}
        style={{fill: 'transparent'}}
      />
    </g>
  );
};

// --- other point elements ----------------------------------------------------

const BufferStopShape = ({
  element,
  selected,
}: {
  element: BufferStop;
  selected: boolean;
}) => {
  const across = rotateDirection(element.direction, 2);
  const a = along(element.at, across, 0.3);
  const b = along(element.at, across, -0.3);
  const d = `M${a.x} ${a.y} L${b.x} ${b.y}`;
  return (
    <g>
      {selected && <Halo d={d} />}
      <path d={d} style={{...trackStroke, strokeWidth: 0.16}} />
      <circle
        cx={element.at.x}
        cy={element.at.y}
        r={0.45}
        data-element-id={element.id}
        style={{fill: 'transparent'}}
      />
    </g>
  );
};

const VirtualPointShape = ({
  element,
  selected,
}: {
  element: VirtualPoint;
  selected: boolean;
}) => {
  const {x, y} = element.at;
  const s = 0.2;
  const d = `M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y} Z`;
  return (
    <g>
      {selected && <Halo d={d} />}
      <path
        d={d}
        style={{
          fill: color.diagramBackground,
          stroke: color.trackFree,
          strokeWidth: 0.05,
        }}
      />
      <circle
        cx={x}
        cy={y}
        r={0.45}
        data-element-id={element.id}
        style={{fill: 'transparent'}}
      />
    </g>
  );
};

const ConnectorShape = ({
  element,
  selected,
}: {
  element: StationConnector;
  selected: boolean;
}) => {
  const tipPoint = along(element.at, element.direction, 0.55);
  const left = along(
    along(element.at, element.direction, 0.1),
    rotateDirection(element.direction, 2),
    0.25,
  );
  const right = along(
    along(element.at, element.direction, 0.1),
    rotateDirection(element.direction, -2),
    0.25,
  );
  const paired = element.pairedWith !== undefined;
  const d = `M${left.x} ${left.y} L${tipPoint.x} ${tipPoint.y} L${right.x} ${right.y} Z`;
  const labelAt = along(element.at, element.direction, 1);
  const upright = useUpright();
  const onScreen = unit(useScreenDirection()(element.direction));
  return (
    <g>
      {selected && <Halo d={d} />}
      {/* Unpaired (line not drawn): open arrow; paired: filled (LOOK-3). */}
      <path
        d={d}
        style={{
          fill: paired ? color.trackFree : 'none',
          stroke: paired ? color.trackFree : color.connectorUnpaired,
          strokeWidth: 0.06,
          strokeLinejoin: 'round',
        }}
      />
      {element.name && (
        <text
          x={labelAt.x}
          y={labelAt.y + 0.18}
          transform={upright(labelAt.x, labelAt.y)}
          textAnchor={
            onScreen.x < -0.1 ? 'end' : onScreen.x > 0.1 ? 'start' : 'middle'
          }
          style={{fill: textFill(element.textColor), fontSize: 0.5}}
        >
          {element.name}
        </text>
      )}
      <circle
        cx={element.at.x}
        cy={element.at.y}
        r={0.5}
        data-element-id={element.id}
        style={{fill: 'transparent'}}
      />
    </g>
  );
};

const AccessoryShape = ({
  element,
  selected,
  on,
}: {
  element: GenericAccessory;
  selected: boolean;
  on: boolean;
}) => {
  const {x, y} = element.at;
  const d = `M${x - 0.3} ${y - 0.3} h0.6 v0.6 h-0.6 Z`;
  const upright = useUpright();
  return (
    <g>
      {selected && <Halo d={d} />}
      <path
        d={d}
        style={{
          fill: on ? color.accent : color.surface,
          stroke: color.diagramLabel,
          strokeWidth: 0.05,
        }}
      />
      <text
        x={x}
        y={y + 0.17}
        transform={upright(x, y)}
        textAnchor="middle"
        style={{fill: color.diagramLabel, fontSize: 0.45, fontWeight: 700}}
      >
        {element.role === 'uncoupler'
          ? 'U'
          : element.role === 'light'
            ? 'L'
            : 'A'}
      </text>
      <circle
        cx={x}
        cy={y}
        r={0.5}
        data-element-id={element.id}
        style={{fill: 'transparent'}}
      />
    </g>
  );
};

const LABEL_SIZES = {small: 0.5, normal: 0.7, large: 1.1};

const LabelShape = ({
  element,
  selected,
}: {
  element: Label;
  selected: boolean;
}) => {
  const size = LABEL_SIZES[element.size];
  const width = Math.max(1, element.text.length * size * 0.55);
  const upright = useUpright();
  return (
    <g transform={upright(element.at.x + width / 2, element.at.y - size * 0.3)}>
      {selected && (
        <rect
          x={element.at.x - 0.1}
          y={element.at.y - size * 0.9}
          width={width + 0.2}
          height={size * 1.2}
          style={{fill: color.accent, fillOpacity: 0.2}}
        />
      )}
      <text
        x={element.at.x}
        y={element.at.y}
        style={{fill: textFill(element.textColor), fontSize: size}}
      >
        {element.text}
      </text>
      <rect
        x={element.at.x}
        y={element.at.y - size * 0.9}
        width={width}
        height={size * 1.2}
        data-element-id={element.id}
        style={{fill: 'transparent'}}
      />
    </g>
  );
};

const PlatformShape = ({
  element,
  selected,
}: {
  element: Platform;
  selected: boolean;
}) => (
  <rect
    x={element.at.x}
    y={element.at.y}
    width={element.width}
    height={element.height}
    data-element-id={element.id}
    style={{
      fill: color.surfaceRaised,
      stroke: selected ? color.accent : color.border,
      strokeWidth: selected ? 0.12 : 0.04,
    }}
  />
);

// --- dispatcher ------------------------------------------------------------

export type ElementShapeProps = {
  element: DiagramElement;
  selected: boolean;
  signalCategory?: 'main' | 'distant' | 'shunting';
  display?: ElementDisplay;
};

export const ElementShape = memo(function ElementShape({
  element,
  selected,
  signalCategory,
  display,
}: ElementShapeProps) {
  switch (element.kind) {
    case 'track':
      return (
        <TrackShape track={element} selected={selected} display={display} />
      );
    case 'turnout':
      return (
        <TurnoutShape
          turnout={element}
          selected={selected}
          display={display?.turnout}
        />
      );
    case 'signal':
      return (
        <SignalShape
          signal={element}
          selected={selected}
          category={signalCategory ?? 'main'}
          aspect={display?.aspect}
        />
      );
    case 'bufferStop':
      return <BufferStopShape element={element} selected={selected} />;
    case 'virtualPoint':
      return <VirtualPointShape element={element} selected={selected} />;
    case 'connector':
      return <ConnectorShape element={element} selected={selected} />;
    case 'accessory':
      return (
        <AccessoryShape
          element={element}
          selected={selected}
          on={display?.accessoryOn ?? false}
        />
      );
    case 'label':
      return <LabelShape element={element} selected={selected} />;
    case 'platform':
      return <PlatformShape element={element} selected={selected} />;
  }
});

// Drawing order: decoration first, then track, then everything on top.
export const LAYER: Record<DiagramElement['kind'], number> = {
  platform: 0,
  label: 1,
  track: 2,
  turnout: 3,
  bufferStop: 4,
  virtualPoint: 4,
  connector: 4,
  accessory: 5,
  signal: 6,
};
