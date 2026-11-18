// What a window shows: a station, or an arrangement of the full layout view.
// Shared by the main window and plain station windows. Tells the engine
// which stations are on screen (position refresh), tells the main process
// what the window shows (reopened there next time), sets the window title,
// and fits a view to the window the first time it is shown.
import {useCallback, useEffect, useMemo} from 'react';
import {arrangementsOf} from '../../model/arrangement';
import {strings} from '../../shared/strings';
import {formatWindowTarget, WindowTarget} from '../../shared/windowTarget';
import {fitViewport} from './diagram/DiagramView';
import {fitArrangement} from './full/FullLayoutCanvas';
import {sendCommand} from './store/engineStore';
import {
  activeView,
  FULL_VIEW,
  fullViewportKey,
  setViewport,
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
  const fullView = activeViewId === FULL_VIEW;
  // Arrangements of the full view (FULL-5); a default one until saved.
  const arrangements = useMemo(
    () => (project ? arrangementsOf(project, strings.full.defaultName) : []),
    [project],
  );
  const arrangement =
    arrangements.find((a) => a.id === activeArrangementId) ?? arrangements[0];

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

  // The engine refreshes the positions of what is on screen.
  const shownViews = fullView
    ? (arrangement?.panels.map((panel) => panel.viewId).join(',') ?? '')
    : (view?.id ?? '');
  useEffect(() => {
    sendCommand({
      type: 'showViews',
      viewIds: shownViews ? shownViews.split(',') : [],
    });
  }, [shownViews]);

  const target: WindowTarget | undefined =
    fullView && arrangement
      ? {kind: 'full', arrangementId: arrangement.id}
      : view
        ? {kind: 'view', viewId: view.id}
        : undefined;
  const targetText = target ? formatWindowTarget(target) : '';
  const shownName = fullView ? arrangement?.name : view?.name;
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

  return {project, view, fullView, arrangement, arrangements, fit, targetText};
};
