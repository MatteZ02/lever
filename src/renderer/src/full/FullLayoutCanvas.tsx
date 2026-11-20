// Full layout view (FULL-1 – FULL-7): every station as a panel on one canvas,
// placed and scaled on its own, fully operable. Paired station exits can be
// joined by dashed lines; each panel shows its station's automation level
// and area boundaries. In edit mode panels are dragged to move them, and a
// selected panel can be scaled.
import {useMemo, useRef, useState} from 'react';
import {
  Panel,
  PANEL_MARGIN,
  panelFrame,
  toFullView,
  viewBounds,
} from '../../../model/arrangement';
import {allConnectors, partnerOf} from '../../../model/connectors';
import {DiagramElement} from '../../../model/elements';
import {Arrangement, Project, StationView} from '../../../model/project';
import {strings} from '../../../shared/strings';
import {color} from '../../theme';
import {AreaBoundaries} from '../diagram/AreaBoundaries';
import {DiagramPointer, DiagramView, ViewLayer} from '../diagram/DiagramView';
import {RouteOverlay} from '../diagram/RouteOverlay';
import {PanelRotationContext} from '../diagram/upright';
import {buildDisplays} from '../operate/displays';
import {useOperateActions} from '../operate/useOperateActions';
import {
  DEFAULT_VIEWPORT,
  fullViewportKey,
  setActiveView,
  setViewport,
  useProjectStore,
} from '../store/projectStore';

const PANEL_PREFIX = 'panel:';
// Title size in full-view units (independent of the panel's scale).
const TITLE_SIZE = 1.1;

type Drag = {viewId: string; startX: number; startY: number};

export const FullLayoutCanvas = ({
  project,
  arrangement,
  editing,
  selectedPanel,
  onSelectPanel,
  onMovePanel,
}: {
  project: Project;
  arrangement: Arrangement;
  editing: boolean;
  selectedPanel: string | null;
  onSelectPanel: (viewId: string | null) => void;
  onMovePanel: (viewId: string, dx: number, dy: number) => void;
}) => {
  const key = fullViewportKey(arrangement.id);
  const viewport = useProjectStore(
    (state) => state.viewports[key] ?? DEFAULT_VIEWPORT,
  );
  const {click, popups, layout} = useOperateActions(project);
  // The drag in progress, also in a ref: pointer events can arrive before
  // React has rendered the state of the previous one.
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [offset, setOffsetState] = useState({x: 0, y: 0});
  const offsetRef = useRef({x: 0, y: 0});
  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };
  const setOffset = (next: {x: number; y: number}) => {
    offsetRef.current = next;
    setOffsetState(next);
  };
  const lastClick = useRef<{viewId: string; at: number} | null>(null);

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

  const panels = arrangement.panels.flatMap((panel) => {
    const view = views.get(panel.viewId);
    if (!view) {
      return [];
    }
    const moved =
      drag?.viewId === panel.viewId
        ? {...panel, x: panel.x + offset.x, y: panel.y + offset.y}
        : panel;
    return [{panel: moved, view}];
  });

  const panelOf = (pointer: DiagramPointer) =>
    pointer.elementId?.startsWith(PANEL_PREFIX)
      ? pointer.elementId.slice(PANEL_PREFIX.length)
      : undefined;
  const viewOfElement = (elementId: string) =>
    project.views.find((view) =>
      view.elements.some((element) => element.id === elementId),
    )?.id;

  // Opening a station: double-click its title (or, editing, its frame).
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

  return (
    <>
      <DiagramView
        className="diagram full-layout"
        project={project}
        viewport={viewport}
        onViewportChange={(next) => setViewport(key, next)}
        panOnEmpty
        onPointerDown={(pointer) => {
          const viewId = panelOf(pointer);
          if (editing && viewId) {
            onSelectPanel(viewId);
            setDrag({viewId, startX: pointer.x, startY: pointer.y});
            setOffset({x: 0, y: 0});
          }
        }}
        onPointerMove={(pointer) => {
          const current = dragRef.current;
          if (current) {
            // Whole grid steps, so stations stay on the grid together.
            setOffset({
              x: Math.round(pointer.x - current.startX),
              y: Math.round(pointer.y - current.startY),
            });
          }
        }}
        onPointerUp={(pointer) => {
          const viewId = panelOf(pointer);
          const current = dragRef.current;
          if (current) {
            const moved = offsetRef.current;
            if (moved.x !== 0 || moved.y !== 0) {
              onMovePanel(current.viewId, moved.x, moved.y);
            }
            setDrag(null);
            setOffset({x: 0, y: 0});
            if (!pointer.moved && viewId) {
              openOnSecondClick(viewId);
            }
            return;
          }
          if (pointer.moved) {
            return;
          }
          if (viewId) {
            openOnSecondClick(viewId);
            return;
          }
          if (editing) {
            onSelectPanel(
              pointer.elementId
                ? (viewOfElement(pointer.elementId) ?? null)
                : null,
            );
            return;
          }
          click(
            pointer.elementId ? elements.get(pointer.elementId) : undefined,
            pointer,
          );
        }}
      >
        {arrangement.showConnectorLines && (
          <ConnectorLines project={project} arrangement={arrangement} />
        )}
        {panels.map(({panel, view}) => (
          <StationPanel
            key={view.id}
            project={project}
            view={view}
            panel={panel}
            editing={editing}
            selected={editing && selectedPanel === view.id}
            displays={displays?.get(view.id)}
          />
        ))}
      </DiagramView>
      {popups}
    </>
  );
};

const StationPanel = ({
  project,
  view,
  panel,
  editing,
  selected,
  displays,
}: {
  project: Project;
  view: StationView;
  panel: Panel;
  editing: boolean;
  selected: boolean;
  displays?: ReturnType<typeof buildDisplays>;
}) => {
  const frame = panelFrame(panel, view);
  const bounds = viewBounds(view);
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
        // Editing: the whole frame moves the panel. Operating: clicks go to
        // the elements, empty space pans.
        data-element-id={editing ? `${PANEL_PREFIX}${view.id}` : undefined}
        style={{
          fill: 'transparent',
          stroke: selected ? color.accent : color.panelBorder,
          strokeWidth: selected ? 2 : 1,
          vectorEffect: 'non-scaling-stroke',
          strokeDasharray: editing && !selected ? '6 4' : undefined,
        }}
      />
      <g
        transform={`translate(${panel.x} ${panel.y}) scale(${panel.scale}) rotate(${panel.rotation})`}
        style={{pointerEvents: editing ? 'none' : undefined}}
      >
        <PanelRotationContext.Provider value={panel.rotation}>
          <rect
            x={bounds.minX - PANEL_MARGIN}
            y={bounds.minY - PANEL_MARGIN}
            width={bounds.maxX - bounds.minX + 2 * PANEL_MARGIN}
            height={bounds.maxY - bounds.minY + 2 * PANEL_MARGIN}
            style={{fill: 'none'}}
          />
          <ViewLayer project={project} view={view} displays={displays} />
          <AreaBoundaries project={project} view={view} />
          {!editing && <RouteOverlay project={project} viewId={view.id} />}
        </PanelRotationContext.Provider>
      </g>
      {/* Title with the station's level (FULL-7). Double-click opens it. */}
      <g
        data-element-id={`${PANEL_PREFIX}${view.id}`}
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
    </g>
  );
};

// FULL-4: a dashed line between each pair of station exits shown here.
const ConnectorLines = ({
  project,
  arrangement,
}: {
  project: Project;
  arrangement: Arrangement;
}) => {
  const panelOf = new Map(arrangement.panels.map((p) => [p.viewId, p]));
  const drawn = new Set<string>();
  const lines = allConnectors(project).flatMap(({viewId, connector}) => {
    const partner = partnerOf(project, connector);
    const a = panelOf.get(viewId);
    const b = partner ? panelOf.get(partner.viewId) : undefined;
    if (!partner || !a || !b || drawn.has(connector.id)) {
      return [];
    }
    drawn.add(partner.connector.id);
    const from = toFullView(a, connector.at);
    const to = toFullView(b, partner.connector.at);
    return [
      <line
        key={connector.id}
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        style={{
          stroke: color.connectorLine,
          strokeWidth: 1.5,
          strokeDasharray: '6 5',
          vectorEffect: 'non-scaling-stroke',
          pointerEvents: 'none',
        }}
      />,
    ];
  });
  return <g>{lines}</g>;
};

// Fits the viewport to all panels.
export const fitArrangement = (
  project: Project,
  arrangement: Arrangement,
  size: {width: number; height: number},
) => {
  const frames = arrangement.panels.flatMap((panel) => {
    const view = project.views.find((v) => v.id === panel.viewId);
    return view ? [panelFrame(panel, view)] : [];
  });
  if (frames.length === 0) {
    return DEFAULT_VIEWPORT;
  }
  const minX = Math.min(...frames.map((f) => f.x)) - 1;
  const minY = Math.min(...frames.map((f) => f.y)) - 2.5;
  const maxX = Math.max(...frames.map((f) => f.x + f.width)) + 1;
  const maxY = Math.max(...frames.map((f) => f.y + f.height)) + 1;
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
