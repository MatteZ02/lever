// The editor's drawing surface (EDT-2, EDT-3): selecting, moving, drawing
// track, placing elements, dragging track corners, and test-mode clicks.
import {useMemo, useRef, useState} from 'react';
import {
  addElements,
  elementPoints,
  extendPolyline,
  insertTurnout,
  moveElements,
  replaceElement,
} from '../../../model/editing';
import {DiagramElement, Track, TurnoutType} from '../../../model/elements';
import {
  GridPoint,
  isValidPolyline,
  samePoint,
  simplifyPolyline,
  snapToDirection,
} from '../../../model/geometry';
import {placeElement} from '../../../model/placement';
import {newId, Project, StationView} from '../../../model/project';
import {strings} from '../../../shared/strings';
import {color, diagramStroke} from '../../theme';
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

export const finishTrack = (viewId: string, points: GridPoint[]): void => {
  const simplified = simplifyPolyline(points);
  if (simplified.length >= 2 && isValidPolyline(simplified)) {
    const track: Track = {
      kind: 'track',
      id: newId('track'),
      name: '',
      points: simplified,
    };
    edit((project) => addElements(project, viewId, [track]));
  }
};

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
  const [hover, setHover] = useState<GridPoint | null>(null);
  const diagram = useRef<DiagramViewHandle>(null);

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
        const last = drawing[drawing.length - 1];
        const next = snapToDirection(last, {x: pointer.x, y: pointer.y});
        if (samePoint(next, last)) {
          finishTrack(view.id, drawing);
          onDrawingChange([]);
          return;
        }
        const extended = extendPolyline(drawing, next);
        if (extended) {
          onDrawingChange(extended);
        }
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
    edit((p) =>
      element.kind === 'turnout'
        ? insertTurnout(p, view.id, element)
        : addElements(p, view.id, [element]),
    );
    select([element.id]);
  };

  const handleMove = (pointer: DiagramPointer) => {
    setHover(pointer.grid);
    if (!drag) {
      return;
    }
    switch (drag.kind) {
      case 'move':
      case 'vertex':
        setDrag({...drag, current: pointer.grid});
        return;
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
        if (track?.kind !== 'track') {
          return;
        }
        const points = track.points.map((point, index) =>
          index === drag.index ? drag.current : point,
        );
        if (isValidPolyline(simplifyPolyline(points))) {
          edit((p) =>
            replaceElement(p, {...track, points: simplifyPolyline(points)}),
          );
        } else {
          setHint(strings.editor.hints.notStraight);
        }
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

  const drawingPreview =
    tool.kind === 'track' && drawing.length > 0 && hover
      ? [...drawing, snapToDirection(drawing[drawing.length - 1], hover)]
      : drawing;

  const cursor = testMode
    ? 'pointer'
    : tool.kind === 'select'
      ? 'default'
      : 'crosshair';

  return (
    <DiagramView
      ref={diagram}
      className="diagram"
      project={project}
      view={view}
      viewport={viewport}
      onViewportChange={(next) => setViewport(view.id, next)}
      selection={selectionSet}
      hidden={moving ? selectionSet : undefined}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
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
        singleTrack.points.map((point, index) => {
          const shown =
            drag?.kind === 'vertex' && drag.index === index
              ? drag.current
              : point;
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
  );
};
