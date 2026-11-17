// Main window layout: layout bar (mode, project, stations, tools), the
// diagram, and in edit mode the toolbox, properties and problem/address
// panels. Settings, the accessory test panel and the protocol log open in a
// side drawer.
import {useCallback, useState} from 'react';
import {deleteElements, rotateElements} from '../../model/editing';
import {GridPoint} from '../../model/geometry';
import {createView} from '../../model/project';
import {strings} from '../../shared/strings';
import {DeveloperPanel} from './components/DeveloperPanel';
import {Modal} from './components/Modal';
import {ModeSwitch} from './components/ModeSwitch';
import {ProtocolLog} from './components/ProtocolLog';
import {SettingsPanel} from './components/SettingsPanel';
import {DiagramView, fitViewport} from './diagram/DiagramView';
import {AddressTable} from './editor/AddressTable';
import {EditorCanvas} from './editor/EditorCanvas';
import {ProblemsPanel, useProblems} from './editor/ProblemsPanel';
import {PropertiesPanel} from './editor/properties/PropertiesPanel';
import {Toolbox} from './editor/Toolbox';
import {useEditorKeys} from './editor/useEditorKeys';
import {
  activeView,
  DEFAULT_VIEWPORT,
  edit,
  redo,
  select,
  setActiveView,
  setHint,
  setTestMode,
  setViewport,
  undo,
  useProjectStore,
} from './store/projectStore';

type Drawer = 'settings' | 'developer' | 'log' | null;
type BottomPanel = 'problems' | 'addresses';

const canvasSize = () => {
  const canvas = document.querySelector('.diagram');
  return {
    width: canvas?.clientWidth ?? 800,
    height: canvas?.clientHeight ?? 600,
  };
};

export const Workspace = () => {
  const project = useProjectStore((state) => state.project);
  const document = useProjectStore((state) => state.document);
  const mode = useProjectStore((state) => state.mode);
  const testMode = useProjectStore((state) => state.testMode);
  const selection = useProjectStore((state) => state.selection);
  const hint = useProjectStore((state) => state.hint);
  const canUndo = useProjectStore((state) => state.past.length > 0);
  const canRedo = useProjectStore((state) => state.future.length > 0);
  useProjectStore((state) => state.activeViewId);
  const viewports = useProjectStore((state) => state.viewports);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [bottom, setBottom] = useState<BottomPanel>('problems');
  const [drawing, setDrawing] = useState<GridPoint[]>([]);
  const [placeRotation, setPlaceRotation] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const view = activeView();

  const fit = useCallback(() => {
    const current = activeView();
    if (current) {
      setViewport(current.id, fitViewport(current, canvasSize()));
    }
  }, []);
  const rotatePlacement = useCallback(() => setPlaceRotation((r) => r + 1), []);
  useEditorKeys({drawing, setDrawing, rotatePlacement, fit});

  const problems = useProblems(project ?? emptyProject);
  const warningCount = problems.filter((p) => p.severity !== 'info').length;

  if (!project || !document) {
    return null;
  }
  const editing = mode === 'edit';
  const saveStatus = document.unsaved
    ? document.path
      ? strings.editor.unsaved
      : strings.editor.notSavedYet
    : strings.editor.saved;

  return (
    <div
      className={`workspace-layout${editing ? ' workspace-layout--editing' : ''}`}
    >
      <div className="layout-bar">
        <ModeSwitch />
        {editing && (
          <span className="editing-badge">{strings.modes.editing}</span>
        )}
        <div className="project-title">
          <strong>{project.name}</strong>
          <span className="muted small">
            {document.readOnly ? strings.modes.readOnly : saveStatus}
            {document.migratedFrom !== undefined &&
              ` · ${strings.editor.migrated(document.migratedFrom)}`}
          </span>
        </div>
        <div className="view-tabs" role="tablist">
          {project.views.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={candidate.id === view?.id}
              className={`view-tab${candidate.id === view?.id ? ' view-tab--active' : ''}`}
              onClick={() => {
                setDrawing([]);
                setActiveView(candidate.id);
              }}
            >
              {candidate.name}
            </button>
          ))}
          {editing && (
            <button
              type="button"
              className="view-tab"
              onClick={() => {
                let created = '';
                edit((p) => {
                  const result = createView(p, strings.editor.newViewName);
                  created = result.viewId;
                  return result.project;
                });
                if (created) {
                  setActiveView(created);
                }
              }}
            >
              + {strings.editor.addView}
            </button>
          )}
        </div>
        <div className="bar-actions">
          {editing && (
            <>
              <button
                type="button"
                className="button"
                disabled={!canUndo}
                onClick={undo}
                title="Ctrl+Z"
              >
                {strings.editor.undo}
              </button>
              <button
                type="button"
                className="button"
                disabled={!canRedo}
                onClick={redo}
                title="Ctrl+Y"
              >
                {strings.editor.redo}
              </button>
              <button
                type="button"
                className="button"
                disabled={selection.length === 0 || !view}
                onClick={() =>
                  view && edit((p) => rotateElements(p, view.id, selection))
                }
              >
                {strings.editor.rotate}
              </button>
              <button
                type="button"
                className="button"
                disabled={selection.length === 0}
                onClick={() => {
                  edit((p) => deleteElements(p, selection));
                  select([]);
                }}
              >
                {strings.editor.delete}
              </button>
              <label className="choice test-toggle">
                <input
                  type="checkbox"
                  checked={testMode}
                  onChange={(event) => setTestMode(event.target.checked)}
                />
                {strings.editor.testMode}
              </label>
            </>
          )}
          <button type="button" className="button" onClick={fit} title="F">
            {strings.editor.fit}
          </button>
          {(['settings', 'developer', 'log'] as const).map((name) => (
            <button
              key={name}
              type="button"
              className={`button${drawer === name ? ' button--active' : ''}`}
              aria-pressed={drawer === name}
              onClick={() => setDrawer(drawer === name ? null : name)}
            >
              {name === 'settings'
                ? strings.settings.title
                : name === 'developer'
                  ? strings.developer.short
                  : strings.protocolLog.title}
            </button>
          ))}
        </div>
      </div>

      <div className="layout-main">
        {editing && <Toolbox />}
        <div className="canvas-area">
          {view &&
            (editing ? (
              <EditorCanvas
                project={project}
                view={view}
                placeRotation={placeRotation}
                drawing={drawing}
                onDrawingChange={setDrawing}
              />
            ) : (
              <DiagramView
                className="diagram"
                project={project}
                view={view}
                viewport={viewports[view.id] ?? DEFAULT_VIEWPORT}
                onViewportChange={(next) => setViewport(view.id, next)}
              />
            ))}
          {hint && (
            <div className="hint" role="status">
              <span>{hint}</span>
              <button
                type="button"
                className="button button--small"
                onClick={() => setHint(null)}
              >
                {strings.notices.dismiss}
              </button>
            </div>
          )}
        </div>
        {editing && <PropertiesPanel project={project} view={view} />}
        {drawer && (
          <div className="drawer">
            {drawer === 'settings' && <SettingsPanel />}
            {drawer === 'developer' && <DeveloperPanel />}
            {drawer === 'log' && <ProtocolLog />}
          </div>
        )}
      </div>

      {editing && (
        <div className="bottom-panel">
          <div className="bottom-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={bottom === 'problems'}
              className={`view-tab${bottom === 'problems' ? ' view-tab--active' : ''}`}
              onClick={() => setBottom('problems')}
            >
              {strings.editor.problems} ({warningCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={bottom === 'addresses'}
              className={`view-tab${bottom === 'addresses' ? ' view-tab--active' : ''}`}
              onClick={() => setBottom('addresses')}
            >
              {strings.editor.addresses}
            </button>
            {view && project.views.length > 1 && (
              <button
                type="button"
                className="button button--small delete-view"
                onClick={() => setConfirmDelete(true)}
              >
                {strings.editor.deleteView}
              </button>
            )}
          </div>
          <div className="bottom-content">
            {bottom === 'problems' ? (
              <ProblemsPanel project={project} />
            ) : (
              <AddressTable project={project} />
            )}
          </div>
        </div>
      )}

      {confirmDelete && view && (
        <Modal title={strings.editor.deleteView}>
          <p>{strings.editor.confirmDeleteView(view.name)}</p>
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => {
                setConfirmDelete(false);
                const ids = view.elements.map((element) => element.id);
                edit((p) => {
                  const cleaned = deleteElements(p, ids);
                  return {
                    ...cleaned,
                    views: cleaned.views.filter(
                      (candidate) => candidate.id !== view.id,
                    ),
                    areas: cleaned.areas.filter(
                      (area) => area.id !== view.areaId,
                    ),
                  };
                });
              }}
            >
              {strings.editor.delete}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setConfirmDelete(false)}
            >
              {strings.modes.cancel}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

const emptyProject = {
  format: 'lever-project',
  schemaVersion: 1,
  id: 'empty',
  name: '',
  settings: {
    defaultLevel: 1,
    centralUnit: {
      addressOffset: 0,
      straightOutput: 1,
      pulseMs: 150,
      accessoryGapMs: 150,
      turnoutCommandMode: 'pulse',
      confirmation: 'report',
      confirmTimeoutMs: 2000,
      feedbackSources: [],
    },
    blockReleaseDelayMs: 1000,
    autoSignalsOnRoute: true,
  },
  views: [],
  arrangements: [],
  areas: [],
  blocks: [],
  signalTypes: [],
  routes: [],
} as const satisfies Parameters<typeof useProblems>[0];
