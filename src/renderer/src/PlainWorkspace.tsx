// A plain station window (opened with "New window"): only
// the live diagram and the view/station picker. No editing, settings,
// drawers or track power buttons; always operating. Esc is STOP here too
// (main.tsx).
import {ViewCanvas} from './full/ViewCanvas';
import {OperateCanvas} from './operate/OperateCanvas';
import {TrafficBoard} from './operate/TrafficBoard';
import {TrafficStrip} from './operate/TrafficStrip';
import {useShownView} from './useShownView';
import {ViewTabs} from './ViewTabs';

export const PlainWorkspace = () => {
  const {project, view, fullView, traffic, arrangement} = useShownView({
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
          trafficShown={traffic}
        />
      </div>
      <div className="layout-main">
        <div className="canvas-area">
          {traffic ? (
            <TrafficBoard project={project} />
          ) : fullView && arrangement ? (
            <ViewCanvas
              project={project}
              arrangement={arrangement}
              editing={false}
            />
          ) : (
            view && <OperateCanvas project={project} view={view} />
          )}
        </div>
      </div>
      {!traffic && <TrafficStrip project={project} />}
    </div>
  );
};
