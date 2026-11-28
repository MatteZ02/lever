// Choosing a route in this window (RTE-1): the operator clicks a start and
// an end (signal, turnout, route point or exit), in any view; the preview
// and its alternatives are worked out here, the route itself is set by the
// engine.
import {useMemo} from 'react';
import {create} from 'zustand';
import {Project} from '../../../model/project';
import {findRoutes, RouteSearch} from '../../../model/routing';

export type RoutePick = {
  from?: string;
  to?: string;
  via: string[];
  // Which of several equally good routes is shown (a tie, RTE-2).
  choice: number;
  // Started from a saved route (its name is shown).
  savedRouteId?: string;
};

type RouteStore = {
  pick: RoutePick | null;
  // The traffic strip shows its details (saved routes, trains).
  panelOpen: boolean;
};

export const useRouteStore = create<RouteStore>()(() => ({
  pick: null,
  panelOpen: false,
}));

const set = useRouteStore.setState;
const get = useRouteStore.getState;

export const startPicking = (from?: string) =>
  set({pick: {from, via: [], choice: 0}});

export const stopPicking = () => set({pick: null});

export const setPanelOpen = (panelOpen: boolean) => set({panelOpen});

export const chooseAlternative = (choice: number) => {
  const pick = get().pick;
  if (pick) {
    set({pick: {...pick, choice}});
  }
};

// A clicked route point: the start, then the end. With start and end
// matching a saved route, its via points are used (RTE-3). A click after
// that starts a new route there.
export const pickPoint = (project: Project, elementId: string) => {
  const pick = get().pick;
  if (!pick || !pick.from || pick.to) {
    set({pick: {from: elementId, via: [], choice: 0}});
    return;
  }
  if (elementId === pick.from) {
    return;
  }
  const saved = project.routes.find(
    (route) => route.from === pick.from && route.to === elementId,
  );
  set({
    pick: {
      ...pick,
      to: elementId,
      via: saved?.via ?? [],
      savedRouteId: saved?.id,
      choice: 0,
    },
  });
};

// The end of the route being made (from the click menu): replaces an
// earlier end; a saved route with this start and end lends its via points
// when none were chosen.
export const setRouteEnd = (project: Project, elementId: string) => {
  const pick = get().pick;
  if (!pick?.from || elementId === pick.from) {
    return;
  }
  const saved =
    pick.via.length === 0
      ? project.routes.find(
          (route) => route.from === pick.from && route.to === elementId,
        )
      : undefined;
  set({
    pick: {
      ...pick,
      to: elementId,
      via: saved?.via ?? pick.via,
      savedRouteId: saved?.id,
      choice: 0,
    },
  });
};

// A point the route must pass, after those chosen before (RTE-3).
export const addVia = (elementId: string) => {
  const pick = get().pick;
  if (!pick?.from || pick.via.includes(elementId) || elementId === pick.from) {
    return;
  }
  set({
    pick: {
      ...pick,
      via: [...pick.via, elementId],
      savedRouteId: undefined,
      choice: 0,
    },
  });
};

// A saved route chosen from the list: shown as a preview to set.
export const pickSavedRoute = (route: Project['routes'][number]): void =>
  set({
    pick: {
      from: route.from,
      to: route.to,
      via: route.via,
      choice: 0,
      savedRouteId: route.id,
    },
  });

// The route(s) between the picked points, worked out again when the layout
// changes.
export const useRouteSearch = (
  project: Project | null,
  pick: RoutePick | null,
): RouteSearch | undefined => {
  const from = pick?.from;
  const to = pick?.to;
  const via = pick?.via;
  return useMemo(
    () =>
      project && from && to
        ? findRoutes(project, from, to, via ?? [])
        : undefined,
    [project, from, to, via],
  );
};
