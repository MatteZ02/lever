import {DeveloperPanel} from './components/DeveloperPanel';
import {Notices} from './components/Notices';
import {ProtocolLog} from './components/ProtocolLog';
import {SettingsPanel} from './components/SettingsPanel';
import {StatusBar} from './components/StatusBar';
import {useEngineStore} from './store/engineStore';

export const App = () => {
  const protocolLog = useEngineStore((state) => state.protocolLog);
  return (
    <div className="app">
      <StatusBar />
      <Notices />
      <main className="workspace">
        <SettingsPanel />
        <DeveloperPanel />
        {protocolLog && <ProtocolLog />}
      </main>
    </div>
  );
};
