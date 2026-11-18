// Automation areas and their levels (MIX-2, MIX-3). The operator can change
// a level from operating mode, without the edit password. Lowering a level
// never moves turnouts or changes signals (MIX-6); Levels 3 and 4 are not
// built yet.
import {AutomationLevel, Project} from '../../../model/project';
import {strings} from '../../../shared/strings';
import {edit, useProjectStore} from '../store/projectStore';

const AVAILABLE: AutomationLevel[] = [1, 2];

export const setAreaLevel = (areaId: string, level: AutomationLevel) =>
  edit((p) => ({
    ...p,
    areas: p.areas.map((area) =>
      area.id === areaId ? {...area, level} : area,
    ),
  }));

export const AreasPanel = ({project}: {project: Project}) => {
  const readOnly = useProjectStore((state) => state.document?.readOnly ?? true);
  const viewOf = (areaId: string) =>
    project.views.find((view) => view.areaId === areaId);
  return (
    <section className="panel" aria-labelledby="areas-title">
      <h2 id="areas-title">{strings.operate.areas}</h2>
      <p className="muted small">{strings.operate.areasHelp}</p>
      {readOnly && <p className="muted small">{strings.modes.readOnly}</p>}
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
                setAreaLevel(
                  area.id,
                  Number(event.target.value) as AutomationLevel,
                )
              }
            >
              {AVAILABLE.map((level) => (
                <option key={level} value={level}>
                  {strings.properties.level(level)}
                </option>
              ))}
              {[3, 4].map((level) => (
                <option key={level} value={level} disabled>
                  {strings.operate.levelLater(level)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
};
