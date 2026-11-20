// Edit mode in a layout view: the view (name, delete) and the selected frame
// (station, rotation) or line.
import {rotateFrame, setFrameStation} from '../../../model/arrangement';
import {Arrangement, Project} from '../../../model/project';
import {strings} from '../../../shared/strings';
import {Section, SelectField, TextField} from '../editor/properties/fields';
import {edit, setActiveArrangement, setActiveView} from '../store/projectStore';
import {changeArrangement, deleteSelection, ViewSelection} from './viewEdits';

export const ViewPanel = ({
  project,
  arrangement,
  selection,
  onSelect,
}: {
  project: Project;
  arrangement: Arrangement;
  selection: ViewSelection;
  onSelect: (selection: ViewSelection) => void;
}) => {
  const change = (update: (a: Arrangement) => Arrangement) =>
    changeArrangement(arrangement.id, update);
  const frame =
    selection?.kind === 'frame'
      ? arrangement.frames.find((f) => f.id === selection.id)
      : undefined;
  const line =
    selection?.kind === 'line'
      ? arrangement.lines.find((l) => l.id === selection.id)
      : undefined;
  const remove = () => {
    if (selection) {
      deleteSelection(arrangement.id, selection);
      onSelect(null);
    }
  };

  return (
    <aside className="properties" aria-label={strings.full.title}>
      <h2>{strings.properties.title}</h2>
      <Section title={strings.full.title}>
        <p className="muted small">{strings.full.editHelp}</p>
        <TextField
          label={strings.full.name}
          value={arrangement.name}
          onCommit={(name) =>
            name.trim() &&
            change((a) => ({...a, name: name.trim().slice(0, 100)}))
          }
        />
        <div className="button-row">
          <button
            type="button"
            className="button button--small"
            onClick={() => {
              const remaining = project.arrangements.filter(
                (a) => a.id !== arrangement.id,
              );
              edit((p) => ({...p, arrangements: remaining}));
              if (remaining.length > 0) {
                setActiveArrangement(remaining[0].id);
              } else if (project.views[0]) {
                setActiveView(project.views[0].id);
              }
            }}
          >
            {strings.full.remove}
          </button>
        </div>
      </Section>

      {frame && (
        <Section
          title={
            project.views.find((v) => v.id === frame.viewId)?.name ??
            strings.full.station
          }
        >
          <SelectField
            label={strings.full.station}
            value={frame.viewId}
            options={project.views.map((view) => ({
              value: view.id,
              label: view.name,
            }))}
            onCommit={(viewId) =>
              change((a) => setFrameStation(a, frame.id, viewId))
            }
          />
          <p className="small">{strings.full.rotation(frame.rotation)}</p>
          <div className="button-row">
            <button
              type="button"
              className="button button--small"
              onClick={() => change((a) => rotateFrame(a, frame.id, -1))}
            >
              ↺ {strings.full.rotateLeft}
            </button>
            <button
              type="button"
              className="button button--small"
              onClick={() => change((a) => rotateFrame(a, frame.id, 1))}
            >
              ↻ {strings.full.rotateRight}
            </button>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="button button--small"
              onClick={() => setActiveView(frame.viewId)}
            >
              {strings.full.openStation}
            </button>
            <button
              type="button"
              className="button button--small"
              onClick={remove}
            >
              {strings.full.deleteFrame}
            </button>
          </div>
        </Section>
      )}

      {line && (
        <Section title={strings.full.lineTitle}>
          <p className="small">{strings.full.linePoints(line.points.length)}</p>
          <div className="button-row">
            <button
              type="button"
              className="button button--small"
              onClick={remove}
            >
              {strings.full.deleteLine}
            </button>
          </div>
        </Section>
      )}

      {!frame && !line && (
        <p className="muted small">{strings.full.selectHint}</p>
      )}
    </aside>
  );
};
