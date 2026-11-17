// Always-visible header: connection, track status and the STOP control
// (CARRY-1, CARRY-2). Status is always shown as text as well as colour.
import {TrackStatusValue} from '../../../shared/engineApi';
import {strings} from '../../../shared/strings';
import {color} from '../../theme';
import {sendCommand, useEngineStore} from '../store/engineStore';
import {useSettingsStore} from '../store/settingsStore';

const trackStatusColor: Record<TrackStatusValue, string> = {
  unknown: color.statusUnknown,
  normal: color.statusNormal,
  emergencyStop: color.statusEmergencyStop,
  powerOff: color.statusPowerOff,
  shortCircuit: color.statusShortCircuit,
  programming: color.statusProgramming,
};

const keyLabel = (key: string) => (key === 'Escape' ? 'Esc' : key);

export const ConnectionIndicator = () => {
  const connection = useEngineStore((state) => state.connection);
  const deviceInfo = useEngineStore((state) => state.deviceInfo);
  const dotColor =
    connection.state === 'connected'
      ? color.connectionOk
      : connection.state === 'disconnected'
        ? color.connectionDown
        : color.connectionBusy;
  const device =
    deviceInfo.hardwareType !== undefined
      ? (strings.hardwareTypes[deviceInfo.hardwareType] ??
        `0x${deviceInfo.hardwareType.toString(16)}`)
      : undefined;

  return (
    <div className="connection" role="status" aria-live="polite">
      <span
        className={`connection-dot connection-dot--${connection.state}`}
        style={{backgroundColor: dotColor}}
        aria-hidden
      />
      <div>
        <div className="connection-state">
          {strings.connection[connection.state]}
        </div>
        <div className="connection-detail">
          {connection.host}
          {connection.port ? `:${connection.port}` : ''}
          {connection.state === 'connected' &&
            [device, deviceInfo.firmwareVersion]
              .filter(Boolean)
              .map((part, index) => (
                <span key={index}>
                  {' · '}
                  {index === 1 || !device
                    ? strings.connection.firmware(String(part))
                    : part}
                </span>
              ))}
        </div>
      </div>
    </div>
  );
};

export const TrackStatusChip = () => {
  const status = useEngineStore((state) => state.trackStatus);
  return (
    <div
      className={`track-status track-status--${status}`}
      style={{backgroundColor: trackStatusColor[status]}}
      role="status"
      aria-live="assertive"
    >
      {status === 'shortCircuit' && (
        <span className="track-status-icon" aria-hidden>
          ⚠
        </span>
      )}
      {strings.trackStatus[status]}
    </div>
  );
};

export const StopButton = () => {
  const stopKey = useSettingsStore((state) => state.settings.shortcuts.stop);
  return (
    <button
      type="button"
      className="stop-button"
      title={strings.stop.buttonHint(keyLabel(stopKey))}
      // Sent on pointer down for the fastest response; click covers the
      // keyboard (Enter/Space) and assistive technology.
      onPointerDown={() => sendCommand({type: 'emergencyStop'})}
      onClick={(event) => {
        if (event.detail === 0) {
          sendCommand({type: 'emergencyStop'});
        }
      }}
    >
      {strings.stop.button}
      <span className="stop-button-key">{keyLabel(stopKey)}</span>
    </button>
  );
};

export const PowerControls = () => {
  const status = useEngineStore((state) => state.trackStatus);
  const connected = useEngineStore(
    (state) => state.connection.state === 'connected',
  );
  const stopped =
    status === 'emergencyStop' ||
    status === 'powerOff' ||
    status === 'shortCircuit';
  return (
    <div className="power-controls">
      <button
        type="button"
        className="button"
        disabled={!connected}
        onClick={() => sendCommand({type: 'setTrackPower', on: true})}
      >
        {stopped ? strings.stop.resume : strings.stop.powerOn}
      </button>
      <button
        type="button"
        className="button"
        disabled={!connected}
        onClick={() => sendCommand({type: 'setTrackPower', on: false})}
      >
        {strings.stop.powerOff}
      </button>
    </div>
  );
};

export const StatusBar = () => (
  <header className="status-bar">
    <ConnectionIndicator />
    <div className="status-bar-centre">
      <TrackStatusChip />
      <StopButton />
    </div>
    <PowerControls />
  </header>
);
