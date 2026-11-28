// Main window layout: layout bar (mode, project, stations, tools), the
// diagram, and in edit mode the toolbox, properties and problem/address
// panels. Settings, the accessory test panel and the protocol log open in a
// side drawer.
import {useCallback, useDeferredValue, useState} from 'react';
import {deleteElements, rotateElements} from '../../model/editing';
import {GridPoint} from '../../model/geometry';
import {createView} from '../../model/project';
import {strings} from '../../shared/strings';
import {DeveloperPanel} from './components/DeveloperPanel';
import {Modal} from './components/Modal';
import {ModeSwitch} from './components/ModeSwitch';
import {ProtocolLog} from './components/ProtocolLog';
import {SettingsPanel} from './components/SettingsPanel';
import {AddressTable} from './editor/AddressTable';
import {EditorCanvas} from './editor/EditorCanvas';
import {ProblemsPanel, useProblems} from './editor/ProblemsPanel';
import {PropertiesPanel} from './editor/properties/PropertiesPanel';
import {Toolbox} from './editor/Toolbox';
import {useEditorKeys} from './editor/useEditorKeys';
import {ViewCanvas} from './full/ViewCanvas';
import {ViewSelection, ViewTool} from './full/viewEdits';
import {ViewPanel} from './full/ViewPanel';
import {ViewToolbox} from './full/ViewToolbox';
import {AreasPanel} from './operate/AreasPanel';
import {FeedbackMonitor} from './operate/FeedbackMonitor';
import {LocoPanel} from './operate/LocoPanel';
import {OperateCanvas} from './operate/OperateCanvas';
import {TrafficBoard} from './operate/TrafficBoard';
import {TrafficStrip} from './operate/TrafficStrip';
import {
  edit,
  redo,
  select,
  setActiveView,
  setHint,
  setTestMode,
  undo,
  useProjectStore,
} from './store/projectStore';
import {useSettingsStore} from './store/settingsStore';
import {useShownView} from './useShownView';
import {ViewTabs} from './ViewTabs';

type Drawer =
  'areas' | 'locos' | 'feedback' | 'settings' | 'developer' | 'log' | null;
type BottomPanel = 'problems' | 'addresses';

const ALL_DRAWERS = [
  'areas',
  'locos',
  'feedback',
  'settings',
  'developer',
  'log',
] as const;
const OPERATOR_DRAWERS: readonly Exclude<Drawer, null>[] = [
  'areas',
  'locos',
  'settings',
];

const DRAWER_LABELS: Record<Exclude<Drawer, null>, string> = {
  areas: strings.operate.areasShort,
  locos: strings.locos.short,
  feedback: strings.operate.feedbackShort,
  settings: strings.settings.title,
  developer: strings.developer.short,
  log: strings.protocolLog.title,
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
  const [viewTool, setViewTool] = useState<ViewTool>({kind: 'select'});
  const [viewSelection, setViewSelection] = useState<ViewSelection>(null);
  const [openDrawer, setDrawer] = useState<Drawer>(null);
  const devTools = useSettingsStore((state) => state.settings.devTools);
  // Feedback, accessory test and protocol log only with developer tools on.
  const drawers = devTools ? ALL_DRAWERS : OPERATOR_DRAWERS;
  const drawer = openDrawer && drawers.includes(openDrawer) ? openDrawer : null;
  const [bottom, setBottom] = useState<BottomPanel>('problems');
  const [drawing, setDrawing] = useState<GridPoint[]>([]);
  const [placeRotation, setPlaceRotation] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const {view, fullView, traffic, arrangement, fit, targetText} =
    useShownView();
  // A switch to another tab (by click or number key) drops a half-drawn
  // track and the view tools' state.
  const shownKey = traffic
    ? 'traffic'
    : fullView
      ? `view:${arrangement?.id}`
      : `station:${view?.id}`;
  const [lastShown, setLastShown] = useState(shownKey);
  if (lastShown !== shownKey) {
    setLastShown(shownKey);
    setDrawing([]);
    setViewSelection(null);
    setViewTool({kind: 'select'});
  }
  const rotatePlacement = useCallback(() => setPlaceRotation((r) => r + 1), []);
  useEditorKeys({drawing, setDrawing, rotatePlacement, fit});
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
        <ViewTabs
          project={project}
          shownArrangementId={arrangement?.id}
          shownViewId={fullView ? undefined : view?.id}
          trafficShown={traffic && !editing}
          editing={editing}
        >
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
        </ViewTabs>
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
          {drawers.map((name) => (
            <button
              key={name}
              type="button"
              className={`button${drawer === name ? ' button--active' : ''}`}
              aria-pressed={drawer === name}
              onClick={() => setDrawer(drawer === name ? null : name)}
            >
              {DRAWER_LABELS[name]}
            </button>
          ))}
        </div>
      </div>

      <div className="layout-main">
        {editing && !fullView && <Toolbox />}
        {editing && fullView && (
          <ViewToolbox
            project={project}
            tool={viewTool}
            onToolChange={setViewTool}
          />
        )}
        <div className="canvas-area">
          {traffic && !editing && <TrafficBoard project={project} />}
          {fullView && arrangement && (
            <ViewCanvas
              project={project}
              arrangement={arrangement}
              editing={editing}
              tool={viewTool}
              onToolChange={setViewTool}
              selection={viewSelection}
              onSelect={setViewSelection}
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
          <ViewPanel
            project={project}
            arrangement={arrangement}
            selection={viewSelection}
            onSelect={setViewSelection}
          />
        )}
        {drawer && (
          <div className="drawer">
            {drawer === 'areas' && <AreasPanel project={project} />}
            {drawer === 'locos' && <LocoPanel project={project} />}
            {drawer === 'feedback' && <FeedbackMonitor project={project} />}
            {drawer === 'settings' && <SettingsPanel />}
            {drawer === 'developer' && <DeveloperPanel />}
            {drawer === 'log' && <ProtocolLog />}
          </div>
        )}
      </div>

      {!editing && !traffic && <TrafficStrip project={project} />}

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
