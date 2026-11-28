// Occupied track with its train numbers, as a list: which block, in which
// station, and the train label if one was given (BLK-4).
import {useMemo} from 'react';
import {Project} from '../../../model/project';
import {strings} from '../../../shared/strings';
import {useEngineStore} from '../store/engineStore';

const text = strings.traffic;

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
  const stations = useMemo(() => blockStations(project), [project]);
  const occupied = project.blocks
    .filter((block) => blocks[block.id]?.occupied)
    .map((block) => ({
      block,
      label: blocks[block.id]?.label,
      station: stations.get(block.id) ?? '',
    }))
    // Labelled (trains) first, then by station and name.
    .sort(
      (a, b) =>
        Number(!a.label) - Number(!b.label) ||
        a.station.localeCompare(b.station) ||
        (a.block.name || a.block.id).localeCompare(b.block.name || b.block.id),
    );
  return (
    <div className="train-list">
      <h3>{text.occupied}</h3>
      {occupied.length === 0 ? (
        <p className="muted small">{text.noOccupied}</p>
      ) : (
        <table className="traffic-table">
          <thead>
            <tr>
              <th>{text.train}</th>
              <th>{text.block}</th>
              <th>{text.station}</th>
            </tr>
          </thead>
          <tbody>
            {occupied.map(({block, label, station}) => (
              <tr key={block.id}>
                <td>
                  {label ?? <span className="muted">{text.noLabel}</span>}
                </td>
                <td>{block.name || block.id}</td>
                <td>{station}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
