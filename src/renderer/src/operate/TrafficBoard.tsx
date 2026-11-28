// The traffic view: routes and trains without a diagram, as its own tab or
// in a window of its own (window target "traffic"). Routes are chosen from
// the saved ones here (picking points needs a diagram); a route being made
// in another window is not shown, each window makes its own.
import {Project} from '../../../model/project';
import {strings} from '../../../shared/strings';
import {useEngineStore} from '../store/engineStore';
import {useRouteStore} from '../store/routeStore';
import {AutomationButton} from './AutomationButton';
import {
  ActiveRoutes,
  RouteActions,
  RouteMaking,
  SavedRoutes,
} from './RoutePanel';
import {TrainList} from './TrainList';

export const TrafficBoard = ({project}: {project: Project}) => {
  const pick = useRouteStore((state) => state.pick);
  const routeCount = useEngineStore(
    (state) => Object.keys(state.layout.routes).length,
  );
  return (
    <div className="traffic-board">
      <section className="traffic-board-section">
        <h2>{strings.routes.title}</h2>
        {pick ? (
          <RouteMaking project={project} />
        ) : (
          <div className="button-row">
            <RouteActions project={project} newRoute={false} />
          </div>
        )}
        <div className="traffic-board-routes">
          {routeCount === 0 ? (
            <p className="muted small">{strings.routes.none}</p>
          ) : (
            <ActiveRoutes project={project} />
          )}
        </div>
        {!pick && <SavedRoutes project={project} />}
      </section>
      <section className="traffic-board-section">
        <div className="button-row">
          <AutomationButton project={project} />
        </div>
        <TrainList project={project} />
      </section>
    </div>
  );
};
