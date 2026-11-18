// Feedback monitor (CARRY-5): every feedback input — configured in the layout
// or reported by the central unit — with its state, block and locos. For
// wiring and configuring detectors.
import {useMemo, useState} from 'react';
import {Project} from '../../../model/project';
import {feedbackInputKey, FeedbackInputRef} from '../../../shared/feedback';
import {strings} from '../../../shared/strings';
import {useEngineStore} from '../store/engineStore';

type Row = {
  key: string;
  input?: FeedbackInputRef;
  usedBy: string[];
};

export const FeedbackMonitor = ({project}: {project: Project}) => {
  const inputs = useEngineStore((state) => state.feedbackInputs);
  const sources = useEngineStore((state) => state.feedbackSources);
  const [occupiedOnly, setOccupiedOnly] = useState(false);

  const rows = useMemo(() => {
    const byKey = new Map<string, Row>();
    const use = (input: FeedbackInputRef, name: string) => {
      const key = feedbackInputKey(input);
      const row = byKey.get(key) ?? {key, input, usedBy: []};
      row.usedBy.push(name);
      byKey.set(key, row);
    };
    for (const block of project.blocks) {
      block.inputs.forEach((input) =>
        use(input, `${strings.kinds.block} ${block.name || block.id}`),
      );
    }
    for (const view of project.views) {
      for (const element of view.elements) {
        if (element.kind === 'turnout') {
          for (const [position, input] of Object.entries(
            element.positionFeedback ?? {},
          )) {
            use(
              input,
              `${element.name || strings.kinds.turnout} (${strings.positions[position] ?? position})`,
            );
          }
        }
      }
    }
    for (const key of Object.keys(inputs)) {
      if (!byKey.has(key)) {
        byKey.set(key, {key, usedBy: []});
      }
    }
    return [...byKey.values()].sort((a, b) =>
      a.key.localeCompare(b.key, 'en', {numeric: true}),
    );
  }, [project, inputs]);

  const shown = rows.filter(
    (row) => !occupiedOnly || inputs[row.key]?.occupied,
  );

  return (
    <section className="panel" aria-labelledby="feedback-title">
      <h2 id="feedback-title">{strings.operate.feedbackMonitor}</h2>
      <p className="muted small">
        {sources.length === 0
          ? strings.operate.noFeedbackSources
          : strings.operate.feedbackSources(
              sources
                .map((source) => strings.developer.feedbackSources[source])
                .join(', '),
            )}
      </p>
      <label className="choice">
        <input
          type="checkbox"
          checked={occupiedOnly}
          onChange={(event) => setOccupiedOnly(event.target.checked)}
        />
        {strings.developer.occupiedOnly}
      </label>
      {shown.length === 0 ? (
        <p className="muted">{strings.developer.noFeedback}</p>
      ) : (
        <table className="monitor-table">
          <thead>
            <tr>
              <th>{strings.operate.input}</th>
              <th>{strings.operate.state}</th>
              <th>{strings.operate.usedBy}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const state = inputs[row.key];
              return (
                <tr
                  key={row.key}
                  className={state?.occupied ? 'occupied' : undefined}
                >
                  <td>{strings.feedback.input(row.key)}</td>
                  <td>
                    {state === undefined
                      ? strings.operate.notReported
                      : state.occupied
                        ? `■ ${strings.feedback.occupied}`
                        : `□ ${strings.feedback.free}`}
                    {state &&
                      state.overload > 0 &&
                      ` · ${strings.feedback.overload(state.overload)}`}
                    {state &&
                      state.locos.length > 0 &&
                      ` · ${strings.feedback.locos(state.locos.map((loco) => loco.address))}`}
                  </td>
                  <td>
                    {row.usedBy.length > 0
                      ? row.usedBy.join(', ')
                      : strings.operate.notUsed}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
};
