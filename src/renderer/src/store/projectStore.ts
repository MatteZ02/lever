// The renderer's working copy of the project, with undo/redo, selection and
// editor state. The main process owns the document and saves it; every edit
// here is sent there (validated, autosaved) and kept in the undo history.
import {create} from 'zustand';
import {DiagramElement} from '../../../model/elements';
import {Project} from '../../../model/project';
import {ProjectState} from '../../../shared/projectApi';

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

// Identifies this window to the main process (ProjectState.editedBy).
export const CLIENT_ID = `window-${Math.random().toString(36).slice(2, 10)}`;

type ProjectStore = {
  // From the main process; null until loaded.
  document: ProjectState | null;
  // The project as edited here; same as document.project except while an
  // edit is on its way to the main process.
  project: Project | null;
  past: Project[];
  future: Project[];
  mode: Mode;
  testMode: boolean;
  activeViewId: string | null;
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
  past: [],
  future: [],
  mode: 'operate',
  testMode: false,
  activeViewId: null,
  selection: [],
  tool: {kind: 'select'},
  clipboard: [],
  viewports: {},
  hint: null,
}));

const get = useProjectStore.getState;
const set = useProjectStore.setState;

export const activeView = () => {
  const {project, activeViewId} = get();
  return (
    project?.views.find((view) => view.id === activeViewId) ?? project?.views[0]
  );
};

const send = (project: Project) => {
  void window.lever.project.update(project, CLIENT_ID).then((result) => {
    if ('error' in result) {
      console.error('Project update refused:', result.error);
      set({hint: result.error});
    }
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
  set((state) => ({
    project: next,
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

export const setMode = (mode: Mode) =>
  set({mode, testMode: false, tool: {kind: 'select'}, selection: []});

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

// Keeps the store in sync with the main process. Call once.
export const bindProjectStore = (): (() => void) => {
  const apply = (state: ProjectState) => {
    const current = get();
    const fromElsewhere =
      state.origin === 'file' ||
      (state.origin === 'edit' && state.editedBy !== CLIENT_ID);
    const firstLoad = current.document === null;
    if (firstLoad || fromElsewhere) {
      const sameProject = current.project?.id === state.project.id;
      set({
        document: state,
        project: state.project,
        // A different file: its own history. The same project changed by a
        // file action (restore) or another window: keep undo, it still works
        // on whole projects.
        past: sameProject ? current.past : [],
        future: sameProject ? current.future : [],
        activeViewId: state.project.views.some(
          (view) => view.id === current.activeViewId,
        )
          ? current.activeViewId
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
