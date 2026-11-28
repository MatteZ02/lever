// The renderer's working copy of the project, with undo/redo, selection and
// editor state. The main process owns the document and saves it; every edit
// here is sent there (validated, autosaved) and kept in the undo history.
import {create} from 'zustand';
import {DiagramElement} from '../../../model/elements';
import {Project, projectSchema} from '../../../model/project';
import {ProjectState} from '../../../shared/projectApi';
import {strings} from '../../../shared/strings';
import {parseWindowHash} from '../../../shared/windowTarget';

export const UNDO_LIMIT = 100;

export type Mode = 'operate' | 'edit';

export type Tool =
  | {kind: 'select'}
  | {kind: 'track'}
  | {kind: 'place'; element: PlaceableKind; turnoutType?: string};

export type PlaceableKind =
  | 'turnout'
  | 'signal'
  | 'bufferStop'
  | 'virtualPoint'
  | 'connector'
  | 'accessory'
  | 'label'
  | 'platform';

export type Viewport = {
  // Grid units at the top-left corner, and pixels per grid unit.
  x: number;
  y: number;
  scale: number;
};

export const DEFAULT_VIEWPORT: Viewport = {x: -2, y: -2, scale: 24};

// activeViewId while a layout view (FULL-1) is shown; which one is
// activeArrangementId.
export const FULL_VIEW = '__full';
// activeViewId while the traffic view (routes and trains) is shown.
export const TRAFFIC_VIEW = '__traffic';

// Viewport key of a layout view.
export const fullViewportKey = (arrangementId: string) =>
  `full:${arrangementId}`;

// Identifies this window to the main process (ProjectState.editedBy).
export const CLIENT_ID = `window-${Math.random().toString(36).slice(2, 10)}`;

type ProjectStore = {
  // From the main process; null until loaded.
  document: ProjectState | null;
  // The project as edited here; same as document.project except while an
  // edit is on its way to the main process.
  project: Project | null;
  // Counts every change of the project (edit, undo, redo, from elsewhere).
  // Undo can bring back the very same object, so identity is not enough.
  revision: number;
  past: Project[];
  future: Project[];
  mode: Mode;
  testMode: boolean;
  activeViewId: string | null;
  // Which layout view is shown (null: the first).
  activeArrangementId: string | null;
  selection: string[];
  tool: Tool;
  clipboard: DiagramElement[];
  viewports: Record<string, Viewport>;
  // Short message for the operator (e.g. "Not a 45° step"), cleared on the
  // next edit.
  hint: string | null;
};

export const useProjectStore = create<ProjectStore>()(() => ({
  document: null,
  project: null,
  revision: 0,
  past: [],
  future: [],
  mode: 'operate',
  testMode: false,
  activeViewId: null,
  activeArrangementId: null,
  selection: [],
  tool: {kind: 'select'},
  clipboard: [],
  viewports: {},
  hint: null,
}));

const get = useProjectStore.getState;
const set = useProjectStore.setState;

// The station shown; undefined while a layout view is shown (if there is
// none any more, the first station).
export const activeView = () => {
  const {project, activeViewId} = get();
  if (activeViewId === FULL_VIEW && (project?.arrangements.length ?? 0) > 0) {
    return undefined;
  }
  if (activeViewId === TRAFFIC_VIEW) {
    return undefined;
  }
  return (
    project?.views.find((view) => view.id === activeViewId) ?? project?.views[0]
  );
};

export const isFullView = () => get().activeViewId === FULL_VIEW;

export const setTrafficView = () =>
  set({activeViewId: TRAFFIC_VIEW, selection: []});

export const setActiveArrangement = (arrangementId: string) =>
  set({
    activeViewId: FULL_VIEW,
    activeArrangementId: arrangementId,
    selection: [],
  });

// A change the main process refused is not kept: the window goes back to
// the last accepted project, so it never shows (or builds on) a layout that
// is not saved.
const send = (project: Project) => {
  void window.lever.project.update(project, CLIENT_ID).then((result) => {
    if (!('error' in result)) {
      return;
    }
    const accepted = get().document?.project;
    set((state) => ({
      hint:
        result.error === 'readOnly'
          ? strings.editor.changeReadOnly
          : strings.editor.changeNotSaved,
      ...(accepted && state.project === project
        ? {
            project: accepted,
            revision: state.revision + 1,
            past: state.past.filter((p) => p !== project),
          }
        : {}),
    }));
  });
};

// Applies an edit: kept for undo, sent to the main process.
export const edit = (change: (project: Project) => Project): void => {
  const {project, document} = get();
  if (!project || document?.readOnly) {
    return;
  }
  const next = change(project);
  if (next === project) {
    return;
  }
  // Caught here, before it is shown: an edit that would make the layout
  // invalid (a bug in an editing tool) is dropped with a short message.
  const checked = projectSchema.safeParse(next);
  if (!checked.success) {
    console.error('Edit refused, invalid layout:', checked.error.issues);
    set({hint: strings.editor.changeNotSaved});
    return;
  }
  set((state) => ({
    project: next,
    revision: state.revision + 1,
    past: [...state.past, project].slice(-UNDO_LIMIT),
    future: [],
    hint: null,
  }));
  send(next);
};

export const undo = (): void => {
  const {past, project} = get();
  const previous = past[past.length - 1];
  if (!previous || !project) {
    return;
  }
  set((state) => ({
    project: previous,
    revision: state.revision + 1,
    past: state.past.slice(0, -1),
    future: [project, ...state.future],
    selection: keepExisting(previous, state.selection),
  }));
  send(previous);
};

export const redo = (): void => {
  const {future, project} = get();
  const next = future[0];
  if (!next || !project) {
    return;
  }
  set((state) => ({
    project: next,
    revision: state.revision + 1,
    past: [...state.past, project],
    future: state.future.slice(1),
    selection: keepExisting(next, state.selection),
  }));
  send(next);
};

const keepExisting = (project: Project, ids: string[]) => {
  const all = new Set(
    project.views.flatMap((view) => view.elements.map((e) => e.id)),
  );
  return ids.filter((id) => all.has(id));
};

export const select = (ids: string[]) => set({selection: ids});

export const setTool = (tool: Tool) =>
  set({tool, selection: tool.kind === 'select' ? get().selection : []});

export const setHint = (hint: string | null) => set({hint});

export const setActiveView = (viewId: string) =>
  set({activeViewId: viewId, selection: []});

export const setViewport = (viewId: string, viewport: Viewport) =>
  set((state) => ({viewports: {...state.viewports, [viewId]: viewport}}));

// The traffic view has nothing to edit: editing starts on the first station.
export const setMode = (mode: Mode) =>
  set({
    mode,
    testMode: false,
    tool: {kind: 'select'},
    selection: [],
    ...(mode === 'edit' && get().activeViewId === TRAFFIC_VIEW
      ? {activeViewId: get().project?.views[0]?.id ?? null}
      : {}),
  });

export const setTestMode = (testMode: boolean) => set({testMode});

export const copySelection = (): void => {
  const view = activeView();
  const {selection} = get();
  if (view) {
    set({
      clipboard: view.elements.filter((element) =>
        selection.includes(element.id),
      ),
    });
  }
};

// What a window opened with "Open in new window" shows first (VIEW-2).
const windowHash = () =>
  parseWindowHash(decodeURIComponent(window.location.hash.slice(1)));
const initialTarget = () => windowHash().target;

// A plain station window: only the diagram and the station picker, always
// operating (opened with "New window").
export const isPlainWindow = (): boolean => windowHash().plain;

// Keeps the store in sync with the main process. Call once.
export const bindProjectStore = (): (() => void) => {
  const apply = (state: ProjectState) => {
    const current = get();
    if (current.document === null) {
      const target = initialTarget();
      if (
        target?.kind === 'view' &&
        state.project.views.some((view) => view.id === target.viewId)
      ) {
        set({activeViewId: target.viewId});
      } else if (target?.kind === 'full') {
        set({
          activeViewId: FULL_VIEW,
          activeArrangementId: target.arrangementId,
        });
      } else if (target?.kind === 'traffic') {
        set({activeViewId: TRAFFIC_VIEW});
      }
    }
    const fromElsewhere =
      state.origin === 'file' ||
      (state.origin === 'edit' && state.editedBy !== CLIENT_ID);
    const firstLoad = current.document === null;
    if (firstLoad || fromElsewhere) {
      const sameProject = current.project?.id === state.project.id;
      set({
        document: state,
        project: state.project,
        revision: current.revision + 1,
        // A different file: its own history. The same project changed by a
        // file action (restore) or another window: keep undo, it still works
        // on whole projects.
        past: sameProject ? current.past : [],
        future: sameProject ? current.future : [],
        activeViewId:
          get().activeViewId === FULL_VIEW ||
          get().activeViewId === TRAFFIC_VIEW ||
          state.project.views.some((view) => view.id === get().activeViewId)
            ? get().activeViewId
            : (state.project.views[0]?.id ?? null),
        selection: keepExisting(state.project, current.selection),
        mode: state.readOnly ? 'operate' : current.mode,
      });
    } else {
      set({document: state});
    }
  };
  void window.lever.project.get().then(apply);
  return window.lever.project.onChange(apply);
};
