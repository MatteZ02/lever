// Automation areas and their levels (MIX-2, MIX-3). The operator can change
// a level from operating mode, without the edit password. Lowering a level
// never moves turnouts or changes signals; its protection simply no longer
// applies (MIX-6). Raising one to Level 3 or 4 first checks the area: routes
// set here over occupied track are shown, and the change waits for the
// operator's confirmation.
import {useMemo, useState} from 'react';
import {AutomationLevel, Project} from '../../../model/project';
import {buildProjectTopology} from '../../../model/topology';
import {strings} from '../../../shared/strings';
import {describeElementId} from '../describe';
import {useEngineStore} from '../store/engineStore';
import {edit, useProjectStore} from '../store/projectStore';

const LEVELS: AutomationLevel[] = [1, 2, 3, 4];

export const setAreaLevel = (areaId: string, level: AutomationLevel) =>
  edit((p) => ({
    ...p,
    areas: p.areas.map((area) =>
      area.id === areaId ? {...area, level} : area,
    ),
  }));

export const AreasPanel = ({project}: {project: Project}) => {
  const readOnly = useProjectStore((state) => state.document?.readOnly ?? true);
  const routes = useEngineStore((state) => state.layout.routes);
  const blocks = useEngineStore((state) => state.layout.blocks);
  const topology = useMemo(() => buildProjectTopology(project), [project]);
  const [asking, setAsking] = useState<{
    areaId: string;
    level: AutomationLevel;
    routes: string[];
  } | null>(null);
  const viewOf = (areaId: string) =>
    project.views.find((view) => view.areaId === areaId);

  // Routes of this control station through the area over occupied track.
  const problemRoutes = (areaId: string): string[] =>
    Object.values(routes)
      .filter((route) => route.areas.some((area) => area.areaId === areaId))
      .filter((route) =>
        route.steps.some((step) => {
          const edge = topology.edgeById.get(step.edgeId);
          return (
            edge?.kind === 'track' &&
            edge.blockId !== undefined &&
            blocks[edge.blockId]?.occupied
          );
        }),
      )
      .map(
        (route) =>
          `${describeElementId(project, route.from)} → ${describeElementId(project, route.to)}`,
      );

  const choose = (
    areaId: string,
    current: AutomationLevel,
    level: AutomationLevel,
  ) => {
    if (current < 3 && level >= 3) {
      const found = problemRoutes(areaId);
      if (found.length > 0) {
        setAsking({areaId, level, routes: found});
        return;
      }
    }
    setAreaLevel(areaId, level);
  };

  return (
    <section className="panel" aria-labelledby="areas-title">
      <h2 id="areas-title">{strings.operate.areas}</h2>
      <p className="muted small">{strings.operate.areasHelp}</p>
      {readOnly && <p className="muted small">{strings.modes.readOnly}</p>}
      {asking && (
        <div className="route-warning">
          <p>
            <strong>
              {strings.operate.raiseLevel(
                project.areas.find((a) => a.id === asking.areaId)?.name ?? '',
                asking.level,
              )}
            </strong>
          </p>
          <p>{strings.operate.raiseProblems(asking.routes.join(', '))}</p>
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => {
                setAreaLevel(asking.areaId, asking.level);
                setAsking(null);
              }}
            >
              {strings.operate.raiseConfirm}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setAsking(null)}
            >
              {strings.operate.raiseBack}
            </button>
          </div>
        </div>
      )}
      <ul className="plain-list area-list">
        {project.areas.map((area) => (
          <li key={area.id} className="area-row">
            <span className={`level-badge level-badge--${area.level}`}>
              L{area.level}
            </span>
            <span className="area-name">
              {area.name}
              {viewOf(area.id) && (
                <small className="muted">
                  {' '}
                  · {strings.operate.stationDefault}
                </small>
              )}
            </span>
            <select
              aria-label={`${strings.properties.area}: ${area.name}`}
              value={String(area.level)}
              disabled={readOnly}
              onChange={(event) =>
                choose(
                  area.id,
                  area.level,
                  Number(event.target.value) as AutomationLevel,
                )
              }
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {strings.properties.level(level)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
};
