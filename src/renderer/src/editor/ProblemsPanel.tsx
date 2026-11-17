// Validation problems (EDT-5). Clicking one selects its elements. Notes
// (normal situations such as manual turnouts) can be hidden.
import {useMemo, useState} from 'react';
import {Project} from '../../../model/project';
import {Problem, validateProject} from '../../../model/validation';
import {strings} from '../../../shared/strings';
import {revealElements} from './reveal';

const ICON = {error: '⛔', warning: '⚠', info: 'ⓘ'};

const message = (problem: Problem) =>
  (
    strings.validation[problem.code] as (
      p: Record<string, string | number>,
    ) => string
  )(problem.params);

export const useProblems = (project: Project) =>
  useMemo(() => validateProject(project), [project]);

export const ProblemsPanel = ({project}: {project: Project}) => {
  const problems = useProblems(project);
  const [showNotes, setShowNotes] = useState(true);
  const shown = problems.filter(
    (problem) => showNotes || problem.severity !== 'info',
  );
  const viewName = (id?: string) =>
    project.views.find((view) => view.id === id)?.name ?? '';

  return (
    <div className="problems">
      <label className="choice">
        <input
          type="checkbox"
          checked={showNotes}
          onChange={(event) => setShowNotes(event.target.checked)}
        />
        {strings.editor.showNotes}
      </label>
      {shown.length === 0 ? (
        <p className="muted">{strings.editor.noProblems}</p>
      ) : (
        <ul className="problem-list">
          {shown.map((problem) => (
            <li key={problem.key}>
              <button
                type="button"
                className={`problem problem--${problem.severity}`}
                onClick={() =>
                  revealElements(problem.viewId, problem.elementIds)
                }
              >
                <span aria-hidden>{ICON[problem.severity]}</span>
                <span className="visually-hidden">
                  {strings.validation.severity[problem.severity]}:{' '}
                </span>
                <span className="problem-text">{message(problem)}</span>
                <span className="muted">{viewName(problem.viewId)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
