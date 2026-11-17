// Debug protocol log (CARRY-5): sent (>>) and received (<<) datasets in hex,
// with timestamps.
import {strings} from '../../../shared/strings';
import {useEngineStore} from '../store/engineStore';

const MARKER = {out: '>>', in: '<<', info: '--'} as const;

const formatTime = (time: number) => {
  const date = new Date(time);
  const pad = (value: number, length = 2) =>
    String(value).padStart(length, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

export const ProtocolLog = () => {
  const entries = useEngineStore((state) => state.logEntries);
  const clearLog = useEngineStore((state) => state.clearLog);

  return (
    <section className="panel protocol-log" aria-labelledby="log-title">
      <div className="panel-header">
        <h2 id="log-title">{strings.protocolLog.title}</h2>
        <button type="button" className="button" onClick={clearLog}>
          {strings.protocolLog.clear}
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="muted">{strings.protocolLog.empty}</p>
      ) : (
        <ol className="log-lines">
          {entries.map((entry, index) => (
            <li key={index} className={`log-line log-line--${entry.direction}`}>
              <span className="log-time">{formatTime(entry.time)}</span>{' '}
              {MARKER[entry.direction]} {entry.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
