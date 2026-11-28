// Trains and occupied track, as a table: each train (train number, loco,
// speed, where it is, what Lever does with it) and below them occupied
// track no train is known on. At Level 4 a train can be sent to a block or
// along a schedule from here, and stopped.
import {useMemo} from 'react';
import {levelMaps} from '../../../model/areas';
import {Project} from '../../../model/project';
import {TrainLive} from '../../../shared/liveState';
import {strings} from '../../../shared/strings';
import {sendCommand, useEngineStore} from '../store/engineStore';

const text = strings.traffic;
const trainText = strings.trains;

// Block id → the stations (view names) its tracks are drawn in.
const blockStations = (project: Project): Map<string, string> => {
  const stations = new Map<string, Set<string>>();
  for (const view of project.views) {
    for (const element of view.elements) {
      if (element.kind === 'track' && element.blockId) {
        const names = stations.get(element.blockId) ?? new Set<string>();
        names.add(view.name);
        stations.set(element.blockId, names);
      }
    }
  }
  return new Map(
    [...stations].map(([id, names]) => [id, [...names].join(', ')]),
  );
};

export const TrainList = ({project}: {project: Project}) => {
  const blocks = useEngineStore((state) => state.layout.blocks);
  const trains = useEngineStore((state) => state.layout.trains);
  const stations = useMemo(() => blockStations(project), [project]);
  const levels = useMemo(() => levelMaps(project), [project]);
  const blockName = (id: string) =>
    project.blocks.find((block) => block.id === id)?.name || id;
  const level4Blocks = project.blocks.filter(
    (block) => levels.blocks.get(block.id) === 4,
  );
  const trainList = Object.values(trains).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const onTrain = new Set(trainList.flatMap((train) => train.blockIds));
  const unlabelled = project.blocks
    .filter((block) => blocks[block.id]?.occupied && !onTrain.has(block.id))
    .sort(
      (a, b) =>
        (stations.get(a.id) ?? '').localeCompare(stations.get(b.id) ?? '') ||
        (a.name || a.id).localeCompare(b.name || b.id),
    );

  return (
    <div className="train-list">
      <h3>{text.occupied}</h3>
      {trainList.length === 0 && unlabelled.length === 0 ? (
        <p className="muted small">{text.noOccupied}</p>
      ) : (
        <table className="traffic-table">
          <thead>
            <tr>
              <th>{text.train}</th>
              <th>{trainText.loco}</th>
              <th>{trainText.speed}</th>
              <th>{trainText.where}</th>
              <th>{trainText.state}</th>
            </tr>
          </thead>
          <tbody>
            {trainList.map((train) => (
              <TrainRow
                key={train.id}
                project={project}
                train={train}
                where={train.blockIds
                  .map(
                    (id) =>
                      `${blockName(id)}${stations.get(id) ? ` (${stations.get(id)})` : ''}`,
                  )
                  .join(' ← ')}
                level4={
                  train.blockIds.length > 0 &&
                  levels.blocks.get(train.blockIds[0]) === 4
                }
                destinations={level4Blocks.filter(
                  (block) => !train.blockIds.includes(block.id),
                )}
              />
            ))}
            {unlabelled.map((block) => (
              <tr key={block.id}>
                <td>
                  <span className="muted">{trainText.unlabelled}</span>
                </td>
                <td />
                <td />
                <td>
                  {block.name || block.id}
                  {stations.get(block.id) ? ` (${stations.get(block.id)})` : ''}
                </td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

const TrainRow = ({
  project,
  train,
  where,
  level4,
  destinations,
}: {
  project: Project;
  train: TrainLive;
  where: string;
  level4: boolean;
  destinations: Project['blocks'];
}) => {
  const loco = project.locos.find((candidate) => candidate.id === train.locoId);
  const state = train.hold
    ? trainText.held(train.hold)
    : train.auto
      ? `${trainText.autoStates[train.auto.state] ?? train.auto.state}${
          train.auto.reason
            ? `: ${trainText.autoReasons[train.auto.reason] ?? train.auto.reason}`
            : ''
        }`
      : trainText.driver;
  return (
    <tr className={train.hold ? 'train-row--held' : undefined}>
      <td>
        <strong>{train.name}</strong>
      </td>
      <td>
        {loco ? loco.name : <span className="muted">{trainText.noLoco}</span>}
      </td>
      <td>
        {train.speedKmh !== undefined ? trainText.kmh(train.speedKmh) : ''}
        {train.forward !== undefined && train.speedKmh !== undefined && (
          <span aria-hidden> {train.forward ? '▶' : '◀'}</span>
        )}
      </td>
      <td>
        {where}
        {!train.directionKnown && (
          <span className="muted small"> · {trainText.directionUnknown}</span>
        )}
      </td>
      <td>
        <div className="train-state">
          <span>{state}</span>
          {level4 && loco && (
            <>
              <select
                aria-label={`${trainText.driveTo}: ${train.name}`}
                value=""
                onChange={(event) =>
                  event.target.value &&
                  sendCommand({
                    type: 'driveTrain',
                    trainId: train.id,
                    blockId: event.target.value,
                  })
                }
              >
                <option value="">{trainText.driveTo}…</option>
                {destinations.map((block) => (
                  <option key={block.id} value={block.id}>
                    {block.name || block.id}
                  </option>
                ))}
              </select>
              {project.schedules.length > 0 && (
                <select
                  aria-label={`${trainText.schedule}: ${train.name}`}
                  value=""
                  onChange={(event) =>
                    event.target.value &&
                    sendCommand({
                      type: 'runSchedule',
                      trainId: train.id,
                      scheduleId: event.target.value,
                    })
                  }
                >
                  <option value="">{trainText.schedule}…</option>
                  {project.schedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.name}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          {train.auto && (
            <button
              type="button"
              className="button button--small"
              onClick={() =>
                sendCommand({type: 'stopTrain', trainId: train.id})
              }
            >
              {trainText.stop}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};
