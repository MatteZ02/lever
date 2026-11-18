// Properties shown when nothing is selected: the station view, the layout,
// the central-unit profile (everything that may differ on the DR5000), and
// the edit password.
import {useState} from 'react';
import {CentralUnitProfile} from '../../../../model/centralUnitProfile';
import {updateView} from '../../../../model/editing';
import {
  AutomationLevel,
  newId,
  Project,
  StationView,
} from '../../../../model/project';
import {FeedbackSource} from '../../../../shared/feedback';
import {strings} from '../../../../shared/strings';
import {edit} from '../../store/projectStore';
import {hashPassword} from '../password';
import {
  CheckField,
  NumberField,
  Section,
  SelectField,
  TextField,
} from './fields';

const LEVELS: AutomationLevel[] = [1, 2];

export const ProjectProperties = ({
  project,
  view,
}: {
  project: Project;
  view?: StationView;
}) => {
  const profile = project.settings.centralUnit;
  const setProfile = (changes: Partial<CentralUnitProfile>) =>
    edit((p) => ({
      ...p,
      settings: {
        ...p.settings,
        centralUnit: {...p.settings.centralUnit, ...changes},
      },
    }));
  const area =
    view && project.areas.find((candidate) => candidate.id === view.areaId);

  return (
    <>
      {view && (
        <Section title={strings.properties.station}>
          <TextField
            label={strings.properties.stationName}
            value={view.name}
            onCommit={(name) =>
              name.trim() &&
              edit((p) => ({
                ...updateView(p, view.id, (v) => ({...v, name: name.trim()})),
                areas: p.areas.map((a) =>
                  a.id === view.areaId ? {...a, name: name.trim()} : a,
                ),
              }))
            }
          />
          {area && (
            <SelectField
              label={strings.properties.area}
              value={String(area.level)}
              options={LEVELS.map((level) => ({
                value: String(level),
                label: strings.properties.level(level),
              }))}
              onCommit={(value) =>
                edit((p) => ({
                  ...p,
                  areas: p.areas.map((a) =>
                    a.id === area.id
                      ? {...a, level: Number(value) as AutomationLevel}
                      : a,
                  ),
                }))
              }
            />
          )}
        </Section>
      )}

      <Section title={strings.properties.project}>
        <TextField
          label={strings.properties.layoutName}
          value={project.name}
          onCommit={(name) =>
            name.trim() && edit((p) => ({...p, name: name.trim()}))
          }
        />
        <SelectField
          label={strings.properties.defaultLevel}
          value={String(project.settings.defaultLevel)}
          options={LEVELS.map((level) => ({
            value: String(level),
            label: strings.properties.level(level),
          }))}
          onCommit={(value) =>
            edit((p) => ({
              ...p,
              settings: {
                ...p.settings,
                defaultLevel: Number(value) as AutomationLevel,
              },
            }))
          }
        />
        <NumberField
          label={strings.properties.blockReleaseDelay}
          value={project.settings.blockReleaseDelayMs}
          min={0}
          max={60000}
          onCommit={(value) =>
            value !== undefined &&
            edit((p) => ({
              ...p,
              settings: {...p.settings, blockReleaseDelayMs: value},
            }))
          }
        />
        <CheckField
          label={strings.properties.autoSignals}
          value={project.settings.autoSignalsOnRoute}
          onCommit={(value) =>
            edit((p) => ({
              ...p,
              settings: {...p.settings, autoSignalsOnRoute: value},
            }))
          }
        />
        <CheckField
          label={strings.properties.restoreTurnouts}
          value={project.settings.restoreTurnoutsOnStartup}
          onCommit={(value) =>
            edit((p) => ({
              ...p,
              settings: {...p.settings, restoreTurnoutsOnStartup: value},
            }))
          }
        />
        <p className="muted small">{strings.properties.restoreTurnoutsHelp}</p>
      </Section>

      <Section title={strings.properties.centralUnit}>
        <p className="muted small">{strings.properties.centralUnitHelp}</p>
        <NumberField
          label={strings.properties.addressOffset}
          help={strings.properties.addressOffsetHelp}
          value={profile.addressOffset}
          min={-2048}
          max={2048}
          onCommit={(value) =>
            value !== undefined && setProfile({addressOffset: value})
          }
        />
        <SelectField
          label={strings.properties.straightOutput}
          value={String(profile.straightOutput)}
          options={[1, 2].map((n) => ({
            value: String(n),
            label: strings.properties.output(n),
          }))}
          onCommit={(value) =>
            setProfile({straightOutput: Number(value) as 1 | 2})
          }
        />
        <NumberField
          label={strings.properties.pulse}
          value={profile.pulseMs}
          min={20}
          max={5000}
          onCommit={(value) =>
            value !== undefined && setProfile({pulseMs: value})
          }
        />
        <NumberField
          label={strings.properties.gap}
          value={profile.accessoryGapMs}
          min={20}
          max={5000}
          onCommit={(value) =>
            value !== undefined && setProfile({accessoryGapMs: value})
          }
        />
        <SelectField
          label={strings.properties.commandMode}
          value={profile.turnoutCommandMode}
          options={[
            {value: 'pulse', label: strings.properties.commandModePulse},
            {value: 'queued', label: strings.properties.commandModeQueued},
          ]}
          onCommit={(turnoutCommandMode) => setProfile({turnoutCommandMode})}
        />
        <SelectField
          label={strings.properties.confirmation}
          value={profile.confirmation}
          options={[
            {value: 'report', label: strings.properties.confirmationReport},
            {value: 'assume', label: strings.properties.confirmationAssume},
          ]}
          onCommit={(confirmation) => setProfile({confirmation})}
        />
        <NumberField
          label={strings.properties.confirmTimeout}
          value={profile.confirmTimeoutMs}
          min={100}
          max={30000}
          onCommit={(value) =>
            value !== undefined && setProfile({confirmTimeoutMs: value})
          }
        />
        <span className="field-label">
          {strings.properties.feedbackSources}
        </span>
        {(['rbus', 'loconet', 'can'] as FeedbackSource[]).map((source) => (
          <CheckField
            key={source}
            label={strings.developer.feedbackSources[source]}
            value={profile.feedbackSources.includes(source)}
            onCommit={(on) =>
              setProfile({
                feedbackSources: on
                  ? [...profile.feedbackSources, source]
                  : profile.feedbackSources.filter((other) => other !== source),
              })
            }
          />
        ))}
      </Section>

      <AreasSection project={project} />

      <PasswordSection project={project} />
    </>
  );
};

const PasswordSection = ({project}: {project: Project}) => {
  const [draft, setDraft] = useState('');
  const isSet = project.settings.editPassword !== undefined;
  return (
    <Section title={strings.properties.editPassword}>
      <p className="muted small">
        {isSet
          ? strings.properties.passwordSet
          : strings.properties.passwordNotSet}
      </p>
      <label className="field">
        <span>{strings.properties.newPassword}</span>
        <input
          type="password"
          value={draft}
          autoComplete="new-password"
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={draft.length === 0}
          onClick={() => {
            void hashPassword(draft).then((editPassword) => {
              edit((p) => ({...p, settings: {...p.settings, editPassword}}));
              setDraft('');
            });
          }}
        >
          {isSet
            ? strings.properties.changePassword
            : strings.properties.setPassword}
        </button>
        {isSet && (
          <button
            type="button"
            className="button"
            onClick={() =>
              edit((p) => ({
                ...p,
                settings: {...p.settings, editPassword: undefined},
              }))
            }
          >
            {strings.properties.removePassword}
          </button>
        )}
      </div>
    </Section>
  );
};

// Automation areas (MIX-1): each station has one; more can be added for
// parts of a station or for the line between stations, and assigned to
// elements in their properties.
const AreasSection = ({project}: {project: Project}) => {
  const isViewDefault = (id: string) =>
    project.views.some((view) => view.areaId === id);
  return (
    <Section title={strings.properties.areas}>
      <p className="muted small">{strings.properties.areasHelp}</p>
      {project.areas.map((area) => (
        <div key={area.id} className="area-edit-row">
          <TextField
            label={strings.properties.areaName}
            value={area.name}
            onCommit={(name) =>
              name.trim() &&
              edit((p) => ({
                ...p,
                areas: p.areas.map((a) =>
                  a.id === area.id ? {...a, name: name.trim()} : a,
                ),
              }))
            }
          />
          <SelectField
            label={strings.properties.areaLevel}
            value={String(area.level)}
            options={LEVELS.map((level) => ({
              value: String(level),
              label: strings.properties.level(level),
            }))}
            onCommit={(value) =>
              edit((p) => ({
                ...p,
                areas: p.areas.map((a) =>
                  a.id === area.id
                    ? {...a, level: Number(value) as AutomationLevel}
                    : a,
                ),
              }))
            }
          />
          {!isViewDefault(area.id) && (
            <button
              type="button"
              className="button button--small"
              onClick={() =>
                edit((p) => ({
                  ...p,
                  areas: p.areas.filter((a) => a.id !== area.id),
                  // Elements of a removed area go back to their station's.
                  views: p.views.map((view) => ({
                    ...view,
                    elements: view.elements.map((element) =>
                      element.areaId === area.id
                        ? {...element, areaId: undefined}
                        : element,
                    ),
                  })),
                }))
              }
            >
              {strings.properties.removeArea}
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="button button--small"
        onClick={() =>
          edit((p) => ({
            ...p,
            areas: [
              ...p.areas,
              {
                id: newId('area'),
                name: strings.properties.newAreaName,
                level: p.settings.defaultLevel,
              },
            ],
          }))
        }
      >
        {strings.properties.addArea}
      </button>
    </Section>
  );
};
