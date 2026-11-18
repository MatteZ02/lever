// Main window layout: layout bar (mode, project, stations, tools), the
// diagram, and in edit mode the toolbox, properties and problem/address
// panels. Settings, the accessory test panel and the protocol log open in a
// side drawer.
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {arrangementsOf, movePanel} from '../../model/arrangement';
import {deleteElements, rotateElements} from '../../model/editing';
import {GridPoint} from '../../model/geometry';
import {createView} from '../../model/project';
import {strings} from '../../shared/strings';
import {formatWindowTarget, WindowTarget} from '../../shared/windowTarget';
import {DeveloperPanel} from './components/DeveloperPanel';
import {Modal} from './components/Modal';
import {ModeSwitch} from './components/ModeSwitch';
import {ProtocolLog} from './components/ProtocolLog';
import {SettingsPanel} from './components/SettingsPanel';
import {fitViewport} from './diagram/DiagramView';
import {AddressTable} from './editor/AddressTable';
import {EditorCanvas} from './editor/EditorCanvas';
import {ProblemsPanel, useProblems} from './editor/ProblemsPanel';
import {PropertiesPanel} from './editor/properties/PropertiesPanel';
import {Toolbox} from './editor/Toolbox';
import {useEditorKeys} from './editor/useEditorKeys';
import {ArrangementPanel, changeArrangement} from './full/ArrangementPanel';
import {FullLayoutCanvas, fitArrangement} from './full/FullLayoutCanvas';
import {AreasPanel} from './operate/AreasPanel';
import {FeedbackMonitor} from './operate/FeedbackMonitor';
import {OperateCanvas} from './operate/OperateCanvas';
import {sendCommand} from './store/engineStore';
import {
  activeView,
  edit,
  FULL_VIEW,
  fullViewportKey,
  redo,
  select,
  setActiveArrangement,
  setActiveView,
  setHint,
  setTestMode,
  setViewport,
  undo,
  useProjectStore,
} from './store/projectStore';

type Drawer = 'areas' | 'feedback' | 'settings' | 'developer' | 'log' | null;
type BottomPanel = 'problems' | 'addresses';

const DRAWER_LABELS: Record<Exclude<Drawer, null>, string> = {
  areas: strings.operate.areasShort,
  feedback: strings.operate.feedbackShort,
  settings: strings.settings.title,
  developer: strings.developer.short,
  log: strings.protocolLog.title,
};

const canvasSize = () => {
  const canvas = document.querySelector('.diagram');
  return {
    width: canvas?.clientWidth ?? 800,
    height: canvas?.clientHeight ?? 600,
  };
};

// How long a hint stays before it has faded out.
const HINT_SHOWN_MS = 6000;

export const Workspace = () => {
  const project = useProjectStore((state) => state.project);
  const document = useProjectStore((state) => state.document);
  const mode = useProjectStore((state) => state.mode);
  const testMode = useProjectStore((state) => state.testMode);
  const selection = useProjectStore((state) => state.selection);
  const hint = useProjectStore((state) => state.hint);
  const canUndo = useProjectStore((state) => state.past.length > 0);
  const canRedo = useProjectStore((state) => state.future.length > 0);
  const activeViewId = useProjectStore((state) => state.activeViewId);
  const activeArrangementId = useProjectStore(
    (state) => state.activeArrangementId,
  );
  const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [bottom, setBottom] = useState<BottomPanel>('problems');
  const [drawing, setDrawing] = useState<GridPoint[]>([]);
  const [placeRotation, setPlaceRotation] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  const rotatePlacement = useCallback(() => setPlaceRotation((r) => r + 1), []);
  useEditorKeys({drawing, setDrawing, rotatePlacement, fit});
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
  // What this window shows: reported to the main process (reopened there
  // next time) and in the window title.
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

  // A full view shown for the first time fits itself to the window.
  const fullKey = arrangement ? fullViewportKey(arrangement.id) : '';
  const fullViewportSet = useProjectStore(
    (state) => fullKey in state.viewports,
  );
  useEffect(() => {
    if (fullView && !fullViewportSet) {
      fit();
    }
  }, [fullView, fullViewportSet, fit]);

  // Validation runs at low priority: the diagram updates at once after an
  // edit, the problem list a moment later (STK-8, large layouts).
  const deferredProject = useDeferredValue(project);
  const problems = useProblems(mode === 'edit' ? deferredProject : null);
  const warningCount = problems.filter((p) => p.severity !== 'info').length;

  if (!project || !document) {
    return null;
  }
  const editing = mode === 'edit';
  const viewLevel =
    view && !fullView
      ? (project.areas.find((area) => area.id === view.areaId)?.level ??
        project.settings.defaultLevel)
      : undefined;
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
        {viewLevel !== undefined && (
          <button
            type="button"
            className={`level-badge level-badge--${viewLevel}`}
            title={strings.operate.areas}
            onClick={() => setDrawer(drawer === 'areas' ? null : 'areas')}
          >
            {strings.operate.levelBadge(viewLevel)}
          </button>
        )}
        <div className="view-tabs" role="tablist">
          {project.views.length > 1 && arrangement && (
            <button
              type="button"
              role="tab"
              aria-selected={fullView}
              className={`view-tab${fullView ? ' view-tab--active' : ''}`}
              onClick={() => {
                setDrawing([]);
                setActiveArrangement(arrangement.id);
              }}
            >
              {strings.full.tab}
            </button>
          )}
          {project.views.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={!fullView && candidate.id === view?.id}
              className={`view-tab${!fullView && candidate.id === view?.id ? ' view-tab--active' : ''}`}
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
          <button
            type="button"
            className="button"
            disabled={!targetText}
            title={strings.windows.openHelp}
            onClick={() => window.lever.window.open(targetText)}
          >
            {strings.windows.open}
          </button>
          {(['areas', 'feedback', 'settings', 'developer', 'log'] as const).map(
            (name) => (
              <button
                key={name}
                type="button"
                className={`button${drawer === name ? ' button--active' : ''}`}
                aria-pressed={drawer === name}
                onClick={() => setDrawer(drawer === name ? null : name)}
              >
                {DRAWER_LABELS[name]}
              </button>
            ),
          )}
        </div>
      </div>

      <div className="layout-main">
        {editing && !fullView && <Toolbox />}
        <div className="canvas-area">
          {fullView && arrangement && (
            <FullLayoutCanvas
              project={project}
              arrangement={arrangement}
              editing={editing}
              selectedPanel={selectedPanel}
              onSelectPanel={setSelectedPanel}
              onMovePanel={(viewId, dx, dy) =>
                changeArrangement(arrangement.id, (a) =>
                  movePanel(a, viewId, dx, dy),
                )
              }
            />
          )}
          {!fullView &&
            view &&
            (editing ? (
              <EditorCanvas
                project={project}
                view={view}
                placeRotation={placeRotation}
                drawing={drawing}
                onDrawingChange={setDrawing}
              />
            ) : (
              <OperateCanvas project={project} view={view} />
            ))}
          {hint && (
            <div
              key={hint}
              className="hint fading"
              role="status"
              style={{animationDuration: `${HINT_SHOWN_MS}ms`}}
              onAnimationEnd={() => setHint(null)}
            >
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
        {editing && !fullView && (
          <PropertiesPanel project={project} view={view} />
        )}
        {editing && fullView && arrangement && (
          <ArrangementPanel
            project={project}
            arrangements={arrangements}
            arrangement={arrangement}
            selectedPanel={selectedPanel}
          />
        )}
        {drawer && (
          <div className="drawer">
            {drawer === 'areas' && <AreasPanel project={project} />}
            {drawer === 'feedback' && <FeedbackMonitor project={project} />}
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
            {view && !fullView && project.views.length > 1 && (
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
              <ProblemsPanel project={project} problems={problems} />
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
