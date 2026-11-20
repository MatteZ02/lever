// Edits of a layout view, shared by its canvas and properties panel.
import {
  deleteFrame,
  deleteLine,
  updateArrangement,
} from '../../../model/arrangement';
import {Arrangement} from '../../../model/project';
import {edit} from '../store/projectStore';

export type ViewTool =
  {kind: 'select'} | {kind: 'frame'; viewId: string} | {kind: 'line'};
export type ViewSelection = {kind: 'frame' | 'line'; id: string} | null;

export const changeArrangement = (
  arrangementId: string,
  change: (arrangement: Arrangement) => Arrangement,
) => edit((p) => updateArrangement(p, arrangementId, change));

// Deleting a frame also lets go of lines at its exits.
export const deleteSelection = (
  arrangementId: string,
  selection: NonNullable<ViewSelection>,
) =>
  changeArrangement(arrangementId, (a) =>
    selection.kind === 'frame'
      ? deleteFrame(a, selection.id)
      : deleteLine(a, selection.id),
  );
