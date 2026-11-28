// Tabs of the traffic view, the layout views and the stations, shared by the
// main window and plain station windows. In edit mode, "+ View" adds an empty view, and a
// tab can be dragged to another place in its own group (views among views,
// stations among stations); one move is one undo step.
import {PointerEvent, ReactNode, useRef, useState} from 'react';
import {arrangementsOf, createArrangement} from '../../model/arrangement';
import {moveLayoutView, moveStation} from '../../model/editing';
import {Project} from '../../model/project';
import {strings} from '../../shared/strings';
import {
  edit,
  setActiveArrangement,
  setActiveView,
  setTrafficView,
} from './store/projectStore';

type Group = 'views' | 'stations';
type Drag = {
  group: Group;
  id: string;
  x: number;
  y: number;
  // Moved far enough to be a drag, not a click.
  moving: boolean;
  // Where it would go: an index in its group.
  over: number | null;
};

// Pixels the pointer moves before a press becomes a drag.
const DRAG_THRESHOLD = 6;

export const ViewTabs = ({
  project,
  shownArrangementId,
  shownViewId,
  trafficShown = false,
  editing = false,
  onSwitch,
  children,
}: {
  project: Project;
  // The view or station shown (one of them).
  shownArrangementId?: string;
  shownViewId?: string;
  trafficShown?: boolean;
  editing?: boolean;
  onSwitch?: () => void;
  // More tabs after the stations (e.g. "+ Add station").
  children?: ReactNode;
}) => {
  const arrangements = arrangementsOf(project);
  const containerRef = useRef<HTMLDivElement>(null);
  // The drag in progress, also in a ref: pointer events can arrive before
  // React has rendered the previous one.
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };
  // The click that ends a drag does not switch tabs.
  const dragged = useRef(false);

  // The tab of the group nearest to the pointer (tabs may wrap to rows).
  const indexAt = (group: Group, x: number, y: number): number | null => {
    const tabs = [
      ...(containerRef.current?.querySelectorAll<HTMLElement>(
        `[data-tab-group="${group}"]`,
      ) ?? []),
    ];
    let best: number | null = null;
    let bestDistance = Infinity;
    tabs.forEach((tab, index) => {
      const r = tab.getBoundingClientRect();
      const distance = Math.hypot(
        x - (r.left + r.width / 2),
        y - (r.top + r.height / 2),
      );
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  };

  const dragProps = (group: Group, id: string) =>
    editing
      ? {
          'data-tab-group': group,
          onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
            if (event.button !== 0) {
              return;
            }
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag({
              group,
              id,
              x: event.clientX,
              y: event.clientY,
              moving: false,
              over: null,
            });
          },
          onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
            const current = dragRef.current;
            if (current?.id !== id) {
              return;
            }
            const moving =
              current.moving ||
              Math.hypot(event.clientX - current.x, event.clientY - current.y) >
                DRAG_THRESHOLD;
            if (moving) {
              setDrag({
                ...current,
                moving,
                over: indexAt(group, event.clientX, event.clientY),
              });
            }
          },
          onPointerUp: () => {
            const current = dragRef.current;
            setDrag(null);
            if (current?.moving) {
              dragged.current = true;
              const to = current.over;
              if (to !== null) {
                edit((p) =>
                  group === 'views'
                    ? moveLayoutView(p, id, to)
                    : moveStation(p, id, to),
                );
              }
            }
          },
          onPointerCancel: () => setDrag(null),
        }
      : {};

  const tabClass = (
    group: Group,
    id: string,
    index: number,
    active: boolean,
    extra = '',
  ) => {
    const moving = drag?.moving === true && drag.group === group;
    return [
      'view-tab',
      extra,
      active ? 'view-tab--active' : '',
      editing ? 'view-tab--movable' : '',
      moving && drag.id === id ? 'view-tab--dragging' : '',
      moving && drag.over === index && drag.id !== id ? 'view-tab--drop' : '',
    ]
      .filter(Boolean)
      .join(' ');
  };

  // A click switches tabs, unless it ended a drag.
  const switchTo = (open: () => void) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onSwitch?.();
    open();
  };

  return (
    <div
      ref={containerRef}
      className="view-tabs"
      role="tablist"
      aria-label={strings.full.tabsLabel}
    >
      {!editing && (
        <button
          type="button"
          role="tab"
          aria-selected={trafficShown}
          className={`view-tab view-tab--layout${trafficShown ? ' view-tab--active' : ''}`}
          onClick={() => switchTo(setTrafficView)}
        >
          {strings.traffic.tab}
        </button>
      )}
      {arrangements.map((arrangement, index) => {
        const active = arrangement.id === shownArrangementId;
        return (
          <button
            key={arrangement.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={tabClass(
              'views',
              arrangement.id,
              index,
              active,
              'view-tab--layout',
            )}
            {...dragProps('views', arrangement.id)}
            onClick={() => switchTo(() => setActiveArrangement(arrangement.id))}
          >
            {arrangement.name}
          </button>
        );
      })}
      {editing && (
        <button
          type="button"
          className="view-tab view-tab--layout"
          onClick={() => {
            const created = createArrangement(
              strings.full.newName(arrangements.length + 1),
            );
            edit((p) => ({...p, arrangements: [...p.arrangements, created]}));
            onSwitch?.();
            setActiveArrangement(created.id);
          }}
        >
          + {strings.full.add}
        </button>
      )}
      {(arrangements.length > 0 || editing) && (
        <span className="view-tabs-separator" aria-hidden="true" />
      )}
      {project.views.map((candidate, index) => {
        const active = candidate.id === shownViewId;
        return (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={tabClass('stations', candidate.id, index, active)}
            {...dragProps('stations', candidate.id)}
            onClick={() => switchTo(() => setActiveView(candidate.id))}
          >
            {candidate.name}
          </button>
        );
      })}
      {children}
    </div>
  );
};
