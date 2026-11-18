// A plain station window (opened with "New window", user 2026-11-18): only
// the live diagram and the station picker. No editing, settings, drawers or
// track power buttons; always operating. Esc is STOP here too (main.tsx).
import {strings} from '../../shared/strings';
import {FullLayoutCanvas} from './full/FullLayoutCanvas';
import {OperateCanvas} from './operate/OperateCanvas';
import {setActiveArrangement, setActiveView} from './store/projectStore';
import {useShownView} from './useShownView';

const ignore = () => undefined;

export const PlainWorkspace = () => {
  const {project, view, fullView, arrangement} = useShownView({
    fitStationsOnFirstShow: true,
  });
  if (!project) {
    return null;
  }
  return (
    <div className="workspace-layout plain-window">
      <div className="layout-bar">
        <div className="view-tabs" role="tablist">
          {project.views.length > 1 && arrangement && (
            <button
              type="button"
              role="tab"
              aria-selected={fullView}
              className={`view-tab${fullView ? ' view-tab--active' : ''}`}
              onClick={() => setActiveArrangement(arrangement.id)}
            >
              {strings.full.tab}
            </button>
          )}
          {project.views.map((candidate) => {
            const active = !fullView && candidate.id === view?.id;
            return (
              <button
                key={candidate.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`view-tab${active ? ' view-tab--active' : ''}`}
                onClick={() => setActiveView(candidate.id)}
              >
                {candidate.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="layout-main">
        <div className="canvas-area">
          {fullView && arrangement ? (
            <FullLayoutCanvas
              project={project}
              arrangement={arrangement}
              editing={false}
              selectedPanel={null}
              onSelectPanel={ignore}
              onMovePanel={ignore}
            />
          ) : (
            view && <OperateCanvas project={project} view={view} />
          )}
        </div>
      </div>
    </div>
  );
};
