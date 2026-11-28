// Locos and schedules (Levels 3 and 4), stored in the project: the speeds
// and rates Lever drives each loco with, like Throttle's loco editor (top
// speed, acceleration and braking in km/h per second), plus the cruising
// and approach speeds of automatic driving; and the schedules automatic
// trains follow. Edited in operating mode too (no edit password, like
// saved routes); read-only when the layout is open elsewhere.
import {
  brakingSeconds,
  Loco,
  LocoSpeedSteps,
  locoSchema,
  Schedule,
  scheduleSchema,
} from '../../../model/locos';
import {newId, Project} from '../../../model/project';
import {strings} from '../../../shared/strings';
import {
  CheckField,
  NumberField,
  SelectField,
  TextField,
} from '../editor/properties/fields';
import {edit, useProjectStore} from '../store/projectStore';

const text = strings.locos;

const updateLoco = (id: string, change: Partial<Loco>) =>
  edit((p) => ({
    ...p,
    locos: p.locos.map((loco) =>
      loco.id === id ? {...loco, ...change} : loco,
    ),
  }));

const updateSchedule = (id: string, change: Partial<Schedule>) =>
  edit((p) => ({
    ...p,
    schedules: p.schedules.map((schedule) =>
      schedule.id === id ? {...schedule, ...change} : schedule,
    ),
  }));

// The next free address, for a new loco.
const nextAddress = (project: Project) =>
  Math.min(9999, Math.max(2, ...project.locos.map((l) => l.address)) + 1);

export const LocoPanel = ({project}: {project: Project}) => {
  const readOnly = useProjectStore((state) => state.document?.readOnly ?? true);
  return (
    <section className="panel loco-panel" aria-labelledby="locos-title">
      <h2 id="locos-title">{text.title}</h2>
      <p className="muted small">{text.help}</p>
      {readOnly && <p className="muted small">{strings.modes.readOnly}</p>}
      {project.locos.length === 0 && (
        <p className="muted small">{text.empty}</p>
      )}
      {project.locos.map((loco) => (
        <LocoEditor key={loco.id} loco={loco} disabled={readOnly} />
      ))}
      <button
        type="button"
        className="button"
        disabled={readOnly}
        onClick={() =>
          edit((p) => ({
            ...p,
            locos: [
              ...p.locos,
              locoSchema.parse({
                id: newId('loco'),
                name: text.newName,
                address: nextAddress(p),
              }),
            ],
          }))
        }
      >
        {text.add}
      </button>

      <h2>{text.schedules}</h2>
      <p className="muted small">{text.schedulesHelp}</p>
      {project.schedules.length === 0 && (
        <p className="muted small">{text.noSchedules}</p>
      )}
      {project.schedules.map((schedule) => (
        <ScheduleEditor
          key={schedule.id}
          project={project}
          schedule={schedule}
          disabled={readOnly}
        />
      ))}
      <button
        type="button"
        className="button"
        disabled={readOnly}
        onClick={() =>
          edit((p) => ({
            ...p,
            schedules: [
              ...p.schedules,
              scheduleSchema.parse({
                id: newId('schedule'),
                name: text.newSchedule,
              }),
            ],
          }))
        }
      >
        {text.addSchedule}
      </button>
    </section>
  );
};

const LocoEditor = ({loco, disabled}: {loco: Loco; disabled: boolean}) => (
  <details className="loco-editor">
    <summary>
      <strong>{loco.name}</strong>{' '}
      <span className="muted">({loco.address})</span>
    </summary>
    <TextField
      label={text.name}
      value={loco.name}
      disabled={disabled}
      onCommit={(name) =>
        name.trim() && updateLoco(loco.id, {name: name.trim()})
      }
    />
    <NumberField
      label={text.address}
      value={loco.address}
      min={1}
      max={9999}
      disabled={disabled}
      onCommit={(address) => address && updateLoco(loco.id, {address})}
    />
    <SelectField
      label={text.speedSteps}
      value={String(loco.speedSteps)}
      options={['14', '28', '128'].map((value) => ({value, label: value}))}
      disabled={disabled}
      onCommit={(value) =>
        updateLoco(loco.id, {speedSteps: Number(value) as LocoSpeedSteps})
      }
    />
    <NumberField
      label={text.maxSpeed}
      value={loco.maxSpeedKmh}
      min={1}
      max={500}
      disabled={disabled}
      onCommit={(maxSpeedKmh) =>
        maxSpeedKmh && updateLoco(loco.id, {maxSpeedKmh})
      }
    />
    <NumberField
      label={text.acceleration}
      value={loco.acceleration}
      min={1}
      max={200}
      disabled={disabled}
      onCommit={(acceleration) =>
        acceleration && updateLoco(loco.id, {acceleration})
      }
    />
    <NumberField
      label={text.braking}
      value={loco.braking}
      min={1}
      max={200}
      disabled={disabled}
      help={text.brakingTime(Math.round(brakingSeconds(loco, loco.cruiseKmh)))}
      onCommit={(braking) => braking && updateLoco(loco.id, {braking})}
    />
    <NumberField
      label={text.cruise}
      value={loco.cruiseKmh}
      min={0}
      max={500}
      disabled={disabled}
      onCommit={(cruiseKmh) =>
        cruiseKmh !== undefined && updateLoco(loco.id, {cruiseKmh})
      }
    />
    <NumberField
      label={text.approach}
      value={loco.approachKmh}
      min={0}
      max={500}
      disabled={disabled}
      onCommit={(approachKmh) =>
        approachKmh !== undefined && updateLoco(loco.id, {approachKmh})
      }
    />
    <TextField
      label={text.notes}
      value={loco.notes}
      disabled={disabled}
      onCommit={(notes) => updateLoco(loco.id, {notes: notes.slice(0, 2000)})}
    />
    <button
      type="button"
      className="button button--small"
      disabled={disabled}
      onClick={() =>
        edit((p) => ({...p, locos: p.locos.filter((l) => l.id !== loco.id)}))
      }
    >
      {text.remove}
    </button>
  </details>
);

const ScheduleEditor = ({
  project,
  schedule,
  disabled,
}: {
  project: Project;
  schedule: Schedule;
  disabled: boolean;
}) => {
  const blocks = project.blocks;
  const setStops = (stops: Schedule['stops']) =>
    updateSchedule(schedule.id, {stops});
  return (
    <details className="loco-editor">
      <summary>
        <strong>{schedule.name}</strong>{' '}
        <span className="muted">({schedule.stops.length})</span>
      </summary>
      <TextField
        label={text.name}
        value={schedule.name}
        disabled={disabled}
        onCommit={(name) =>
          name.trim() && updateSchedule(schedule.id, {name: name.trim()})
        }
      />
      <p className="muted small">{text.stops}</p>
      {schedule.stops.map((stop, index) => (
        <div key={index} className="button-row schedule-stop">
          <span>{index + 1}.</span>
          <select
            aria-label={`${strings.traffic.block} ${index + 1}`}
            value={stop.blockId}
            disabled={disabled}
            onChange={(event) =>
              setStops(
                schedule.stops.map((s, i) =>
                  i === index ? {...s, blockId: event.target.value} : s,
                ),
              )
            }
          >
            {blocks.map((block) => (
              <option key={block.id} value={block.id}>
                {block.name || block.id}
              </option>
            ))}
          </select>
          <NumberField
            label={text.dwell}
            value={stop.dwellS}
            min={0}
            max={3600}
            disabled={disabled}
            onCommit={(dwellS) =>
              dwellS !== undefined &&
              setStops(
                schedule.stops.map((s, i) =>
                  i === index ? {...s, dwellS} : s,
                ),
              )
            }
          />
          <button
            type="button"
            className="button button--small"
            disabled={disabled}
            onClick={() =>
              setStops(schedule.stops.filter((_, i) => i !== index))
            }
          >
            {text.remove}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button button--small"
        disabled={disabled || blocks.length === 0}
        onClick={() =>
          setStops([...schedule.stops, {blockId: blocks[0].id, dwellS: 30}])
        }
      >
        {text.addStop}
      </button>
      <CheckField
        label={text.repeat}
        value={schedule.repeat}
        disabled={disabled}
        onCommit={(repeat) => updateSchedule(schedule.id, {repeat})}
      />
      <button
        type="button"
        className="button button--small"
        disabled={disabled}
        onClick={() =>
          edit((p) => ({
            ...p,
            schedules: p.schedules.filter((s) => s.id !== schedule.id),
          }))
        }
      >
        {text.remove}
      </button>
    </details>
  );
};
