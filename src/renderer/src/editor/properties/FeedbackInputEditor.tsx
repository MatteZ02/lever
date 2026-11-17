// Edits one feedback input reference (R-Bus module/input, LocoNet address,
// CAN module/port), independent of the bus (BLK-1).
import {FeedbackInputRef} from '../../../../shared/feedback';
import {strings} from '../../../../shared/strings';
import {NumberField, SelectField} from './fields';

const DEFAULTS: Record<FeedbackInputRef['source'], FeedbackInputRef> = {
  rbus: {source: 'rbus', module: 1, input: 1},
  loconet: {source: 'loconet', address: 1},
  can: {source: 'can', module: 1, port: 0},
};

export const newFeedbackInput = (source: FeedbackInputRef['source']) =>
  DEFAULTS[source];

export const FeedbackInputEditor = ({
  input,
  onChange,
}: {
  input: FeedbackInputRef;
  onChange: (input: FeedbackInputRef) => void;
}) => (
  <div className="feedback-input">
    <SelectField
      label={strings.properties.source}
      value={input.source}
      options={(['rbus', 'loconet', 'can'] as const).map((source) => ({
        value: source,
        label: strings.developer.feedbackSources[source],
      }))}
      onCommit={(source) => onChange(DEFAULTS[source])}
    />
    {input.source === 'rbus' && (
      <>
        <NumberField
          label={strings.properties.module}
          value={input.module}
          min={1}
          max={20}
          onCommit={(module) =>
            module !== undefined && onChange({...input, module})
          }
        />
        <NumberField
          label={strings.properties.input}
          value={input.input}
          min={1}
          max={8}
          onCommit={(value) =>
            value !== undefined && onChange({...input, input: value})
          }
        />
      </>
    )}
    {input.source === 'loconet' && (
      <NumberField
        label={strings.properties.feedbackAddress}
        value={input.address}
        min={0}
        max={65535}
        onCommit={(address) =>
          address !== undefined && onChange({...input, address})
        }
      />
    )}
    {input.source === 'can' && (
      <>
        <NumberField
          label={strings.properties.module}
          value={input.module}
          min={0}
          max={65535}
          onCommit={(module) =>
            module !== undefined && onChange({...input, module})
          }
        />
        <NumberField
          label={strings.properties.port}
          value={input.port}
          min={0}
          max={7}
          onCommit={(port) => port !== undefined && onChange({...input, port})}
        />
      </>
    )}
  </div>
);
