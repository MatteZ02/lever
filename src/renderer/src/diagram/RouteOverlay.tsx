// Routes on the diagram of one view (LOOK-2, LOOK-3): set routes as green
// dashes over the track (over red where it is occupied, so both show), a
// route being set with moving dashes, a broken or failed route with
// dash-dot amber, and the operator's preview with accent dashes. The picked
// start, via points and end are ringed.
import {Project} from '../../../model/project';
import {findElement} from '../../../model/validation';
import {RouteLive} from '../../../shared/liveState';
import {color, diagramDash, diagramStroke} from '../../theme';
import {useEngineStore} from '../store/engineStore';
import {useRouteSearch, useRouteStore} from '../store/routeStore';

const styleFor = (state: RouteLive['state'] | 'preview') => {
  switch (state) {
    case 'set':
      return {stroke: color.trackRouteSet, dash: diagramDash.routeSet};
    case 'setting':
      return {
        stroke: color.trackRouteSetting,
        dash: diagramDash.routeSetting,
        className: 'route-setting',
      };
    case 'broken':
    case 'failed':
      return {stroke: color.trackRouteBroken, dash: diagramDash.routeBroken};
    case 'preview':
      return {stroke: color.accent, dash: diagramDash.routePreview};
  }
};

const Lines = ({
  segments,
  viewId,
  state,
}: {
  segments: RouteLive['segments'];
  viewId: string;
  state: RouteLive['state'] | 'preview';
}) => {
  const style = styleFor(state);
  return (
    <>
      {segments
        .filter((segment) => segment.viewId === viewId)
        .map((segment, index) => (
          <polyline
            key={index}
            className={style.className}
            points={segment.points.map((p) => `${p.x},${p.y}`).join(' ')}
            pointerEvents="none"
            style={{
              fill: 'none',
              stroke: style.stroke,
              strokeWidth: diagramStroke.routeOverlay,
              strokeDasharray: style.dash,
              strokeLinejoin: 'round',
            }}
          />
        ))}
    </>
  );
};

export const RouteOverlay = ({
  project,
  viewId,
}: {
  project: Project;
  viewId: string;
}) => {
  const routes = useEngineStore((state) => state.layout.routes);
  const pick = useRouteStore((state) => state.pick);
  const search = useRouteSearch(project, pick);
  const preview =
    search?.ok && pick
      ? (search.routes[pick.choice] ?? search.routes[0])
      : undefined;
  const marked = [pick?.from, ...(pick?.via ?? []), pick?.to].flatMap((id) => {
    const element = id ? findElement(project, id) : undefined;
    const inView = project.views
      .find((view) => view.id === viewId)
      ?.elements.some((e) => e.id === id);
    return element && inView && 'at' in element ? [element.at] : [];
  });
  return (
    <g pointerEvents="none">
      {Object.values(routes).map((route) => (
        <Lines
          key={route.id}
          segments={route.segments}
          viewId={viewId}
          state={route.state}
        />
      ))}
      {preview && (
        <Lines segments={preview.segments} viewId={viewId} state="preview" />
      )}
      {marked.map((at, index) => (
        <circle
          key={index}
          cx={at.x}
          cy={at.y}
          r={0.55}
          style={{
            fill: 'none',
            stroke: color.accent,
            strokeWidth: 0.08,
          }}
        />
      ))}
    </g>
  );
};
