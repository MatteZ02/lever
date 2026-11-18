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
// A finger moving less than this is still a tap.
const TOUCH_SLOP_PX = 10;

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
  // A press ended without a release: a second finger turned it into a pinch.
  onPointerCancel?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: () => void;
  // Operating mode: dragging empty space with the left button pans.
  panOnEmpty?: boolean;
  // Extra SVG in grid units (previews, handles).
  children?: ReactNode;
  className?: string;
  cursor?: string;
};

// A mouse wheel turns in notches: Chromium reports them as multiples of 120
// (wheelDeltaY) and never sideways. A touchpad scrolls in small, smooth steps,
// often sideways too. (An old touchpad driver that imitates a wheel still
// zooms; Ctrl + wheel zooms either way.)
const isMouseWheel = (event: WheelEvent<SVGSVGElement>): boolean => {
  if (event.deltaMode !== 0) {
    return true; // lines or pages: a wheel
  }
  if (event.deltaX !== 0) {
    return false;
  }
  const native = event.nativeEvent as globalThis.WheelEvent & {
    wheelDeltaY?: number;
  };
  const notch = native.wheelDeltaY;
  return notch !== undefined && notch !== 0 && notch % 120 === 0;
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
      onPointerCancel,
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

    // Touch: fingers on the screen, a pinch in progress, and a first touch
    // held back until it moves or lifts. If a second finger lands first, the
    // touch was the start of a pinch, not a tap, so it must not place an
    // element or throw a turnout.
    const touches = useRef(new Map<number, {x: number; y: number}>());
    const pinch = useRef<{
      distance: number;
      // Grid point under the midpoint of the fingers when the pinch began.
      anchor: {x: number; y: number};
      scale: number;
    } | null>(null);
    const heldTouch = useRef<{
      event: PointerEvent<SVGSVGElement>;
      pointer: DiagramPointer;
    } | null>(null);
    // After a pinch, the remaining finger does nothing until all are lifted.
    const ignoreTouches = useRef(false);

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

    // Mouse wheel: zoom. Touchpad: two fingers move the view; a pinch (sent
    // as a wheel event with Ctrl) or Ctrl + wheel zooms.
    const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
      const rect = svgRef.current!.getBoundingClientRect();
      const notches = isMouseWheel(event);
      if (!notches && !event.ctrlKey) {
        const lines = event.deltaMode === 1 ? 16 : 1;
        onViewportChange({
          ...viewport,
          x: viewport.x + (event.deltaX * lines) / viewport.scale,
          y: viewport.y + (event.deltaY * lines) / viewport.scale,
        });
        return;
      }
      // A pinch comes in small steps; a wheel notch is about 100.
      const factor = Math.exp(-event.deltaY * (notches ? 0.0015 : 0.01));
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

    const press = (
      event: PointerEvent<SVGSVGElement>,
      pointer: DiagramPointer,
    ) => {
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
    };

    const move = (event: PointerEvent<SVGSVGElement>) => {
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
    };

    const release = (event: PointerEvent<SVGSVGElement>) => {
      const pressed = pressedAt.current;
      pressedAt.current = null;
      const moved =
        pressed !== null &&
        Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 5;
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
    };

    // --- touch -------------------------------------------------------------

    const pinchState = () => {
      const [a, b] = [...touches.current.values()];
      const rect = svgRef.current!.getBoundingClientRect();
      return {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        // Midpoint relative to the view, in pixels.
        mid: {x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top},
      };
    };

    const touchDown = (event: PointerEvent<SVGSVGElement>) => {
      touches.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      svgRef.current?.setPointerCapture(event.pointerId);
      if (ignoreTouches.current) {
        return;
      }
      if (touches.current.size === 1) {
        heldTouch.current = {event, pointer: toPointer(event)};
        return;
      }
      if (touches.current.size === 2) {
        // A second finger starts a pinch. Drop the first finger's press: held
        // back, or already started (a drag), which the owner cancels.
        if (heldTouch.current) {
          heldTouch.current = null;
        } else {
          onPointerCancel?.();
        }
        pressedAt.current = null;
        panning.current = null;
        const {distance, mid} = pinchState();
        pinch.current = {
          distance,
          scale: viewport.scale,
          anchor: {
            x: viewport.x + mid.x / viewport.scale,
            y: viewport.y + mid.y / viewport.scale,
          },
        };
      }
    };

    // True when the event is fully handled here.
    const touchMove = (event: PointerEvent<SVGSVGElement>): boolean => {
      if (!touches.current.has(event.pointerId)) {
        return true;
      }
      touches.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (ignoreTouches.current) {
        return true;
      }
      if (pinch.current) {
        if (touches.current.size < 2) {
          return true;
        }
        const start = pinch.current;
        const {distance, mid} = pinchState();
        const scale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, (start.scale * distance) / start.distance),
        );
        // Zoom about the midpoint and follow it: the grid point that was
        // under the fingers stays under them (pinch and two-finger pan).
        onViewportChange({
          scale,
          x: start.anchor.x - mid.x / scale,
          y: start.anchor.y - mid.y / scale,
        });
        return true;
      }
      const held = heldTouch.current;
      if (held) {
        const distance = Math.hypot(
          event.clientX - held.event.clientX,
          event.clientY - held.event.clientY,
        );
        if (distance <= TOUCH_SLOP_PX) {
          return true;
        }
        // A one-finger drag: it starts where the finger went down.
        heldTouch.current = null;
        press(held.event, held.pointer);
      }
      return false;
    };

    // True when the event is fully handled here.
    const touchUp = (event: PointerEvent<SVGSVGElement>): boolean => {
      touches.current.delete(event.pointerId);
      if (pinch.current || ignoreTouches.current) {
        pinch.current = null;
        ignoreTouches.current = touches.current.size > 0;
        return true;
      }
      const held = heldTouch.current;
      if (held) {
        // A tap: press, then release below.
        heldTouch.current = null;
        press(held.event, held.pointer);
      }
      return false;
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
          if (event.pointerType === 'touch') {
            touchDown(event);
            return;
          }
          press(event, toPointer(event));
        }}
        onPointerMove={(event) => {
          if (event.pointerType === 'touch' && touchMove(event)) {
            return;
          }
          move(event);
        }}
        onPointerUp={(event) => {
          if (event.pointerType === 'touch' && touchUp(event)) {
            return;
          }
          release(event);
        }}
        onPointerCancel={(event) => {
          if (event.pointerType === 'touch') {
            touches.current.delete(event.pointerId);
            heldTouch.current = null;
            pinch.current = null;
            ignoreTouches.current = touches.current.size > 0;
          }
          pressedAt.current = null;
          panning.current = null;
          onPointerCancel?.();
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
