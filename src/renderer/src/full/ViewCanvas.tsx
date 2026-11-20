// A layout view (FULL-1 – FULL-7): station frames the
// user has drawn, each showing its station fitted inside and fully operable,
// and lines drawn between them. In edit mode the view tools draw frames and
// lines; frames are moved by dragging and resized at their corner.
import {useEffect, useMemo, useRef, useState} from 'react';
import {
  addFrame,
  addLine,
  arrangementBounds,
  exitsOnView,
  FrameTransform,
  frameTransform,
  isFrameSize,
  linePointAt,
  linePoints,
  moveFrame,
  Point,
  rectBetween,
  resizeFrame,
  resolveLinePoint,
  sameLinePoint,
} from '../../../model/arrangement';
import {DiagramElement} from '../../../model/elements';
import {
  Arrangement,
  LinePoint,
  Project,
  StationFrame,
  StationView,
} from '../../../model/project';
import {strings} from '../../../shared/strings';
import {color} from '../../theme';
import {AreaBoundaries} from '../diagram/AreaBoundaries';
import {DiagramPointer, DiagramView, ViewLayer} from '../diagram/DiagramView';
import {RouteOverlay} from '../diagram/RouteOverlay';
import {PanelRotationContext} from '../diagram/upright';
import {buildDisplays} from '../operate/displays';
import {useOperateActions} from '../operate/useOperateActions';
import {isTypingTarget} from '../safety/shortcuts';
import {
  DEFAULT_VIEWPORT,
  fullViewportKey,
  setActiveView,
  setViewport,
  useProjectStore,
  Viewport,
} from '../store/projectStore';
import {
  changeArrangement,
  deleteSelection,
  ViewSelection,
  ViewTool,
} from './viewEdits';

// data-element-id prefixes of the view's own shapes.
const FRAME = 'frame:';
const TITLE = 'title:';
const RESIZE = 'resize:';
const LINE = 'line:';
// Title size in view units (independent of the frame's scale).
const TITLE_SIZE = 1.1;
const HANDLE = 0.8;

const SELECT: ViewTool = {kind: 'select'};
const toolKey = (tool: ViewTool) =>
  tool.kind === 'frame' ? `frame:${tool.viewId}` : tool.kind;

type Drag =
  | {kind: 'move'; frameId: string; start: Point}
  | {kind: 'resize'; frameId: string}
  | {kind: 'draw'; start: Point};

const idAfter = (elementId: string | undefined, prefix: string) =>
  elementId?.startsWith(prefix) ? elementId.slice(prefix.length) : undefined;

export const ViewCanvas = ({
  project,
  arrangement,
  editing,
  tool = SELECT,
  onToolChange,
  selection = null,
  onSelect,
}: {
  project: Project;
  arrangement: Arrangement;
  editing: boolean;
  tool?: ViewTool;
  onToolChange?: (tool: ViewTool) => void;
  selection?: ViewSelection;
  onSelect?: (selection: ViewSelection) => void;
}) => {
  const key = fullViewportKey(arrangement.id);
  const viewport = useProjectStore(
    (state) => state.viewports[key] ?? DEFAULT_VIEWPORT,
  );
  const {click, popups, layout} = useOperateActions(project);
  // The drag in progress and where the pointer is, also in refs: pointer
  // events can arrive before React has rendered the previous one.
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [pointer, setPointerState] = useState<Point | null>(null);
  const pointerRef = useRef<Point | null>(null);
  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };
  const setPointer = (next: Point | null) => {
    pointerRef.current = next;
    setPointerState(next);
  };
  // The line being drawn.
  const [drawing, setDrawing] = useState<LinePoint[]>([]);
  const lastClick = useRef<{viewId: string; at: number} | null>(null);
  const change = (update: (a: Arrangement) => Arrangement) =>
    changeArrangement(arrangement.id, update);

  // A line in progress belongs to the line tool and this view.
  const drawingKey = `${toolKey(tool)}@${arrangement.id}`;
  const [drawingFor, setDrawingFor] = useState(drawingKey);
  if (drawingFor !== drawingKey) {
    setDrawingFor(drawingKey);
    setDrawing([]);
  }

  const views = useMemo(
    () => new Map(project.views.map((view) => [view.id, view])),
    [project.views],
  );
  const elements = useMemo(() => {
    const byId = new Map<string, DiagramElement>();
    project.views.forEach((view) =>
      view.elements.forEach((element) => byId.set(element.id, element)),
    );
    return byId;
  }, [project.views]);
  // Live state only while operating; the editor shows the plain drawing.
  const displays = useMemo(
    () =>
      editing
        ? undefined
        : new Map(
            project.views.map((view) => [
              view.id,
              buildDisplays(project, view, layout),
            ]),
          ),
    [editing, project, layout],
  );
  const exits = useMemo(
    () => (editing ? exitsOnView(project, arrangement) : []),
    [editing, project, arrangement],
  );

  // The view as it looks during a drag (moved or resized frame).
  const shown = (() => {
    if (!drag || !pointer) {
      return arrangement;
    }
    if (drag.kind === 'move') {
      return moveFrame(
        arrangement,
        drag.frameId,
        Math.round(pointer.x - drag.start.x),
        Math.round(pointer.y - drag.start.y),
      );
    }
    if (drag.kind === 'resize') {
      return resizeFrame(arrangement, drag.frameId, pointer);
    }
    return arrangement;
  })();

  const finishLine = (points: LinePoint[]) => {
    if (points.length >= 2) {
      let created = '';
      change((a) => {
        const next = addLine(a, points);
        created = next.lines[next.lines.length - 1].id;
        return next;
      });
      if (created) {
        onSelect?.({kind: 'line', id: created});
      }
    }
    setDrawing([]);
  };

  // Keys for the view tools (Esc stays STOP: it is never handled here).
  useEffect(() => {
    if (!editing) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (
        isTypingTarget(event.target) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      if (tool.kind === 'line' && drawing.length > 0) {
        if (event.key === 'Enter') {
          event.preventDefault();
          finishLine(drawing);
        } else if (event.key === 'Backspace' || event.key === 'Delete') {
          event.preventDefault();
          setDrawing(drawing.slice(0, -1));
        }
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
        event.preventDefault();
        deleteSelection(arrangement.id, selection);
        onSelect?.(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Opening a station: double-click its title.
  const openOnSecondClick = (viewId: string) => {
    const now = Date.now();
    if (
      lastClick.current?.viewId === viewId &&
      now - lastClick.current.at < 500
    ) {
      lastClick.current = null;
      setActiveView(viewId);
      return;
    }
    lastClick.current = {viewId, at: now};
  };
  const frameById = (id: string | undefined) =>
    arrangement.frames.find((frame) => frame.id === id);

  const onDown = (p: DiagramPointer) => {
    setPointer({x: p.x, y: p.y});
    if (!editing) {
      return;
    }
    if (tool.kind === 'frame') {
      setDrag({kind: 'draw', start: {x: p.x, y: p.y}});
      return;
    }
    if (tool.kind !== 'select') {
      return;
    }
    const resizing = idAfter(p.elementId, RESIZE);
    const moving = idAfter(p.elementId, FRAME) ?? idAfter(p.elementId, TITLE);
    const line = idAfter(p.elementId, LINE);
    if (resizing) {
      setDrag({kind: 'resize', frameId: resizing});
    } else if (moving) {
      onSelect?.({kind: 'frame', id: moving});
      setDrag({kind: 'move', frameId: moving, start: {x: p.x, y: p.y}});
    } else if (line) {
      onSelect?.({kind: 'line', id: line});
    }
  };

  const onUp = (p: DiagramPointer) => {
    const current = dragRef.current;
    const at = {x: p.x, y: p.y};
    setDrag(null);
    setPointer(at);
    if (current?.kind === 'draw' && tool.kind === 'frame') {
      const rect = rectBetween(current.start, at);
      if (isFrameSize(rect)) {
        let created = '';
        change((a) => {
          const next = addFrame(a, tool.viewId, rect);
          created = next.frames[next.frames.length - 1].id;
          return next;
        });
        if (created) {
          onSelect?.({kind: 'frame', id: created});
          onToolChange?.({kind: 'select'});
        }
      }
      return;
    }
    if (current?.kind === 'move' && p.moved) {
      const dx = Math.round(at.x - current.start.x);
      const dy = Math.round(at.y - current.start.y);
      if (dx !== 0 || dy !== 0) {
        change((a) => moveFrame(a, current.frameId, dx, dy));
      }
      return;
    }
    if (current?.kind === 'resize') {
      change((a) => resizeFrame(a, current.frameId, at));
      return;
    }
    if (p.moved) {
      return;
    }
    if (editing && tool.kind === 'line') {
      const point = linePointAt(exits, at);
      const last = drawing[drawing.length - 1];
      if (last && sameLinePoint(last, point)) {
        finishLine(drawing);
      } else if ('frameId' in point && drawing.length >= 1) {
        finishLine([...drawing, point]);
      } else {
        setDrawing([...drawing, point]);
      }
      return;
    }
    const titleFrame = frameById(idAfter(p.elementId, TITLE));
    if (titleFrame) {
      openOnSecondClick(titleFrame.viewId);
      return;
    }
    if (editing) {
      if (!current) {
        onSelect?.(null);
      }
      return;
    }
    click(p.elementId ? elements.get(p.elementId) : undefined, p);
  };

  const drawnRect =
    drag?.kind === 'draw' && pointer ? rectBetween(drag.start, pointer) : null;
  const preview = drawing.flatMap((point) => {
    const at = resolveLinePoint(project, arrangement, point);
    return at ? [at] : [];
  });
  const isEmpty = arrangement.frames.length === 0;

  return (
    <>
      <DiagramView
        className="diagram full-layout"
        project={project}
        viewport={viewport}
        onViewportChange={(next) => setViewport(key, next)}
        panOnEmpty={!editing || tool.kind === 'select'}
        cursor={editing && tool.kind !== 'select' ? 'crosshair' : undefined}
        onPointerDown={onDown}
        onPointerMove={(p) => {
          if (dragRef.current || (editing && tool.kind === 'line')) {
            setPointer({x: p.x, y: p.y});
          }
        }}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
      >
        {shown.lines.map((line) => (
          <DrawnLine
            key={line.id}
            id={line.id}
            points={linePoints(project, shown, line)}
            editing={editing && tool.kind === 'select'}
            selected={
              editing && selection?.kind === 'line' && selection.id === line.id
            }
          />
        ))}
        {shown.frames.map((frame) => {
          const view = views.get(frame.viewId);
          return view ? (
            <Frame
              key={frame.id}
              project={project}
              view={view}
              frame={frame}
              editing={editing}
              selected={
                editing &&
                selection?.kind === 'frame' &&
                selection.id === frame.id
              }
              displays={displays?.get(view.id)}
            />
          ) : null;
        })}
        {editing && tool.kind === 'line' && (
          <ExitMarkers exits={exits.map((exit) => exit.at)} />
        )}
        {preview.length > 0 && (
          <polyline
            points={[...preview, ...(pointer ? [pointer] : [])]
              .map((p) => `${p.x},${p.y}`)
              .join(' ')}
            style={{
              fill: 'none',
              stroke: color.accent,
              strokeWidth: 2,
              strokeDasharray: '6 4',
              vectorEffect: 'non-scaling-stroke',
              pointerEvents: 'none',
            }}
          />
        )}
        {drawnRect && (
          <rect
            {...drawnRect}
            style={{
              fill: 'none',
              stroke: isFrameSize(drawnRect) ? color.accent : color.textMuted,
              strokeWidth: 2,
              strokeDasharray: '6 4',
              vectorEffect: 'non-scaling-stroke',
              pointerEvents: 'none',
            }}
          />
        )}
      </DiagramView>
      {isEmpty && (
        <p className="view-empty muted">
          {editing ? strings.full.empty : strings.full.emptyOperate}
        </p>
      )}
      {popups}
    </>
  );
};

const Frame = ({
  project,
  view,
  frame,
  editing,
  selected,
  displays,
}: {
  project: Project;
  view: StationView;
  frame: StationFrame;
  editing: boolean;
  selected: boolean;
  displays?: ReturnType<typeof buildDisplays>;
}) => {
  const transform: FrameTransform = frameTransform(frame, view);
  const level =
    project.areas.find((area) => area.id === view.areaId)?.level ??
    project.settings.defaultLevel;
  const badge = strings.operate.levelBadge(level);
  const badgeWidth = badge.length * TITLE_SIZE * 0.62 + 0.6;
  const titleY = frame.y - 0.5;
  return (
    <g>
      <rect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        rx={0.4}
        // Editing: the whole frame moves it. Operating: clicks go to the
        // station's elements, empty space pans.
        data-element-id={editing ? `${FRAME}${frame.id}` : undefined}
        style={{
          fill: 'transparent',
          stroke: selected ? color.accent : color.panelBorder,
          strokeWidth: selected ? 2 : 1,
          vectorEffect: 'non-scaling-stroke',
          strokeDasharray: editing && !selected ? '6 4' : undefined,
        }}
      />
      <g
        transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale}) rotate(${transform.rotation})`}
        style={{pointerEvents: editing ? 'none' : undefined}}
      >
        <PanelRotationContext.Provider value={transform.rotation}>
          <ViewLayer project={project} view={view} displays={displays} />
          <AreaBoundaries project={project} view={view} />
          {!editing && <RouteOverlay project={project} viewId={view.id} />}
        </PanelRotationContext.Provider>
      </g>
      {/* Title with the station's level (FULL-7). Double-click opens it. */}
      <g
        data-element-id={`${TITLE}${frame.id}`}
        style={{cursor: editing ? 'move' : 'pointer'}}
      >
        <rect
          x={frame.x}
          y={titleY - TITLE_SIZE}
          width={badgeWidth}
          height={TITLE_SIZE * 1.3}
          rx={0.25}
          style={{
            fill: 'none',
            stroke: color[`areaLevel${level}`],
            strokeWidth: 1.5,
            vectorEffect: 'non-scaling-stroke',
          }}
        />
        <text
          x={frame.x + badgeWidth / 2}
          y={titleY}
          textAnchor="middle"
          style={{
            fill: color[`areaLevel${level}`],
            fontSize: TITLE_SIZE * 0.9,
            fontWeight: 700,
          }}
        >
          {badge}
        </text>
        <text
          x={frame.x + badgeWidth + 0.5}
          y={titleY}
          style={{
            fill: color.panelTitle,
            fontSize: TITLE_SIZE,
            fontWeight: 700,
          }}
        >
          {view.name}
        </text>
      </g>
      {selected && (
        <rect
          x={frame.x + frame.width - HANDLE / 2}
          y={frame.y + frame.height - HANDLE / 2}
          width={HANDLE}
          height={HANDLE}
          data-element-id={`${RESIZE}${frame.id}`}
          style={{
            fill: color.accent,
            stroke: color.background,
            strokeWidth: 1,
            vectorEffect: 'non-scaling-stroke',
            cursor: 'nwse-resize',
          }}
        />
      )}
    </g>
  );
};

// A line drawn on the view: dashed, so it is not taken for live track.
const DrawnLine = ({
  id,
  points,
  editing,
  selected,
}: {
  id: string;
  points: Point[];
  editing: boolean;
  selected: boolean;
}) => {
  if (points.length < 2) {
    return null;
  }
  const path = points.map((p) => `${p.x},${p.y}`).join(' ');
  return (
    <g>
      {editing && (
        <polyline
          points={path}
          data-element-id={`${LINE}${id}`}
          style={{
            fill: 'none',
            stroke: 'transparent',
            strokeWidth: 0.8,
            cursor: 'pointer',
          }}
        />
      )}
      <polyline
        points={path}
        style={{
          fill: 'none',
          stroke: selected ? color.accent : color.connectorLine,
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray: '6 5',
          strokeLinejoin: 'round',
          vectorEffect: 'non-scaling-stroke',
          pointerEvents: 'none',
        }}
      />
    </g>
  );
};

// Where a line can attach, while the line tool is on.
const ExitMarkers = ({exits}: {exits: Point[]}) => (
  <g style={{pointerEvents: 'none'}}>
    {exits.map((at, index) => (
      <circle
        key={index}
        className="exit-marker"
        cx={at.x}
        cy={at.y}
        r={0.45}
        style={{
          fill: 'none',
          stroke: color.accent,
          strokeWidth: 1.5,
          vectorEffect: 'non-scaling-stroke',
        }}
      />
    ))}
  </g>
);

// Fits the viewport to everything on the view.
export const fitArrangement = (
  project: Project,
  arrangement: Arrangement,
  size: {width: number; height: number},
): Viewport => {
  const bounds = arrangementBounds(project, arrangement);
  if (!bounds) {
    return DEFAULT_VIEWPORT;
  }
  const minX = bounds.minX - 1;
  const minY = bounds.minY - 2.5;
  const maxX = bounds.maxX + 1;
  const maxY = bounds.maxY + 1;
  const scale = Math.max(
    2,
    Math.min(160, size.width / (maxX - minX), size.height / (maxY - minY)),
  );
  return {
    scale,
    x: (minX + maxX) / 2 - size.width / scale / 2,
    y: (minY + maxY) / 2 - size.height / scale / 2,
  };
};
