// Edit mode in the full layout view: the arrangement (name, lines between
// linked exits, more arrangements) and the selected station panel's scale.
import {
  defaultArrangement,
  scalePanel,
  updateArrangement,
} from '../../../model/arrangement';
import {Arrangement, Project} from '../../../model/project';
import {strings} from '../../../shared/strings';
import {
  CheckField,
  NumberField,
  Section,
  SelectField,
  TextField,
} from '../editor/properties/fields';
import {edit, setActiveArrangement, setActiveView} from '../store/projectStore';

const SCALE_STEP = 0.1;

export const changeArrangement = (
  arrangementId: string,
  change: (arrangement: Arrangement, project: Project) => Arrangement,
) =>
  edit((p) =>
    updateArrangement(p, strings.full.defaultName, arrangementId, (a) =>
      change(a, p),
    ),
  );

export const ArrangementPanel = ({
  project,
  arrangements,
  arrangement,
  selectedPanel,
}: {
  project: Project;
  arrangements: Arrangement[];
  arrangement: Arrangement;
  selectedPanel: string | null;
}) => {
  const panel = arrangement.panels.find((p) => p.viewId === selectedPanel);
  const view = project.views.find((v) => v.id === selectedPanel);
  const setScale = (scale: number) =>
    panel &&
    changeArrangement(arrangement.id, (a, p) =>
      scalePanel(p, a, panel.viewId, scale),
    );

  return (
    <aside className="properties" aria-label={strings.full.title}>
      <Section title={strings.full.title}>
        <p className="muted small">{strings.full.editHelp}</p>
        {arrangements.length > 1 && (
          <SelectField
            label={strings.full.arrangement}
            value={arrangement.id}
            options={arrangements.map((a) => ({value: a.id, label: a.name}))}
            onCommit={setActiveArrangement}
          />
        )}
        <TextField
          label={strings.full.name}
          value={arrangement.name}
          onCommit={(name) =>
            name.trim() &&
            changeArrangement(arrangement.id, (a) => ({
              ...a,
              name: name.trim().slice(0, 100),
            }))
          }
        />
        <CheckField
          label={strings.full.connectorLines}
          value={arrangement.showConnectorLines}
          onCommit={(showConnectorLines) =>
            changeArrangement(arrangement.id, (a) => ({
              ...a,
              showConnectorLines,
            }))
          }
        />
        <div className="button-row">
          <button
            type="button"
            className="button button--small"
            onClick={() => {
              let created = '';
              edit((p) => {
                const saved = updateArrangement(
                  p,
                  strings.full.defaultName,
                  arrangement.id,
                  (a) => a,
                );
                const next = defaultArrangement(
                  saved,
                  strings.full.newName(saved.arrangements.length + 1),
                );
                created = next.id;
                return {...saved, arrangements: [...saved.arrangements, next]};
              });
              if (created) {
                setActiveArrangement(created);
              }
            }}
          >
            {strings.full.add}
          </button>
          <button
            type="button"
            className="button button--small"
            onClick={() =>
              changeArrangement(arrangement.id, (a, p) => ({
                ...defaultArrangement(p, a.name),
                id: a.id,
                showConnectorLines: a.showConnectorLines,
              }))
            }
          >
            {strings.full.reset}
          </button>
          {arrangements.length > 1 && (
            <button
              type="button"
              className="button button--small"
              onClick={() => {
                const remaining = arrangements.filter(
                  (a) => a.id !== arrangement.id,
                );
                edit((p) => ({...p, arrangements: remaining}));
                setActiveArrangement(remaining[0].id);
              }}
            >
              {strings.full.remove}
            </button>
          )}
        </div>
      </Section>

      {panel && view ? (
        <Section title={view.name}>
          <NumberField
            label={strings.full.scale}
            value={Math.round(panel.scale * 100)}
            min={20}
            max={500}
            onCommit={(percent) =>
              percent !== undefined && setScale(percent / 100)
            }
          />
          <div className="button-row">
            <button
              type="button"
              className="button button--small"
              aria-label={strings.full.smaller}
              onClick={() => setScale(panel.scale - SCALE_STEP)}
            >
              −
            </button>
            <button
              type="button"
              className="button button--small"
              aria-label={strings.full.larger}
              onClick={() => setScale(panel.scale + SCALE_STEP)}
            >
              +
            </button>
            <button
              type="button"
              className="button button--small"
              onClick={() => setActiveView(view.id)}
            >
              {strings.full.openStation}
            </button>
          </div>
        </Section>
      ) : (
        <p className="muted small">{strings.full.selectPanel}</p>
      )}
    </aside>
  );
};
