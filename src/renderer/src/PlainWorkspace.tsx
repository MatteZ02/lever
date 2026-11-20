// A plain station window (opened with "New window"): only
// the live diagram and the view/station picker. No editing, settings,
// drawers or track power buttons; always operating. Esc is STOP here too
// (main.tsx).
import {ViewCanvas} from './full/ViewCanvas';
import {OperateCanvas} from './operate/OperateCanvas';
import {RoutePanel} from './operate/RoutePanel';
import {useShownView} from './useShownView';
import {ViewTabs} from './ViewTabs';

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
        <ViewTabs
          project={project}
          shownArrangementId={arrangement?.id}
          shownViewId={fullView ? undefined : view?.id}
        />
      </div>
      <div className="layout-main">
        <div className="canvas-area">
          {fullView && arrangement ? (
            <ViewCanvas
              project={project}
              arrangement={arrangement}
              editing={false}
            />
          ) : (
            view && <OperateCanvas project={project} view={view} />
          )}
          <RoutePanel project={project} />
        </div>
      </div>
    </div>
  );
};
