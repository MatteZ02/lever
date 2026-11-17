// Shows elements found in a panel: switches to their station, selects them,
// and centres the view on them.
import {elementPoints} from '../../../model/editing';
import {boundsOf} from '../../../model/geometry';
import {
  DEFAULT_VIEWPORT,
  select,
  setActiveView,
  setViewport,
  useProjectStore,
} from '../store/projectStore';

export const revealElements = (
  viewId: string | undefined,
  ids: string[],
): void => {
  const {project, viewports} = useProjectStore.getState();
  const view = project?.views.find(
    (candidate) =>
      candidate.id === viewId ||
      (viewId === undefined &&
        candidate.elements.some((element) => ids.includes(element.id))),
  );
  if (!view) {
    return;
  }
  setActiveView(view.id);
  select(ids);
  const bounds = boundsOf(
    view.elements
      .filter((element) => ids.includes(element.id))
      .flatMap(elementPoints),
  );
  if (!bounds) {
    return;
  }
  const viewport = viewports[view.id] ?? DEFAULT_VIEWPORT;
  const canvas = document.querySelector('.diagram');
  const width = (canvas?.clientWidth ?? 800) / viewport.scale;
  const height = (canvas?.clientHeight ?? 600) / viewport.scale;
  setViewport(view.id, {
    ...viewport,
    x: (bounds.minX + bounds.maxX) / 2 - width / 2,
    y: (bounds.minY + bounds.maxY) / 2 - height / 2,
  });
};
