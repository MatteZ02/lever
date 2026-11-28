// What a window shows: a station, or a layout view.
// Shared by the main window and plain station windows. Tells the engine
// which stations are on screen (position refresh), tells the main process
// what the window shows (reopened there next time), sets the window title,
// and fits a view to the window the first time it is shown.
import {useCallback, useEffect, useMemo} from 'react';
import {arrangementsOf} from '../../model/arrangement';
import {strings} from '../../shared/strings';
import {formatWindowTarget, WindowTarget} from '../../shared/windowTarget';
import {fitViewport} from './diagram/DiagramView';
import {fitArrangement} from './full/ViewCanvas';
import {FIT_EVENT} from './quickKeys';
import {sendCommand} from './store/engineStore';
import {
  activeView,
  FULL_VIEW,
  fullViewportKey,
  setViewport,
  TRAFFIC_VIEW,
  useProjectStore,
} from './store/projectStore';

const canvasSize = () => {
  const canvas = document.querySelector('.diagram');
  return {
    width: canvas?.clientWidth ?? 800,
    height: canvas?.clientHeight ?? 600,
  };
};

export const useShownView = ({
  fitStationsOnFirstShow = false,
}: {fitStationsOnFirstShow?: boolean} = {}) => {
  const project = useProjectStore((state) => state.project);
  const activeViewId = useProjectStore((state) => state.activeViewId);
  const activeArrangementId = useProjectStore(
    (state) => state.activeArrangementId,
  );
  const view = activeView();
  // The layout views (FULL-5); none until the user makes one.
  const arrangements = useMemo(
    () => (project ? arrangementsOf(project) : []),
    [project],
  );
  const arrangement =
    activeViewId === FULL_VIEW
      ? (arrangements.find((a) => a.id === activeArrangementId) ??
        arrangements[0])
      : undefined;
  // A view that is gone falls back to a station (activeView).
  const fullView = arrangement !== undefined;
  const traffic = activeViewId === TRAFFIC_VIEW;

  const fit = useCallback(() => {
    const current = activeView();
    if (current) {
      setViewport(current.id, fitViewport(current, canvasSize()));
    } else if (project && arrangement) {
      setViewport(
        fullViewportKey(arrangement.id),
        fitArrangement(project, arrangement, canvasSize()),
      );
    }
  }, [project, arrangement]);

  // The fit-to-view quick key.
  useEffect(() => {
    window.addEventListener(FIT_EVENT, fit);
    return () => window.removeEventListener(FIT_EVENT, fit);
  }, [fit]);

  // The engine refreshes the positions of what is on screen.
  const shownViews = fullView
    ? [...new Set(arrangement.frames.map((frame) => frame.viewId))].join(',')
    : (view?.id ?? '');
  useEffect(() => {
    sendCommand({
      type: 'showViews',
      viewIds: shownViews ? shownViews.split(',') : [],
    });
  }, [shownViews]);

  const target: WindowTarget | undefined = traffic
    ? {kind: 'traffic'}
    : fullView && arrangement
      ? {kind: 'full', arrangementId: arrangement.id}
      : view
        ? {kind: 'view', viewId: view.id}
        : undefined;
  const targetText = target ? formatWindowTarget(target) : '';
  const shownName = traffic
    ? strings.traffic.title
    : fullView
      ? arrangement?.name
      : view?.name;
  useEffect(() => {
    window.lever.window.setTarget(targetText);
  }, [targetText]);
  useEffect(() => {
    window.document.title = shownName
      ? `${shownName} – ${strings.appName}`
      : strings.appName;
  }, [shownName]);

  // Fit on first show: always for the full view; for stations if asked.
  const viewportKey = fullView
    ? arrangement
      ? fullViewportKey(arrangement.id)
      : ''
    : (view?.id ?? '');
  const viewportSet = useProjectStore(
    (state) => viewportKey in state.viewports,
  );
  const shouldFit =
    viewportKey !== '' && !viewportSet && (fullView || fitStationsOnFirstShow);
  useEffect(() => {
    if (shouldFit) {
      // After layout, so the canvas has its size.
      requestAnimationFrame(fit);
    }
  }, [shouldFit, fit]);

  return {
    project,
    view,
    fullView,
    traffic,
    arrangement,
    arrangements,
    fit,
    targetText,
  };
};
