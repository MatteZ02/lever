// Where automation areas meet (MIX-3): a tick across the track and the two
// levels, in each level's colour, with the number as text so it does not rely
// on colour (LOOK-4).
import {useMemo} from 'react';
import {areaBoundaries} from '../../../model/areas';
import {rotateDirection, vector} from '../../../model/geometry';
import {Project, StationView} from '../../../model/project';
import {color} from '../../theme';
import {useUpright} from './upright';

const LEVEL_COLOR = [
  color.areaLevel1,
  color.areaLevel1,
  color.areaLevel2,
  color.areaLevel3,
  color.areaLevel4,
];

export const AreaBoundaries = ({
  project,
  view,
}: {
  project: Project;
  view: StationView;
}) => {
  const boundaries = useMemo(
    () => areaBoundaries(project, view),
    [project, view],
  );
  const upright = useUpright();
  return (
    <g pointerEvents="none">
      {boundaries.map((boundary) => {
        const across = vector(rotateDirection(boundary.direction, 2));
        const length = Math.hypot(across.x, across.y);
        const ux = across.x / length;
        const uy = across.y / length;
        const {x, y} = boundary.at;
        return (
          <g key={`${x},${y}`}>
            <line
              x1={x - ux * 0.55}
              y1={y - uy * 0.55}
              x2={x + ux * 0.55}
              y2={y + uy * 0.55}
              style={{
                stroke: LEVEL_COLOR[boundary.levels[1]],
                strokeWidth: 0.12,
                strokeDasharray: '0.12 0.08',
              }}
            />
            <text
              x={x + ux * 0.9}
              y={y + uy * 0.9 + 0.15}
              transform={upright(x + ux * 0.9, y + uy * 0.9)}
              textAnchor="middle"
              style={{
                fill: LEVEL_COLOR[boundary.levels[0]],
                fontSize: 0.42,
                fontWeight: 700,
              }}
            >
              {`L${boundary.levels[0]}|L${boundary.levels[1]}`}
            </text>
          </g>
        );
      })}
    </g>
  );
};
