// Small schematic icons for the toolbox, drawn with the diagram's own style.
import {color} from '../../theme';

export type ToolIconKind =
  | 'select'
  | 'track'
  | 'left'
  | 'right'
  | 'wye'
  | 'threeWay'
  | 'crossing'
  | 'singleSlip'
  | 'doubleSlip'
  | 'signal'
  | 'bufferStop'
  | 'connector'
  | 'virtualPoint'
  | 'accessory'
  | 'label'
  | 'platform';

const line = {
  stroke: color.text,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  fill: 'none',
};

const PATHS: Record<ToolIconKind, string> = {
  select: 'M6 4 L6 18 L10 14 L13 20 L15 19 L12 13 L17 13 Z',
  track: 'M3 18 L10 18 L17 11 L21 11',
  left: 'M3 14 L21 14 M12 14 L18 8',
  right: 'M3 10 L21 10 M12 10 L18 16',
  wye: 'M3 12 L10 12 L17 6 M10 12 L17 18',
  threeWay: 'M3 12 L21 12 M10 12 L16 6 M10 12 L16 18',
  crossing: 'M3 12 L21 12 M6 18 L18 6',
  singleSlip: 'M3 12 L21 12 M6 18 L18 6',
  doubleSlip: 'M3 12 L21 12 M6 18 L18 6',
  signal: 'M4 16 L20 16 M8 16 L8 9 M8 9 L13 9',
  bufferStop: 'M3 12 L16 12 M17 7 L17 17',
  connector: 'M3 12 L13 12 M13 7 L20 12 L13 17 Z',
  virtualPoint: 'M3 12 L21 12 M12 8 L16 12 L12 16 L8 12 Z',
  accessory: 'M3 18 L21 18 M7 6 L17 6 L17 14 L7 14 Z',
  label: 'M6 6 L18 6 M12 6 L12 19',
  platform: 'M3 8 L21 8 L21 15 L3 15 Z',
};

export const ToolIcon = ({kind}: {kind: ToolIconKind}) => (
  <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
    <path d={PATHS[kind]} style={line} />
    {kind === 'signal' && (
      <circle cx={15} cy={9} r={2.5} style={{fill: color.signalStop}} />
    )}
    {kind === 'singleSlip' && (
      <circle cx={12} cy={8.5} r={1.4} style={{fill: color.text}} />
    )}
    {kind === 'doubleSlip' && (
      <>
        <circle cx={12} cy={8.5} r={1.4} style={{fill: color.text}} />
        <circle cx={12} cy={15.5} r={1.4} style={{fill: color.text}} />
      </>
    )}
  </svg>
);
