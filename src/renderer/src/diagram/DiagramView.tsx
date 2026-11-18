// One station view as SVG (STK-8): crisp at any zoom, simple hit testing.
// Shared by operating mode and the editor; the editor adds its overlays and
// pointer handling through props.
import {
  forwardRef,
  PointerEvent,
  ReactNode,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  WheelEvent,
} from 'react';
import {DiagramElement} from '../../../model/elements';
import {Project, StationView} from '../../../model/project';
import {findSignalType} from '../../../model/signalTypes';
import {color} from '../../theme';
import {Viewport} from '../store/projectStore';
import {ElementDisplay, ElementShape, LAYER} from './shapes';

export const MIN_SCALE = 4;
export const MAX_SCALE = 160;

export type DiagramPointer = {
  // Exact position in grid units, and the nearest grid point.
  x: number;
  y: number;
  grid: {x: number; y: number};
  elementId?: string;
  event: PointerEvent<SVGSVGElement>;
  // On pointer up: the pointer moved more than a few pixels since it went
  // down (a drag or pan, not a click).
  moved?: boolean;
};

export type DiagramViewHandle = {
  size(): {width: number; height: number};
};

type Props = {
  project: Project;
  view: StationView;
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
  selection?: ReadonlySet<string>;
  // Elements hidden while the editor draws a moved copy of them.
  hidden?: ReadonlySet<string>;
  displays?: Record<string, ElementDisplay>;
  onPointerDown?: (pointer: DiagramPointer) => void;
  onPointerMove?: (pointer: DiagramPointer) => void;
  onPointerUp?: (pointer: DiagramPointer) => void;
  onDoubleClick?: () => void;
  onContextMenu?: () => void;
  // Operating mode: dragging empty space with the left button pans.
  panOnEmpty?: boolean;
  // Extra SVG in grid units (previews, handles).
  children?: ReactNode;
  className?: string;
  cursor?: string;
};

const elementIdOf = (target: EventTarget | null): string | undefined => {
  let node = target as Element | null;
  while (node && node instanceof Element) {
    const id = node.getAttribute('data-element-id');
    if (id) {
      return id;
    }
    node = node.parentElement;
  }
  return undefined;
};

export const DiagramView = forwardRef<DiagramViewHandle, Props>(
  function DiagramView(
    {
      project,
      view,
      viewport,
      onViewportChange,
      selection,
      hidden,
      displays,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onDoubleClick,
      onContextMenu,
      panOnEmpty,
      children,
      className,
      cursor,
    },
    ref,
  ) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [size, setSize] = useState({width: 800, height: 600});
    const panning = useRef<{x: number; y: number; viewport: Viewport} | null>(
      null,
    );
    // Where the left button went down, and on which element: the pointer is
    // captured, so the release itself always targets the SVG.
    const pressedAt = useRef<{x: number; y: number; elementId?: string} | null>(
      null,
    );

    useImperativeHandle(ref, () => ({size: () => size}), [size]);

    useLayoutEffect(() => {
      const svg = svgRef.current;
      if (!svg) {
        return;
      }
      const observer = new ResizeObserver(([entry]) => {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      });
      observer.observe(svg);
      return () => observer.disconnect();
    }, []);

    const sorted = useMemo(
      () => [...view.elements].sort((a, b) => LAYER[a.kind] - LAYER[b.kind]),
      [view.elements],
    );

    const signalCategories = useMemo(() => {
      const categories = new Map<string, 'main' | 'distant' | 'shunting'>();
      for (const element of view.elements) {
        if (element.kind === 'signal') {
          categories.set(
            element.id,
            findSignalType(project.signalTypes, element.signalTypeId)
              ?.category ?? 'main',
          );
        }
      }
      return categories;
    }, [view.elements, project.signalTypes]);

    // The element layer depends only on the elements and their state, not on
    // the viewport: zooming and panning then only change the viewBox, and
    // React does not walk thousands of elements per step (STK-8).
    const layer = useMemo(
      () =>
        sorted.map((element: DiagramElement) =>
          hidden?.has(element.id) ? null : (
            <ElementShape
              key={element.id}
              element={element}
              selected={selection?.has(element.id) ?? false}
              signalCategory={signalCategories.get(element.id)}
              display={displays?.[element.id]}
            />
          ),
        ),
      [sorted, hidden, selection, signalCategories, displays],
    );

    const toPointer = (event: PointerEvent<SVGSVGElement>): DiagramPointer => {
      const rect = svgRef.current!.getBoundingClientRect();
      const x = viewport.x + (event.clientX - rect.left) / viewport.scale;
      const y = viewport.y + (event.clientY - rect.top) / viewport.scale;
      return {
        x,
        y,
        grid: {x: Math.round(x), y: Math.round(y)},
        elementId: elementIdOf(event.target),
        event,
      };
    };

    const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
      const rect = svgRef.current!.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0015);
      const scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, viewport.scale * factor),
      );
      // Keep the point under the mouse where it is.
      const mx = viewport.x + (event.clientX - rect.left) / viewport.scale;
      const my = viewport.y + (event.clientY - rect.top) / viewport.scale;
      onViewportChange({
        scale,
        x: mx - (event.clientX - rect.left) / scale,
        y: my - (event.clientY - rect.top) / scale,
      });
    };

    // Middle button (or the right button in operating mode) pans the view.
    const startPan = (event: PointerEvent<SVGSVGElement>) => {
      panning.current = {x: event.clientX, y: event.clientY, viewport};
      svgRef.current?.setPointerCapture(event.pointerId);
    };

    const width = size.width / viewport.scale;
    const height = size.height / viewport.scale;

    return (
      <svg
        ref={svgRef}
        className={className}
        viewBox={`${viewport.x} ${viewport.y} ${width} ${height}`}
        // Never centre or stretch: pointer maths assumes the top-left corner
        // is (viewport.x, viewport.y) at viewport.scale pixels per unit.
        preserveAspectRatio="xMinYMin meet"
        style={{
          background: color.diagramBackground,
          cursor,
          touchAction: 'none',
        }}
        onWheel={handleWheel}
        onPointerDown={(event) => {
          const pointer = toPointer(event);
          if (event.button === 0) {
            pressedAt.current = {
              x: event.clientX,
              y: event.clientY,
              elementId: pointer.elementId,
            };
          }
          if (
            event.button === 1 ||
            (event.button === 0 && event.altKey) ||
            (event.button === 0 && panOnEmpty && !pointer.elementId)
          ) {
            event.preventDefault();
            startPan(event);
            return;
          }
          if (event.button === 0) {
            svgRef.current?.setPointerCapture(event.pointerId);
            onPointerDown?.(pointer);
          }
        }}
        onPointerMove={(event) => {
          if (panning.current) {
            const start = panning.current;
            onViewportChange({
              ...start.viewport,
              x: start.viewport.x - (event.clientX - start.x) / viewport.scale,
              y: start.viewport.y - (event.clientY - start.y) / viewport.scale,
            });
            return;
          }
          onPointerMove?.(toPointer(event));
        }}
        onPointerUp={(event) => {
          const pressed = pressedAt.current;
          pressedAt.current = null;
          const moved =
            pressed !== null &&
            Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) >
              5;
          const wasPanning = panning.current !== null;
          panning.current = null;
          if (wasPanning && (moved || event.button !== 0)) {
            return;
          }
          if (event.button === 0) {
            onPointerUp?.({
              ...toPointer(event),
              elementId: pressed?.elementId,
              moved,
            });
          }
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu?.();
        }}
      >
        <defs>
          <pattern
            id="grid-dots"
            x={-0.5}
            y={-0.5}
            width={1}
            height={1}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx={0.5}
              cy={0.5}
              r={0.04}
              style={{fill: color.diagramGrid}}
            />
          </pattern>
        </defs>
        {viewport.scale >= 10 && (
          <rect
            x={viewport.x}
            y={viewport.y}
            width={width}
            height={height}
            fill="url(#grid-dots)"
          />
        )}
        {layer}
        {children}
      </svg>
    );
  },
);

// Viewport that shows all elements of a view, with a margin.
export const fitViewport = (
  view: StationView,
  size: {width: number; height: number},
): Viewport => {
  const points = view.elements.flatMap((element) =>
    element.kind === 'track'
      ? element.points
      : element.kind === 'platform'
        ? [
            element.at,
            {x: element.at.x + element.width, y: element.at.y + element.height},
          ]
        : [element.at],
  );
  if (points.length === 0) {
    return {x: -2, y: -2, scale: 24};
  }
  const minX = Math.min(...points.map((p) => p.x)) - 6;
  const maxX = Math.max(...points.map((p) => p.x)) + 6;
  const minY = Math.min(...points.map((p) => p.y)) - 2;
  const maxY = Math.max(...points.map((p) => p.y)) + 2;
  const scale = Math.min(
    MAX_SCALE,
    Math.max(
      MIN_SCALE,
      Math.min(size.width / (maxX - minX), size.height / (maxY - minY)),
    ),
  );
  return {
    scale,
    x: (minX + maxX) / 2 - size.width / scale / 2,
    y: (minY + maxY) / 2 - size.height / scale / 2,
  };
};
