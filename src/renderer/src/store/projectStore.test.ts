// Given an edit that is invalid or refused by the main process, when it is
// made, then the window keeps (or goes back to) the saved layout and shows a
// short message, so later edits still work.
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {track} from '../../../model/__tests__/testLayouts';
import {createProject, Project} from '../../../model/project';
import {strings} from '../../../shared/strings';
import {edit, useProjectStore} from './projectStore';

let reply: {revision: number} | {error: string};
const update = vi.fn(() => Promise.resolve(reply));

beforeEach(() => {
  (globalThis as unknown as {window: unknown}).window = {
    lever: {project: {update}},
  };
  update.mockClear();
  reply = {revision: 2};
  const project = createProject('Test');
  useProjectStore.setState({
    project,
    revision: 1,
    past: [],
    future: [],
    hint: null,
    document: {
      revision: 1,
      path: null,
      project,
      readOnly: false,
      unsaved: false,
      origin: 'file',
    },
  });
});

const addTrack = (x: number) => (p: Project) => ({
  ...p,
  views: p.views.map((view) => ({
    ...view,
    elements: [...view.elements, track('t', [0, 0], [x, 0])],
  })),
});

describe('edits the layout would not accept', () => {
  it('an edit with an off-grid point is not applied or sent', () => {
    const before = useProjectStore.getState().project;
    edit(addTrack(5.2));
    expect(useProjectStore.getState().project).toBe(before);
    expect(useProjectStore.getState().hint).toBe(strings.editor.changeNotSaved);
    expect(update).not.toHaveBeenCalled();
  });

  it('an edit the main process refuses is undone in the window', async () => {
    reply = {error: 'invalid'};
    const saved = useProjectStore.getState().document!.project;
    edit(addTrack(5));
    expect(useProjectStore.getState().project?.views[0].elements).toHaveLength(
      1,
    );
    await vi.waitFor(() =>
      expect(useProjectStore.getState().project).toBe(saved),
    );
    expect(useProjectStore.getState().hint).toBe(strings.editor.changeNotSaved);
  });

  it('a valid edit is kept and sent', async () => {
    edit(addTrack(5));
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState().project?.views[0].elements).toHaveLength(
      1,
    );
    expect(useProjectStore.getState().hint).toBeNull();
  });
});
