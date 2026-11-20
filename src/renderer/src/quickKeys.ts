// What the quick keys do besides STOP and track power (main.tsx).
import {arrangementsOf} from '../../model/arrangement';
import {
  setActiveArrangement,
  setActiveView,
  useProjectStore,
} from './store/projectStore';
import {startPicking} from './store/routeStore';

// Asks the window's diagram to fit itself (useShownView listens).
export const FIT_EVENT = 'lever:fit';
export const requestFit = () => window.dispatchEvent(new Event(FIT_EVENT));

// A new route, as the "New route" button: only while operating, and only
// where routes exist (Level 2 areas).
export const startNewRoute = () => {
  const {project, mode} = useProjectStore.getState();
  if (
    mode === 'operate' &&
    project?.areas.some((area) => area.level >= 2) === true
  ) {
    startPicking();
  }
};

// The n-th tab from the left (0 = first): the views, then the stations.
// False if there is none.
export const switchToTab = (index: number): boolean => {
  const {project} = useProjectStore.getState();
  if (!project) {
    return false;
  }
  const tabs = [
    ...arrangementsOf(project).map((a) => () => setActiveArrangement(a.id)),
    ...project.views.map((v) => () => setActiveView(v.id)),
  ];
  const open = tabs[index];
  open?.();
  return open !== undefined;
};
