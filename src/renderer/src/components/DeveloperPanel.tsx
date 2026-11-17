// Developer tools (Phase 1): switch and query single accessories by number,
// choose feedback sources, and see what the central unit reports. Everything
// goes through the engine's queue like any other accessory command.
import {
  fAdrToDccAddressAndPort,
  fAdrToRocoTurnoutNumber,
  rocoTurnoutNumberToFAdr,
} from '@lever/z21-protocol';
import {useState} from 'react';
import {AccessoryStateValue} from '../../../shared/engineApi';
import {FeedbackSource} from '../../../shared/feedback';
import {strings} from '../../../shared/strings';
import {sendCommand, useEngineStore} from '../store/engineStore';

const SOURCES: FeedbackSource[] = ['rbus', 'loconet', 'can'];

const describeAccessory = (state: AccessoryStateValue): string =>
  state.commanded !== null
    ? strings.accessoryState.waiting(state.commanded + 1)
    : strings.accessoryState[state.reported];

export const DeveloperPanel = () => {
  const [number, setNumber] = useState('1');
  const accessories = useEngineStore((state) => state.accessories);
  const queueLength = useEngineStore((state) => state.accessoryQueueLength);
  const sources = useEngineStore((state) => state.feedbackSources);
  const inputs = useEngineStore((state) => state.feedbackInputs);
  const connected = useEngineStore(
    (state) => state.connection.state === 'connected',
  );

  const turnoutNumber = Number(number);
  const valid =
    Number.isInteger(turnoutNumber) &&
    turnoutNumber >= 1 &&
    turnoutNumber <= 2048;
  const fAdr = valid ? rocoTurnoutNumberToFAdr(turnoutNumber) : undefined;
  const dcc = fAdr !== undefined ? fAdrToDccAddressAndPort(fAdr) : undefined;

  const occupied = Object.values(inputs)
    .filter((input) => input.occupied)
    .sort((a, b) => a.key.localeCompare(b.key, 'en', {numeric: true}));

  return (
    <section className="panel" aria-labelledby="developer-title">
      <h2 id="developer-title">{strings.developer.title}</h2>

      <fieldset>
        <label>
          {strings.developer.turnoutNumber}
          <input
            type="number"
            min={1}
            max={2048}
            value={number}
            onChange={(event) => setNumber(event.target.value)}
          />
        </label>
        <p className="muted">
          {dcc
            ? strings.developer.dccAddress(dcc.dccAddress, dcc.port)
            : strings.errors.invalidTurnoutNumber}
        </p>
        <div className="button-row">
          {([0, 1] as const).map((output) => (
            <button
              key={output}
              type="button"
              className="button"
              disabled={!connected || fAdr === undefined}
              onClick={() =>
                fAdr !== undefined &&
                sendCommand({type: 'switchAccessory', fAdr, output})
              }
            >
              {output === 0
                ? strings.developer.output1
                : strings.developer.output2}
            </button>
          ))}
          <button
            type="button"
            className="button"
            disabled={!connected || fAdr === undefined}
            onClick={() =>
              fAdr !== undefined && sendCommand({type: 'queryAccessory', fAdr})
            }
          >
            {strings.developer.askPosition}
          </button>
        </div>
        <p className="muted">{strings.developer.queue(queueLength)}</p>
      </fieldset>

      <h3>{strings.developer.accessoriesHeading}</h3>
      {Object.keys(accessories).length === 0 ? (
        <p className="muted">{strings.developer.noAccessories}</p>
      ) : (
        <ul className="plain-list">
          {Object.values(accessories).map((state) => (
            <li key={state.fAdr}>
              #{fAdrToRocoTurnoutNumber(state.fAdr)}: {describeAccessory(state)}
            </li>
          ))}
        </ul>
      )}

      <h3>{strings.developer.feedbackHeading}</h3>
      {SOURCES.map((source) => (
        <label key={source} className="choice">
          <input
            type="checkbox"
            checked={sources.includes(source)}
            onChange={(event) =>
              sendCommand({
                type: 'setFeedbackSources',
                sources: event.target.checked
                  ? [...sources, source]
                  : sources.filter((other) => other !== source),
              })
            }
          />
          {strings.developer.feedbackSources[source]}
        </label>
      ))}
      <p className="muted">
        {Object.keys(inputs).length === 0
          ? strings.developer.noFeedback
          : `${strings.developer.occupiedOnly}: ${occupied.length} / ${Object.keys(inputs).length}`}
      </p>
      <ul className="plain-list">
        {occupied.map((input) => (
          <li key={input.key}>
            {strings.feedback.input(input.key)}: {strings.feedback.occupied}
            {input.overload > 0 &&
              ` · ${strings.feedback.overload(input.overload)}`}
            {input.locos.length > 0 &&
              ` · ${strings.feedback.locos(input.locos.map((loco) => loco.address))}`}
          </li>
        ))}
      </ul>
    </section>
  );
};
