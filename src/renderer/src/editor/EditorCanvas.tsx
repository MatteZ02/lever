// The editor's drawing surface (EDT-2, EDT-3): selecting, moving, drawing
// track, placing elements, dragging track corners, and test-mode clicks.
import {useMemo, useRef, useState} from 'react';
import {
  elementPoints,
  moveElements,
  placeReplacing,
  replaceElement,
} from '../../../model/editing';
import {DiagramElement, Track, TurnoutType} from '../../../model/elements';
import {
  GridPoint,
  isValidPolyline,
  pointKey,
  simplifyPolyline,
} from '../../../model/geometry';
import {
  elementsReplacedBy,
  holdsUserData,
  placeElement,
  sameAsExisting,
} from '../../../model/placement';
import {newId, Project, StationView} from '../../../model/project';
import {
  addTrackJoined,
  attachPoints,
  dragCorner,
  nextDrawingPoints,
} from '../../../model/trackDrawing';
import {strings} from '../../../shared/strings';
import {color, diagramStroke} from '../../theme';
import {Modal} from '../components/Modal';
import {AreaBoundaries} from '../diagram/AreaBoundaries';
import {
  DiagramPointer,
  DiagramView,
  DiagramViewHandle,
} from '../diagram/DiagramView';
import {ElementShape} from '../diagram/shapes';
import {
  DEFAULT_VIEWPORT,
  edit,
  select,
  setHint,
  setViewport,
  Tool,
  useProjectStore,
} from '../store/projectStore';
import {testNext} from './testActions';

type Drag =
  | {kind: 'move'; start: GridPoint; current: GridPoint}
  | {
      kind: 'rubber';
      start: {x: number; y: number};
      current: {x: number; y: number};
      additive: boolean;
    }
  | {kind: 'vertex'; trackId: string; index: number; current: GridPoint};

type Props = {
  project: Project;
  view: StationView;
  // Shared with the keyboard handler (rotate while placing, finish track).
  placeRotation: number;
  drawing: GridPoint[];
  onDrawingChange: (points: GridPoint[]) => void;
};

// Adds the drawn track; drawn from or to the free end of another track, it
// becomes part of that track (addTrackJoined).
export const finishTrack = (viewId: string, points: GridPoint[]): void => {
  const simplified = simplifyPolyline(points);
  if (simplified.length >= 2 && isValidPolyline(simplified)) {
    const track: Track = {
      kind: 'track',
      id: newId('track'),
      name: '',
      points: simplified,
    };
    edit((project) => ({
      ...project,
      views: project.views.map((view) =>
        view.id === viewId ? addTrackJoined(view, track) : view,
      ),
    }));
  }
};

// "Turnout 13", "Station exit Nebenbahn", or just the kind.
const describeElement = (element: DiagramElement): string => {
  const kind = strings.kinds[element.kind] ?? element.kind;
  const control = 'control' in element ? element.control : undefined;
  const detail =
    element.name.trim() ||
    (control?.kind === 'dcc'
      ? control.addresses.join('/')
      : control?.kind === 'extended'
        ? String(control.address)
        : '');
  return detail ? `${kind} ${detail}` : kind.toLowerCase();
};

type PendingReplace = {element: DiagramElement; replaced: DiagramElement[]};

const hintFor = (reason: 'notOnTrack' | 'notAtTrackEnd') =>
  reason === 'notOnTrack'
    ? strings.editor.hints.notOnTrack
    : strings.editor.hints.notAtTrackEnd;

export const EditorCanvas = ({
  project,
  view,
  placeRotation,
  drawing,
  onDrawingChange,
}: Props) => {
  const viewport = useProjectStore(
    (state) => state.viewports[view.id] ?? DEFAULT_VIEWPORT,
  );
  const selection = useProjectStore((state) => state.selection);
  const tool = useProjectStore((state) => state.tool);
  const testMode = useProjectStore((state) => state.testMode);
  const [drag, setDrag] = useState<Drag | null>(null);
  // The dragged track's new shape while a corner is dragged.
  const [vertexPoints, setVertexPoints] = useState<GridPoint[] | undefined>();
  const revision = useProjectStore((state) => state.revision);
  // The grid point under the mouse, and the project revision it was seen at.
  const [pointerAt, setPointerAt] = useState<{
    grid: GridPoint;
    revision: number;
  } | null>(null);
  const [pendingReplace, setPendingReplace] = useState<PendingReplace | null>(
    null,
  );
  const diagram = useRef<DiagramViewHandle>(null);
  // After any change (placing, undo, redo) the preview waits for the mouse
  // to move: otherwise it would hide the element undo just brought back.
  const hover =
    pointerAt && pointerAt.revision === revision ? pointerAt.grid : null;

  const selectionSet = useMemo(() => new Set(selection), [selection]);
  const selectedElements = useMemo(
    () => view.elements.filter((element) => selectionSet.has(element.id)),
    [view.elements, selectionSet],
  );
  const singleTrack =
    selectedElements.length === 1 && selectedElements[0].kind === 'track'
      ? (selectedElements[0] as Track)
      : undefined;

  const handleDown = (pointer: DiagramPointer) => {
    const {grid, elementId, event} = pointer;
    if (testMode) {
      const element = view.elements.find(
        (candidate) => candidate.id === elementId,
      );
      if (element) {
        const message = testNext(project, element);
        if (message) {
          setHint(message);
        }
      }
      return;
    }
    switch (tool.kind) {
      case 'track': {
        if (drawing.length === 0) {
          onDrawingChange([grid]);
          return;
        }
        // Onto a track end or turnout leg: exactly there (with a bend if it
        // is not in line), and the track is finished.
        const added = nextDrawingPoints(
          view,
          drawing,
          {x: pointer.x, y: pointer.y},
          grid,
        );
        if (added.length === 0) {
          finishTrack(view.id, drawing);
          onDrawingChange([]);
          return;
        }
        const extended = simplifyPolyline([...drawing, ...added]);
        if (attachPoints(view).has(pointKey(grid))) {
          finishTrack(view.id, extended);
          onDrawingChange([]);
          return;
        }
        onDrawingChange(extended);
        return;
      }
      case 'place':
        placeAt(tool, grid);
        return;
      case 'select': {
        const vertex = (event.target as Element).getAttribute?.(
          'data-vertex-index',
        );
        if (vertex !== null && vertex !== undefined && singleTrack) {
          setDrag({
            kind: 'vertex',
            trackId: singleTrack.id,
            index: Number(vertex),
            current: grid,
          });
          setVertexPoints(undefined);
          return;
        }
        if (elementId) {
          const additive = event.shiftKey || event.ctrlKey;
          if (additive) {
            select(
              selectionSet.has(elementId)
                ? selection.filter((id) => id !== elementId)
                : [...selection, elementId],
            );
            return;
          }
          if (!selectionSet.has(elementId)) {
            select([elementId]);
          }
          setDrag({kind: 'move', start: grid, current: grid});
          return;
        }
        if (!event.shiftKey && !event.ctrlKey) {
          select([]);
        }
        setDrag({
          kind: 'rubber',
          start: {x: pointer.x, y: pointer.y},
          current: {x: pointer.x, y: pointer.y},
          additive: event.shiftKey || event.ctrlKey,
        });
      }
    }
  };

  const placeAt = (
    current: Extract<Tool, {kind: 'place'}>,
    grid: GridPoint,
  ) => {
    const result = placeElement(view, current.element, grid, {
      turnoutType: current.turnoutType as TurnoutType | undefined,
      rotation: placeRotation,
    });
    if (!result.ok) {
      setHint(hintFor(result.reason));
      return;
    }
    const element = result.element;
    const replaced = elementsReplacedBy(view, element);
    if (replaced.length === 1 && sameAsExisting(element, replaced[0])) {
      // Already there (a double click or tap): just select it.
      select([replaced[0].id]);
      return;
    }
    if (replaced.some(holdsUserData)) {
      setPendingReplace({element, replaced});
      return;
    }
    commitPlace(element, replaced);
  };

  // One edit, so a single Ctrl+Z brings back what was replaced.
  const commitPlace = (element: DiagramElement, replaced: DiagramElement[]) => {
    const ids = replaced.map((old) => old.id);
    edit((p) => placeReplacing(p, view.id, element, ids));
    select([element.id]);
  };

  const handleMove = (pointer: DiagramPointer) => {
    setPointerAt({grid: pointer.grid, revision});
    if (!drag) {
      return;
    }
    switch (drag.kind) {
      case 'move':
        setDrag({...drag, current: pointer.grid});
        return;
      case 'vertex': {
        // Along 45° lines, or exactly onto a connection (dragCorner); keeps
        // the last valid shape while the pointer is somewhere impossible.
        const track = view.elements.find((e) => e.id === drag.trackId);
        if (track?.kind === 'track') {
          const points = dragCorner(
            view,
            track,
            drag.index,
            {x: pointer.x, y: pointer.y},
            pointer.grid,
          );
          if (points) {
            setVertexPoints(points);
          }
        }
        setDrag({...drag, current: pointer.grid});
        return;
      }
      case 'rubber':
        setDrag({...drag, current: {x: pointer.x, y: pointer.y}});
        return;
    }
  };

  const handleUp = () => {
    if (!drag) {
      return;
    }
    setDrag(null);
    switch (drag.kind) {
      case 'move': {
        const offset = {
          x: drag.current.x - drag.start.x,
          y: drag.current.y - drag.start.y,
        };
        if (offset.x !== 0 || offset.y !== 0) {
          edit((p) => moveElements(p, view.id, selection, offset));
        }
        return;
      }
      case 'vertex': {
        const track = view.elements.find(
          (element) => element.id === drag.trackId,
        );
        const points = vertexPoints;
        setVertexPoints(undefined);
        if (
          track?.kind !== 'track' ||
          !points ||
          !isValidPolyline(points) ||
          JSON.stringify(points) === JSON.stringify(track.points)
        ) {
          return;
        }
        edit((p) => replaceElement(p, {...track, points}));
        return;
      }
      case 'rubber': {
        const minX = Math.min(drag.start.x, drag.current.x);
        const maxX = Math.max(drag.start.x, drag.current.x);
        const minY = Math.min(drag.start.y, drag.current.y);
        const maxY = Math.max(drag.start.y, drag.current.y);
        if (maxX - minX < 0.2 && maxY - minY < 0.2) {
          return;
        }
        const inside = view.elements
          .filter((element) =>
            elementPoints(element).every(
              (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY,
            ),
          )
          .map((element) => element.id);
        select(
          drag.additive ? [...new Set([...selection, ...inside])] : inside,
        );
      }
    }
  };

  // --- previews ------------------------------------------------------------

  const moveOffset =
    drag?.kind === 'move'
      ? {x: drag.current.x - drag.start.x, y: drag.current.y - drag.start.y}
      : undefined;
  const moving = moveOffset && (moveOffset.x !== 0 || moveOffset.y !== 0);

  let ghost: DiagramElement | undefined;
  if (tool.kind === 'place' && hover && !testMode) {
    const result = placeElement(view, tool.element, hover, {
      turnoutType: tool.turnoutType as TurnoutType | undefined,
      rotation: placeRotation,
    });
    ghost = result.ok ? result.element : undefined;
  }
  // While previewing, hide what the new element would replace. Nothing to
  // preview where the same element already is.
  let replacedByGhost = ghost ? elementsReplacedBy(view, ghost) : [];
  if (
    ghost &&
    replacedByGhost.length === 1 &&
    sameAsExisting(ghost, replacedByGhost[0])
  ) {
    ghost = undefined;
    replacedByGhost = [];
  }
  // While a corner is dragged, the track is drawn in its new shape.
  const reshaped =
    drag?.kind === 'vertex' && vertexPoints && singleTrack
      ? {...singleTrack, points: vertexPoints}
      : undefined;
  const hiddenIds = moving
    ? selectionSet
    : reshaped
      ? new Set([reshaped.id])
      : replacedByGhost.length > 0
        ? new Set(replacedByGhost.map((element) => element.id))
        : undefined;

  const drawingPreview =
    tool.kind === 'track' && drawing.length > 0 && hover
      ? [...drawing, ...nextDrawingPoints(view, drawing, hover, hover)]
      : drawing;

  const cursor = testMode
    ? 'pointer'
    : tool.kind === 'select'
      ? 'default'
      : 'crosshair';

  return (
    <>
      <DiagramView
        ref={diagram}
        className="diagram"
        project={project}
        view={view}
        viewport={viewport}
        onViewportChange={(next) => setViewport(view.id, next)}
        selection={selectionSet}
        hidden={hiddenIds}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        // A second finger turned the press into a pinch: drop the drag.
        onPointerCancel={() => setDrag(null)}
        onDoubleClick={() => {
          if (tool.kind === 'track' && drawing.length >= 2) {
            finishTrack(view.id, drawing);
            onDrawingChange([]);
          }
        }}
        onContextMenu={() => {
          if (tool.kind === 'track') {
            finishTrack(view.id, drawing);
            onDrawingChange([]);
          }
        }}
        cursor={cursor}
      >
        {moving && (
          <g
            transform={`translate(${moveOffset.x} ${moveOffset.y})`}
            opacity={0.7}
          >
            {selectedElements.map((element) => (
              <ElementShape key={element.id} element={element} selected />
            ))}
          </g>
        )}
        {reshaped && (
          <g pointerEvents="none">
            <ElementShape element={reshaped} selected />
          </g>
        )}
        {ghost && (
          <g opacity={0.5} pointerEvents="none">
            <ElementShape element={ghost} selected={false} />
          </g>
        )}
        {drawingPreview.length > 0 && (
          <polyline
            points={drawingPreview.map((p) => `${p.x},${p.y}`).join(' ')}
            pointerEvents="none"
            style={{
              fill: 'none',
              stroke: color.accent,
              strokeWidth: diagramStroke.track,
              strokeDasharray: '0.3 0.15',
              strokeLinecap: 'round',
            }}
          />
        )}
        {tool.kind === 'track' && hover && (
          <circle
            cx={hover.x}
            cy={hover.y}
            r={0.15}
            pointerEvents="none"
            style={{fill: color.accent}}
          />
        )}
        {singleTrack &&
          tool.kind === 'select' &&
          !testMode &&
          (reshaped ?? singleTrack).points.map((shown, index) => {
            return (
              <circle
                key={index}
                cx={shown.x}
                cy={shown.y}
                r={0.22}
                data-vertex-index={index}
                style={{
                  fill: color.surface,
                  stroke: color.accent,
                  strokeWidth: 0.07,
                  cursor: 'move',
                }}
              />
            );
          })}
        <AreaBoundaries project={project} view={view} />
        {drag?.kind === 'rubber' && (
          <rect
            x={Math.min(drag.start.x, drag.current.x)}
            y={Math.min(drag.start.y, drag.current.y)}
            width={Math.abs(drag.current.x - drag.start.x)}
            height={Math.abs(drag.current.y - drag.start.y)}
            pointerEvents="none"
            style={{
              fill: color.accent,
              fillOpacity: 0.1,
              stroke: color.accent,
              strokeWidth: 0.04,
            }}
          />
        )}
      </DiagramView>
      {pendingReplace && (
        <Modal title={strings.editor.replaceTitle}>
          <p>
            {strings.editor.confirmReplace(
              pendingReplace.replaced.map(describeElement).join(', '),
            )}
          </p>
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => {
                setPendingReplace(null);
                commitPlace(pendingReplace.element, pendingReplace.replaced);
              }}
            >
              {strings.editor.replace}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setPendingReplace(null)}
            >
              {strings.modes.cancel}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
};
