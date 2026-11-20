// Routes (Level 2, section 8.8), in every operating window: choose a start
// and an end on the diagram (or a saved route), see the route before
// setting it (alternatives on a tie, manual turnouts, Level 1 parts), and
// manage the routes this control station has set: cancel, release, undo the
// last one. Manual turnouts are listed, never confirmed: setting the route
// records them, and the operator throws them by hand.
import {useMemo, useState} from 'react';
import {levelOf} from '../../../model/areas';
import {newId, Project} from '../../../model/project';
import {routeConflicts} from '../../../model/routeConflicts';
import {RoutePlan} from '../../../model/routing';
import {buildProjectTopology} from '../../../model/topology';
import {findElement, viewOfElement} from '../../../model/validation';
import {RouteLive} from '../../../shared/liveState';
import {strings} from '../../../shared/strings';
import {describeElementId} from '../describe';
import {sendCommand, useEngineStore} from '../store/engineStore';
import {edit, useProjectStore} from '../store/projectStore';
import {
  chooseAlternative,
  pickSavedRoute,
  setPanelOpen,
  startPicking,
  stopPicking,
  useRouteSearch,
  useRouteStore,
} from '../store/routeStore';

const text = strings.routes;

// Routes start in a Level 2 area (Level 1 is manual operation only).
const levelOfPoint = (project: Project, elementId: string) => {
  const element = findElement(project, elementId);
  const view = viewOfElement(project, elementId);
  return element && view
    ? levelOf(project, view, element)
    : project.settings.defaultLevel;
};

export const RoutePanel = ({project}: {project: Project}) => {
  const routes = useEngineStore((state) => state.layout.routes);
  const pick = useRouteStore((state) => state.pick);
  const open = useRouteStore((state) => state.panelOpen);
  const readOnly = useProjectStore((state) => state.document?.readOnly);
  const active = Object.values(routes).sort((a, b) => b.order - a.order);
  const level2 = project.areas.some((area) => area.level >= 2);

  if (!level2 && active.length === 0 && !pick) {
    return null;
  }
  if (!open) {
    return (
      <div className="route-panel route-panel--folded">
        <button
          type="button"
          className="button"
          onClick={() => setPanelOpen(true)}
        >
          {text.title}
          {active.length > 0 && ` (${active.length})`}
        </button>
      </div>
    );
  }
  const name = (id: string) => describeElementId(project, id);
  return (
    <aside className="route-panel" aria-label={text.title}>
      <div className="button-row">
        <h3>{text.title}</h3>
        <button
          type="button"
          className="button button--small"
          onClick={() => setPanelOpen(false)}
        >
          {text.fold}
        </button>
      </div>

      {pick ? (
        <RoutePreview project={project} readOnly={readOnly ?? true} />
      ) : (
        <div className="button-row">
          <button
            type="button"
            className="button"
            disabled={!level2}
            onClick={() => startPicking()}
          >
            {text.newRoute}
          </button>
          <button
            type="button"
            className="button"
            disabled={active.length === 0}
            onClick={() => sendCommand({type: 'undoRoute'})}
          >
            {text.undoLast}
          </button>
        </div>
      )}

      {active.map((route) => (
        <ActiveRoute key={route.id} route={route} name={name} />
      ))}

      {!pick && project.routes.length > 0 && (
        <div>
          <p className="muted small">{text.saved}</p>
          {project.routes.map((saved) => (
            <div key={saved.id} className="route-row">
              <span>{saved.name}</span>
              <button
                type="button"
                className="button button--small"
                onClick={() => pickSavedRoute(saved)}
              >
                {text.show}
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className="button button--small"
                  onClick={() =>
                    edit((p) => ({
                      ...p,
                      routes: p.routes.filter((r) => r.id !== saved.id),
                    }))
                  }
                >
                  {text.deleteSaved}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
};

const RoutePreview = ({
  project,
  readOnly,
}: {
  project: Project;
  readOnly: boolean;
}) => {
  const pick = useRouteStore((state) => state.pick)!;
  const search = useRouteSearch(project, pick);
  const routes = useEngineStore((state) => state.layout.routes);
  const topology = useMemo(() => buildProjectTopology(project), [project]);
  const [saveName, setSaveName] = useState<string | null>(null);
  // The route (by key) whose crossing the operator is asked to confirm.
  const [confirming, setConfirming] = useState<string | null>(null);
  const name = (id: string) => describeElementId(project, id);
  const saved = project.routes.find((r) => r.id === pick.savedRouteId);

  if (!pick.from) {
    return (
      <>
        <p>{text.clickStart}</p>
        <Cancel />
      </>
    );
  }
  if (!pick.to) {
    return (
      <>
        <p>{text.clickEnd(name(pick.from))}</p>
        <Cancel />
      </>
    );
  }
  if (!search?.ok) {
    return (
      <>
        <p>
          {name(pick.from)} → {name(pick.to)}
        </p>
        <p className="route-warning">
          {text.notFound[search?.reason ?? 'noPath']}
        </p>
        <Cancel />
      </>
    );
  }
  const plan: RoutePlan = search.routes[pick.choice] ?? search.routes[0];
  const startLevel = levelOfPoint(project, pick.from);
  const level1 = plan.areas.filter((area) => area.level === 1);
  const higher = plan.areas.some((area) => area.level > 2);
  const manual = plan.turnouts.filter((t) => t.manual);
  const canSet = startLevel === 2 && !higher;
  const conflicts = routeConflicts(
    topology,
    plan.steps,
    Object.values(routes).map((route) => ({id: route.id, steps: route.steps})),
  );
  const routeName = (id: string) =>
    routes[id] ? `${name(routes[id].from)} → ${name(routes[id].to)}` : id;
  const cancels = conflicts.filter((c) => c.kind === 'conflict');
  const crosses = conflicts.filter((c) => c.kind === 'crossing');
  const setRoute = () => {
    sendCommand({
      type: 'setRoute',
      from: pick.from!,
      to: pick.to!,
      via: pick.via,
      key: plan.key,
      allowCrossing: crosses.length > 0,
    });
    setConfirming(null);
    stopPicking();
  };
  if (confirming === plan.key && crosses.length > 0) {
    return (
      <>
        <p>
          <strong>{text.crossQuestion}</strong>
        </p>
        <p className="route-warning">
          {text.crosses(
            crosses.map((c) => routeName(c.routeId)).join(', '),
            [...new Set(crosses.flatMap((c) => c.elementIds))]
              .map(name)
              .join(', '),
          )}
        </p>
        <div className="button-row">
          <button type="button" className="button" onClick={setRoute}>
            {text.crossConfirm}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => setConfirming(null)}
          >
            {text.crossBack}
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <p>
        <strong>
          {saved?.name ?? `${name(pick.from)} → ${name(pick.to)}`}
        </strong>
        {pick.via.length > 0 && (
          <span className="muted small">
            {' '}
            {text.via(pick.via.map(name).join(', '))}
          </span>
        )}
      </p>
      {search.routes.length > 1 && (
        <div className="button-row" role="radiogroup" aria-label={text.options}>
          {search.routes.map((_, index) => (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={index === pick.choice}
              className={`button button--small${index === pick.choice ? ' button--active' : ''}`}
              onClick={() => chooseAlternative(index)}
            >
              {text.option(index + 1)}
            </button>
          ))}
        </div>
      )}
      {search.routes.length > 1 && <p className="muted small">{text.tie}</p>}
      <p className="muted small">
        {text.summary(
          plan.turnouts.length,
          plan.areas.map((a) => a.name),
        )}
      </p>
      {startLevel < 2 && <p className="route-warning">{text.startLevel1}</p>}
      {higher && <p className="route-warning">{text.levelNotAvailable}</p>}
      {startLevel === 2 && level1.length > 0 && (
        // MIX-4: allowed, with a warning before setting.
        <p className="route-warning">
          {text.level1Warning(level1.map((a) => a.name).join(', '))}
        </p>
      )}
      {manual.length > 0 && (
        <p className="route-warning">
          {text.manualList(
            manual
              .map(
                (t) =>
                  `${name(t.turnoutId)}: ${strings.positions[t.position] ?? t.position}`,
              )
              .join(', '),
          )}
        </p>
      )}
      {cancels.length > 0 && (
        <p className="route-warning">
          {text.cancels(cancels.map((c) => routeName(c.routeId)).join(', '))}
        </p>
      )}
      {crosses.length > 0 && (
        <p className="route-warning">
          {text.crosses(
            crosses.map((c) => routeName(c.routeId)).join(', '),
            [...new Set(crosses.flatMap((c) => c.elementIds))]
              .map(name)
              .join(', '),
          )}
        </p>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={!canSet}
          onClick={() =>
            crosses.length > 0 ? setConfirming(plan.key) : setRoute()
          }
        >
          {text.set}
        </button>
        <Cancel />
        {!readOnly && !saved && saveName === null && (
          <button
            type="button"
            className="button button--small"
            onClick={() => setSaveName('')}
          >
            {text.save}
          </button>
        )}
      </div>
      {saveName !== null && (
        <form
          className="button-row"
          onSubmit={(event) => {
            event.preventDefault();
            const routeName = saveName.trim();
            if (!routeName) {
              return;
            }
            edit((p) => ({
              ...p,
              routes: [
                ...p.routes,
                {
                  id: newId('route'),
                  name: routeName.slice(0, 100),
                  from: pick.from!,
                  to: pick.to!,
                  via: pick.via,
                },
              ],
            }));
            setSaveName(null);
          }}
        >
          <label className="field">
            <span>{text.saveName}</span>
            <input
              type="text"
              value={saveName}
              maxLength={100}
              autoFocus
              onChange={(event) => setSaveName(event.target.value)}
            />
          </label>
          <button type="submit" className="button button--small">
            {text.saveConfirm}
          </button>
        </form>
      )}
    </>
  );
};

const Cancel = () => (
  <button type="button" className="button" onClick={stopPicking}>
    {strings.modes.cancel}
  </button>
);

const ActiveRoute = ({
  route,
  name,
}: {
  route: RouteLive;
  name: (id: string) => string;
}) => {
  const state =
    route.state === 'failed' && route.failedTurnoutId
      ? text.states.failed(name(route.failedTurnoutId))
      : route.state === 'broken' && route.brokenTurnoutId
        ? text.states.broken(name(route.brokenTurnoutId))
        : text.states[route.state as 'setting' | 'set'];
  return (
    <div className="route-row">
      <strong>
        {name(route.from)} → {name(route.to)}
      </strong>
      <span className="small">{state}</span>
      {route.manualToSet.length > 0 && route.state !== 'broken' && (
        <span className="small">
          {text.manualToSet(
            route.manualToSet
              .map((id) => {
                const turnout = route.turnouts.find((t) => t.turnoutId === id);
                return `${name(id)}: ${strings.positions[turnout?.position ?? ''] ?? turnout?.position}`;
              })
              .join(', '),
          )}
        </span>
      )}
      {route.state === 'set' || route.state === 'broken' ? (
        <button
          type="button"
          className="button button--small"
          onClick={() => sendCommand({type: 'releaseRoute', routeId: route.id})}
        >
          {text.release}
        </button>
      ) : (
        <button
          type="button"
          className="button button--small"
          onClick={() => sendCommand({type: 'cancelRoute', routeId: route.id})}
        >
          {text.cancelRoute}
        </button>
      )}
    </div>
  );
};
