// Tools of a layout view in edit mode: select, draw a line, or draw a frame
// for one of the stations.
import {Project} from '../../../model/project';
import {strings} from '../../../shared/strings';
import {ToolIcon} from '../editor/ToolIcon';
import {ViewTool} from './viewEdits';

export const ViewToolbox = ({
  project,
  tool,
  onToolChange,
}: {
  project: Project;
  tool: ViewTool;
  onToolChange: (tool: ViewTool) => void;
}) => {
  const help =
    tool.kind === 'select'
      ? strings.full.selectHelp
      : tool.kind === 'line'
        ? strings.full.lineHelp
        : strings.full.frameHelp;
  const button = (
    key: string,
    active: boolean,
    label: string,
    next: ViewTool,
    icon?: 'select' | 'track',
  ) => (
    <button
      key={key}
      type="button"
      className={`tool-button${active ? ' tool-button--active' : ''}`}
      aria-pressed={active}
      onClick={() => onToolChange(next)}
    >
      {icon && <ToolIcon kind={icon} />}
      <span className="tool-label">{label}</span>
    </button>
  );
  return (
    <nav className="toolbox" aria-label={strings.full.tools}>
      <div className="toolbox-group">
        {button(
          'select',
          tool.kind === 'select',
          strings.full.select,
          {kind: 'select'},
          'select',
        )}
        {button(
          'line',
          tool.kind === 'line',
          strings.full.line,
          {kind: 'line'},
          'track',
        )}
      </div>
      <div className="toolbox-group">
        <span className="field-label">{strings.full.frameFor}</span>
        {project.views.map((view) =>
          button(
            view.id,
            tool.kind === 'frame' && tool.viewId === view.id,
            view.name,
            {kind: 'frame', viewId: view.id},
          ),
        )}
      </div>
      <p className="toolbox-help">{help}</p>
    </nav>
  );
};
