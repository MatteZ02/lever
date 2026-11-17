// Editor keyboard shortcuts (EDT-3). Only in edit mode and never while typing
// in a field. Esc is not used: it is STOP everywhere (CARRY-2). Undo is not
// available in operating mode (RTE-6b).
import {useEffect} from 'react';
import {
  addElements,
  cloneForPaste,
  deleteElements,
  insertTurnout,
  rotateElements,
} from '../../../model/editing';
import {GridPoint} from '../../../model/geometry';
import {isTypingTarget} from '../safety/shortcuts';
import {
  activeView,
  copySelection,
  edit,
  redo,
  select,
  setTool,
  undo,
  useProjectStore,
} from '../store/projectStore';
import {finishTrack} from './EditorCanvas';

type Options = {
  drawing: GridPoint[];
  setDrawing: (points: GridPoint[]) => void;
  rotatePlacement: () => void;
  fit: () => void;
};

let pasteCount = 0;

export const useEditorKeys = ({
  drawing,
  setDrawing,
  rotatePlacement,
  fit,
}: Options) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = useProjectStore.getState();
      if (
        state.mode !== 'edit' ||
        isTypingTarget(event.target) ||
        event.key === 'Escape'
      ) {
        return;
      }
      const view = activeView();
      if (!view) {
        return;
      }
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const handled = () => event.preventDefault();

      if (ctrl && key === 'z' && !event.shiftKey) {
        handled();
        undo();
      } else if (ctrl && (key === 'y' || (key === 'z' && event.shiftKey))) {
        handled();
        redo();
      } else if (ctrl && key === 'c') {
        handled();
        copySelection();
        pasteCount = 0;
      } else if (ctrl && key === 'x') {
        handled();
        copySelection();
        pasteCount = -1;
        edit((p) => deleteElements(p, state.selection));
        select([]);
      } else if (ctrl && key === 'v') {
        handled();
        if (state.clipboard.length === 0) {
          return;
        }
        pasteCount++;
        const offset = 2 * Math.max(0, pasteCount);
        const copies = cloneForPaste(state.clipboard, {x: offset, y: offset});
        edit((p) =>
          copies.reduce(
            (project, element) =>
              element.kind === 'turnout'
                ? insertTurnout(project, view.id, element)
                : addElements(project, view.id, [element]),
            p,
          ),
        );
        select(copies.map((element) => element.id));
      } else if (ctrl && key === 'a') {
        handled();
        select(view.elements.map((element) => element.id));
      } else if (state.testMode || ctrl || event.altKey) {
        return;
      } else if (key === 'delete' || key === 'backspace') {
        handled();
        if (state.tool.kind === 'track' && drawing.length > 0) {
          setDrawing(drawing.slice(0, -1));
        } else if (state.selection.length > 0) {
          edit((p) => deleteElements(p, state.selection));
          select([]);
        }
      } else if (key === 'r') {
        handled();
        if (state.tool.kind === 'place') {
          rotatePlacement();
        } else if (state.selection.length > 0) {
          edit((p) => rotateElements(p, view.id, state.selection));
        }
      } else if (key === 'enter' && state.tool.kind === 'track') {
        handled();
        finishTrack(view.id, drawing);
        setDrawing([]);
      } else if (key === 'v') {
        setTool({kind: 'select'});
      } else if (key === 't') {
        setTool({kind: 'track'});
      } else if (key === 'f') {
        fit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawing, setDrawing, rotatePlacement, fit]);
};
