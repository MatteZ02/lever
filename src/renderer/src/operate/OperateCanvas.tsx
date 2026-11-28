// Operating mode for one station view: the live diagram. Clicks are handled
// by useOperateActions, with generous hit areas (hitTest.ts); dragging empty
// space pans. Clicking a paired station
// exit goes to the station it leads to.
import {useMemo} from 'react';
import {partnerOf} from '../../../model/connectors';
import {StationConnector} from '../../../model/elements';
import {Project, StationView} from '../../../model/project';
import {AreaBoundaries} from '../diagram/AreaBoundaries';
import {DiagramView} from '../diagram/DiagramView';
import {RouteOverlay} from '../diagram/RouteOverlay';
import {
  DEFAULT_VIEWPORT,
  setActiveView,
  setViewport,
  useProjectStore,
} from '../store/projectStore';
import {buildDisplays} from './displays';
import {elementAt} from './hitTest';
import {useOperateActions} from './useOperateActions';

export const OperateCanvas = ({
  project,
  view,
}: {
  project: Project;
  view: StationView;
}) => {
  const viewport = useProjectStore(
    (state) => state.viewports[view.id] ?? DEFAULT_VIEWPORT,
  );
  const followExit = (connector: StationConnector) => {
    const partner = partnerOf(project, connector);
    if (!partner) {
      return;
    }
    // Show the other station with its entry where this exit was.
    const current = useProjectStore.getState().viewports[view.id] ?? viewport;
    const there = partner.connector.at;
    setViewport(partner.viewId, {
      scale: current.scale,
      x: there.x - (connector.at.x - current.x),
      y: there.y - (connector.at.y - current.y),
    });
    setActiveView(partner.viewId);
  };
  const {click, clickable, popups, layout} = useOperateActions(
    project,
    followExit,
  );
  const displays = useMemo(
    () => buildDisplays(project, view, layout),
    [project, view, layout],
  );

  return (
    <>
      <DiagramView
        className="diagram"
        project={project}
        view={view}
        viewport={viewport}
        onViewportChange={(next) => setViewport(view.id, next)}
        displays={displays}
        panOnEmpty
        onPointerUp={(pointer) => {
          if (!pointer.moved) {
            click(elementAt(view.elements, pointer, clickable), pointer);
          }
        }}
      >
        <AreaBoundaries project={project} view={view} />
        <RouteOverlay project={project} viewId={view.id} />
      </DiagramView>
      {popups}
    </>
  );
};
