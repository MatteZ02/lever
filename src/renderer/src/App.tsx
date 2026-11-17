import {Notices} from './components/Notices';
import {StatusBar} from './components/StatusBar';
import {Workspace} from './Workspace';

export const App = () => (
  <div className="app">
    <StatusBar />
    <Notices />
    <Workspace />
  </div>
);
