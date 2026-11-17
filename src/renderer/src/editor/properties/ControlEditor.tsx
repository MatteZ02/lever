// How an accessory is driven (EDT-4): not connected, DCC addresses with
// inversion, pulse and output mapping, or an extended accessory address.
import {fAdrToDccAddressAndPort} from '@lever/z21-protocol';
import {useState} from 'react';
import {addressToFAdr} from '../../../../model/accessoryCommands';
import {CentralUnitProfile} from '../../../../model/centralUnitProfile';
import {AccessoryControl, OutputRef} from '../../../../model/elements';
import {strings} from '../../../../shared/strings';
import {CheckField, NumberField, Section, SelectField} from './fields';

type Props = {
  control: AccessoryControl;
  onChange: (control: AccessoryControl) => void;
  profile: CentralUnitProfile;
  // Number of addresses with the default mapping; for double slips a
  // choice between 1 and 2.
  addressCount: number;
  addressCountChoices?: number[];
  // Positions or aspects, for the output map and extended values.
  states: {id: string; label: string}[];
  defaultOutputMap: (addressCount: number) => Record<string, OutputRef[]>;
  allowExtended: boolean;
};

export const ControlEditor = ({
  control,
  onChange,
  profile,
  addressCount,
  addressCountChoices,
  states,
  defaultOutputMap,
  allowExtended,
}: Props) => {
  const kindOptions = [
    {value: 'manual' as const, label: strings.properties.controlManual},
    {value: 'dcc' as const, label: strings.properties.controlDcc},
    ...(allowExtended
      ? [
          {
            value: 'extended' as const,
            label: strings.properties.controlExtended,
          },
        ]
      : []),
  ];
  const changeKind = (kind: AccessoryControl['kind']) => {
    if (kind === control.kind) {
      return;
    }
    onChange(
      kind === 'manual'
        ? {kind}
        : kind === 'dcc'
          ? {kind, addresses: [], invert: false}
          : {kind, address: 1},
    );
  };

  return (
    <Section title={strings.properties.control}>
      <SelectField
        label={strings.properties.control}
        value={control.kind}
        options={kindOptions}
        onCommit={changeKind}
      />
      {control.kind === 'dcc' && (
        <DccFields
          control={control}
          onChange={onChange}
          profile={profile}
          addressCount={addressCount}
          addressCountChoices={addressCountChoices}
          states={states}
          defaultOutputMap={defaultOutputMap}
        />
      )}
      {control.kind === 'extended' && (
        <>
          <NumberField
            label={strings.properties.extendedAddress}
            value={control.address}
            min={1}
            max={2044}
            onCommit={(address) =>
              address !== undefined && onChange({...control, address})
            }
          />
          {states.map((state) => (
            <NumberField
              key={state.id}
              label={`${strings.properties.extendedValue}: ${state.label}`}
              value={control.valueMap?.[state.id]}
              min={0}
              max={255}
              optional
              onCommit={(value) => {
                const valueMap = {...control.valueMap};
                if (value === undefined) {
                  delete valueMap[state.id];
                } else {
                  valueMap[state.id] = value;
                }
                onChange({...control, valueMap});
              }}
            />
          ))}
        </>
      )}
    </Section>
  );
};

const DccFields = ({
  control,
  onChange,
  profile,
  addressCount,
  addressCountChoices,
  states,
  defaultOutputMap,
}: Omit<Props, 'control' | 'allowExtended'> & {
  control: Extract<AccessoryControl, {kind: 'dcc'}>;
}) => {
  // A double slip's choice of 1 or 2 addresses is kept here until both are
  // filled in (the file stores only real addresses).
  const [chosenCount, setChosenCount] = useState(
    Math.max(addressCount, control.addresses.length),
  );
  const count = addressCountChoices
    ? chosenCount
    : Math.max(addressCount, control.addresses.length);
  const outputMap = control.outputMap ?? defaultOutputMap(count);
  const setAddress = (index: number, address: number | undefined) => {
    const addresses = [...control.addresses];
    if (address === undefined) {
      addresses.splice(index);
    } else {
      addresses[index] = address;
    }
    onChange({...control, addresses: addresses.filter((a) => a !== undefined)});
  };
  return (
    <>
      {addressCountChoices && (
        <SelectField
          label={strings.properties.addressCount}
          value={String(count)}
          options={addressCountChoices.map((n) => ({
            value: String(n),
            label: String(n),
          }))}
          onCommit={(value) => {
            setChosenCount(Number(value));
            onChange({
              ...control,
              addresses: control.addresses.slice(0, Number(value)),
              outputMap: undefined,
            });
          }}
        />
      )}
      {Array.from({length: count}, (_, index) => {
        const address = control.addresses[index];
        const fAdr =
          address === undefined ? undefined : addressToFAdr(address, profile);
        const dcc =
          fAdr === undefined ? undefined : fAdrToDccAddressAndPort(fAdr);
        return (
          <NumberField
            key={index}
            label={strings.properties.address(index)}
            value={address}
            min={1}
            max={2048}
            optional
            help={
              dcc
                ? strings.properties.decoder(dcc.dccAddress, dcc.port)
                : undefined
            }
            onCommit={(value) => setAddress(index, value)}
          />
        );
      })}
      <CheckField
        label={strings.properties.invert}
        value={control.invert}
        onCommit={(invert) => onChange({...control, invert})}
      />
      <NumberField
        label={strings.properties.pulse}
        value={control.pulseMs}
        min={20}
        max={5000}
        optional
        placeholder={strings.properties.pulseDefault(profile.pulseMs)}
        onCommit={(pulseMs) => onChange({...control, pulseMs})}
      />
      <details className="output-map">
        <summary>{strings.properties.outputMap}</summary>
        {states.map((state) => (
          <div key={state.id} className="output-map-row">
            <span>{state.label}</span>
            {Array.from({length: count}, (_, addressIndex) => {
              const current = outputMap[state.id]?.find(
                (ref) => ref.address === addressIndex,
              );
              return (
                <select
                  key={addressIndex}
                  aria-label={`${state.label}, ${strings.properties.address(addressIndex)}`}
                  value={current ? String(current.output) : ''}
                  onChange={(event) => {
                    const refs = (outputMap[state.id] ?? []).filter(
                      (ref) => ref.address !== addressIndex,
                    );
                    if (event.target.value) {
                      refs.push({
                        address: addressIndex,
                        output: Number(event.target.value) as 1 | 2,
                      });
                      refs.sort((a, b) => a.address - b.address);
                    }
                    onChange({
                      ...control,
                      outputMap: {...outputMap, [state.id]: refs},
                    });
                  }}
                >
                  <option value="">{`${addressIndex + 1}: –`}</option>
                  <option value="1">{`${addressIndex + 1}: ${strings.properties.output(1)}`}</option>
                  <option value="2">{`${addressIndex + 1}: ${strings.properties.output(2)}`}</option>
                </select>
              );
            })}
          </div>
        ))}
        {control.outputMap && (
          <button
            type="button"
            className="button button--small"
            onClick={() => onChange({...control, outputMap: undefined})}
          >
            {strings.properties.outputMapReset}
          </button>
        )}
      </details>
    </>
  );
};
