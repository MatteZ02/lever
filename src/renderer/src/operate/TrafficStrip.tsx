// The traffic strip along the bottom of operating mode: routes (new route,
// undo, the routes set here) on one line, so the diagram keeps the whole
// width. While a route is being made its preview opens above that line;
// "More" shows saved routes and the trains. The same information fills the
// traffic view (TrafficBoard.tsx).
import {Project} from '../../../model/project';
import {strings} from '../../../shared/strings';
import {useEngineStore} from '../store/engineStore';
import {setPanelOpen, useRouteStore} from '../store/routeStore';
import {AutomationButton} from './AutomationButton';
import {
  ActiveRoutes,
  RouteActions,
  RouteMaking,
  routesAvailable,
  SavedRoutes,
} from './RoutePanel';
import {TrainList} from './TrainList';

const text = strings.traffic;

export const TrafficStrip = ({project}: {project: Project}) => {
  const pick = useRouteStore((state) => state.pick);
  const expanded = useRouteStore((state) => state.panelOpen);
  const routeCount = useEngineStore(
    (state) => Object.keys(state.layout.routes).length,
  );
  if (!routesAvailable(project) && routeCount === 0 && !pick && !expanded) {
    return (
      <section className="traffic-strip" aria-label={text.title}>
        <div className="traffic-strip-bar">
          <MoreButton expanded={false} />
          <span className="muted small">{text.noRoutesHere}</span>
        </div>
      </section>
    );
  }
  return (
    <section className="traffic-strip" aria-label={text.title}>
      {pick && (
        <div className="traffic-strip-detail traffic-strip-making">
          <RouteMaking project={project} />
        </div>
      )}
      {expanded && !pick && (
        <div className="traffic-strip-detail">
          <div className="traffic-column">
            <SavedRoutes project={project} />
          </div>
          <div className="traffic-column">
            <TrainList project={project} />
          </div>
        </div>
      )}
      <div className="traffic-strip-bar">
        <MoreButton expanded={expanded} />
        {!pick && <RouteActions project={project} />}
        <div className="traffic-strip-routes">
          {routeCount === 0 ? (
            <span className="muted small">{strings.routes.none}</span>
          ) : (
            <ActiveRoutes project={project} />
          )}
        </div>
        <AutomationButton project={project} />
      </div>
    </section>
  );
};

const MoreButton = ({expanded}: {expanded: boolean}) => (
  <button
    type="button"
    className="button button--small"
    aria-expanded={expanded}
    onClick={() => setPanelOpen(!expanded)}
  >
    {expanded ? text.less : text.more}
  </button>
);
