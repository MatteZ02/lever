// Element palette (EDT-2). Each button picks a tool; placing tools stay
// active so several elements can be placed in a row.
import {strings} from '../../../shared/strings';
import {setTool, Tool, useProjectStore} from '../store/projectStore';
import {ToolIcon, ToolIconKind} from './ToolIcon';

type Entry = {label: string; tool: Tool; icon: ToolIconKind; key?: string};

const ENTRIES: Entry[][] = [
  [
    {
      label: strings.editor.tools.select,
      tool: {kind: 'select'},
      icon: 'select',
      key: 'V',
    },
    {
      label: strings.editor.tools.track,
      tool: {kind: 'track'},
      icon: 'track',
      key: 'T',
    },
  ],
  [
    {
      label: strings.editor.tools.turnoutLeft,
      tool: {kind: 'place', element: 'turnout', turnoutType: 'left'},
      icon: 'left',
    },
    {
      label: strings.editor.tools.turnoutRight,
      tool: {kind: 'place', element: 'turnout', turnoutType: 'right'},
      icon: 'right',
    },
    {
      label: strings.editor.tools.wye,
      tool: {kind: 'place', element: 'turnout', turnoutType: 'wye'},
      icon: 'wye',
    },
    {
      label: strings.editor.tools.threeWay,
      tool: {kind: 'place', element: 'turnout', turnoutType: 'threeWay'},
      icon: 'threeWay',
    },
    {
      label: strings.editor.tools.crossing,
      tool: {kind: 'place', element: 'turnout', turnoutType: 'crossing'},
      icon: 'crossing',
    },
    {
      label: strings.editor.tools.singleSlip,
      tool: {kind: 'place', element: 'turnout', turnoutType: 'singleSlip'},
      icon: 'singleSlip',
    },
    {
      label: strings.editor.tools.doubleSlip,
      tool: {kind: 'place', element: 'turnout', turnoutType: 'doubleSlip'},
      icon: 'doubleSlip',
    },
  ],
  [
    {
      label: strings.editor.tools.signal,
      tool: {kind: 'place', element: 'signal'},
      icon: 'signal',
    },
    {
      label: strings.editor.tools.bufferStop,
      tool: {kind: 'place', element: 'bufferStop'},
      icon: 'bufferStop',
    },
    {
      label: strings.editor.tools.connector,
      tool: {kind: 'place', element: 'connector'},
      icon: 'connector',
    },
    {
      label: strings.editor.tools.virtualPoint,
      tool: {kind: 'place', element: 'virtualPoint'},
      icon: 'virtualPoint',
    },
    {
      label: strings.editor.tools.accessory,
      tool: {kind: 'place', element: 'accessory'},
      icon: 'accessory',
    },
  ],
  [
    {
      label: strings.editor.tools.label,
      tool: {kind: 'place', element: 'label'},
      icon: 'label',
    },
    {
      label: strings.editor.tools.platform,
      tool: {kind: 'place', element: 'platform'},
      icon: 'platform',
    },
  ],
];

const sameTool = (a: Tool, b: Tool) =>
  a.kind === b.kind &&
  (a.kind !== 'place' ||
    (b.kind === 'place' &&
      a.element === b.element &&
      a.turnoutType === b.turnoutType));

export const Toolbox = () => {
  const tool = useProjectStore((state) => state.tool);
  const testMode = useProjectStore((state) => state.testMode);
  const help =
    tool.kind === 'select'
      ? strings.editor.toolHelp.select
      : tool.kind === 'track'
        ? strings.editor.toolHelp.track
        : strings.editor.toolHelp.place;
  return (
    <nav className="toolbox" aria-label={strings.editor.tools.select}>
      {ENTRIES.map((group, index) => (
        <div key={index} className="toolbox-group">
          {group.map((entry) => {
            const active = sameTool(tool, entry.tool);
            return (
              <button
                key={entry.label}
                type="button"
                className={`tool-button${active ? ' tool-button--active' : ''}`}
                aria-pressed={active}
                title={
                  entry.key ? `${entry.label} (${entry.key})` : entry.label
                }
                disabled={testMode}
                onClick={() => setTool(entry.tool)}
              >
                <ToolIcon kind={entry.icon} />
                <span className="tool-label">{entry.label}</span>
              </button>
            );
          })}
        </div>
      ))}
      <p className="toolbox-help muted">
        {testMode ? strings.editor.testModeHelp : help}
      </p>
    </nav>
  );
};
