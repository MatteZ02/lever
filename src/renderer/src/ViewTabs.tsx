// Tabs of the layout views and the stations, shared by the main window and
// plain station windows. In edit mode, "+ View" adds an empty view.
import {ReactNode} from 'react';
import {arrangementsOf, createArrangement} from '../../model/arrangement';
import {Project} from '../../model/project';
import {strings} from '../../shared/strings';
import {edit, setActiveArrangement, setActiveView} from './store/projectStore';

export const ViewTabs = ({
  project,
  shownArrangementId,
  shownViewId,
  editing = false,
  onSwitch,
  children,
}: {
  project: Project;
  // The view or station shown (one of them).
  shownArrangementId?: string;
  shownViewId?: string;
  editing?: boolean;
  onSwitch?: () => void;
  // More tabs after the stations (e.g. "+ Add station").
  children?: ReactNode;
}) => {
  const arrangements = arrangementsOf(project);
  return (
    <div
      className="view-tabs"
      role="tablist"
      aria-label={strings.full.tabsLabel}
    >
      {arrangements.map((arrangement) => {
        const active = arrangement.id === shownArrangementId;
        return (
          <button
            key={arrangement.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`view-tab view-tab--layout${active ? ' view-tab--active' : ''}`}
            onClick={() => {
              onSwitch?.();
              setActiveArrangement(arrangement.id);
            }}
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
      {project.views.map((candidate) => {
        const active = candidate.id === shownViewId;
        return (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`view-tab${active ? ' view-tab--active' : ''}`}
            onClick={() => {
              onSwitch?.();
              setActiveView(candidate.id);
            }}
          >
            {candidate.name}
          </button>
        );
      })}
      {children}
    </div>
  );
};
