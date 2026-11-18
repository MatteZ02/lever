import {Notices} from './components/Notices';
import {StatusBar} from './components/StatusBar';
import {PlainWorkspace} from './PlainWorkspace';
import {isPlainWindow} from './store/projectStore';
import {Workspace} from './Workspace';

export const App = () =>
  isPlainWindow() ? (
    // Notices still appear: they report what happened to this window's
    // own commands (e.g. a turnout that did not move).
    <div className="app">
      <Notices />
      <PlainWorkspace />
    </div>
  ) : (
    <div className="app">
      <StatusBar />
      <Notices />
      <Workspace />
    </div>
  );
