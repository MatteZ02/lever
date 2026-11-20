// Properties of the selected element (EDT-4), with test buttons (EDT-7).
import {
  defaultTurnoutOutputMap,
  requiredAddressCount,
} from '../../../../model/accessoryCommands';
import {
  allConnectors,
  ConnectorInfo,
  pairConnectors,
  partnerOf,
  unpairConnector,
} from '../../../../model/connectors';
import {
  deleteElements,
  replaceElement,
  rotateElements,
} from '../../../../model/editing';
import {
  DiagramElement,
  GenericAccessory,
  Signal,
  StationConnector,
  TextColor,
  Track,
  TURNOUT_TYPES,
  Turnout,
  TurnoutType,
} from '../../../../model/elements';
import {opposite} from '../../../../model/geometry';
import {turnoutPositions} from '../../../../model/ports';
import {Block, newId, Project, StationView} from '../../../../model/project';
import {allSignalTypes, findSignalType} from '../../../../model/signalTypes';
import {strings} from '../../../../shared/strings';
import {COLOR_PRESETS} from '../../../theme';
import {ColorPicker} from '../../components/ColorPicker';
import {useEngineStore} from '../../store/engineStore';
import {edit, setHint, useProjectStore} from '../../store/projectStore';
import {
  testAccessory,
  testSignalAspect,
  testTurnoutPosition,
} from '../testActions';
import {ControlEditor} from './ControlEditor';
import {FeedbackInputEditor, newFeedbackInput} from './FeedbackInputEditor';
import {NumberField, Section, SelectField, TextField} from './fields';
import {ProjectProperties} from './ProjectProperties';

const update = (element: DiagramElement) =>
  edit((p) => replaceElement(p, element));

export const PropertiesPanel = ({
  project,
  view,
}: {
  project: Project;
  view?: StationView;
}) => {
  const selection = useProjectStore((state) => state.selection);
  const elements =
    view?.elements.filter((element) => selection.includes(element.id)) ?? [];

  return (
    <aside className="properties" aria-label={strings.properties.title}>
      <h2>{strings.properties.title}</h2>
      {elements.length === 0 && (
        <ProjectProperties project={project} view={view} />
      )}
      {elements.length > 1 && view && (
        <>
          <p>{strings.properties.selectedCount(elements.length)}</p>
          <SelectionArea project={project} view={view} elements={elements} />
          <SelectionButtons viewId={view.id} ids={selection} />
        </>
      )}
      {elements.length === 1 && view && (
        <ElementProperties
          key={elements[0].id}
          project={project}
          view={view}
          element={elements[0]}
        />
      )}
    </aside>
  );
};

// Puts every selected track, turnout and signal into one area (MIX-1).
const SelectionArea = ({
  project,
  view,
  elements,
}: {
  project: Project;
  view: StationView;
  elements: DiagramElement[];
}) => {
  const areaElements = elements.filter((element) =>
    ['track', 'turnout', 'signal'].includes(element.kind),
  );
  if (areaElements.length === 0) {
    return null;
  }
  const areaIds = new Set(areaElements.map((element) => element.areaId ?? ''));
  const viewArea = project.areas.find((area) => area.id === view.areaId);
  return (
    <SelectField
      label={strings.properties.area}
      value={areaIds.size === 1 ? [...areaIds][0] : '__mixed'}
      options={[
        ...(areaIds.size > 1
          ? [{value: '__mixed', label: strings.properties.mixedAreas}]
          : []),
        {
          value: '',
          label: strings.properties.areaDefault(
            viewArea?.name ?? view.name,
            viewArea?.level ?? 1,
          ),
        },
        ...project.areas
          .filter((area) => area.id !== view.areaId)
          .map((area) => ({
            value: area.id,
            label: `${area.name} (${strings.properties.level(area.level)})`,
          })),
      ]}
      onCommit={(areaId) => {
        if (areaId === '__mixed') {
          return;
        }
        edit((p) =>
          areaElements.reduce(
            (next, element) =>
              replaceElement(next, {...element, areaId: areaId || undefined}),
            p,
          ),
        );
      }}
    />
  );
};

const SelectionButtons = ({viewId, ids}: {viewId: string; ids: string[]}) => (
  <div className="button-row">
    <button
      type="button"
      className="button"
      onClick={() => edit((p) => rotateElements(p, viewId, ids))}
    >
      {strings.editor.rotate}
    </button>
    <button
      type="button"
      className="button"
      onClick={() => edit((p) => deleteElements(p, ids))}
    >
      {strings.editor.delete}
    </button>
  </div>
);

// FULL-3: which exit (in another station, or this one) this exit leads to.
// Pairing is optional; choosing a partner unpairs both sides' old partners.
const ConnectorPairing = ({
  project,
  connector,
}: {
  project: Project;
  connector: StationConnector;
}) => {
  const partner = partnerOf(project, connector);
  const all = allConnectors(project);
  const ownView = all.find(
    (info) => info.connector.id === connector.id,
  )?.viewId;
  // Other stations first: that is where the other end usually is.
  const others = [
    ...all.filter((info) => info.viewId !== ownView),
    ...all.filter(
      (info) => info.viewId === ownView && info.connector.id !== connector.id,
    ),
  ];
  const describe = (info: ConnectorInfo) => {
    const {at, direction} = info.connector;
    const name =
      info.connector.name ||
      strings.properties.unnamedExitAt(
        strings.directionArrows[direction],
        at.x,
        at.y,
      );
    const taken =
      info.connector.pairedWith &&
      info.connector.pairedWith.connectorId !== connector.id;
    return `${info.viewName} · ${name}${taken ? ` (${strings.properties.linkedElsewhere})` : ''}`;
  };
  return (
    <>
      <SelectField
        label={strings.properties.pairedWith}
        value={partner?.connector.id ?? ''}
        options={[
          {value: '', label: strings.properties.notPaired},
          ...others.map((info) => ({
            value: info.connector.id,
            label: describe(info),
          })),
        ]}
        onCommit={(otherId) =>
          edit((p) =>
            otherId
              ? pairConnectors(p, connector.id, otherId)
              : unpairConnector(p, connector.id),
          )
        }
      />
      <p className="muted small">{strings.properties.pairingHelp}</p>
    </>
  );
};

const ElementProperties = ({
  project,
  view,
  element,
}: {
  project: Project;
  view: StationView;
  element: DiagramElement;
}) => {
  const viewArea = project.areas.find((area) => area.id === view.areaId);
  const hasArea = ['track', 'turnout', 'signal'].includes(element.kind);
  return (
    <>
      <p className="properties-kind">
        {element.kind === 'turnout'
          ? strings.turnoutTypes[element.type]
          : strings.kinds[element.kind]}
      </p>
      {element.kind !== 'label' && element.kind !== 'platform' && (
        <TextField
          label={strings.properties.name}
          value={element.name}
          onCommit={(name) => update({...element, name})}
        />
      )}
      {hasArea && (
        <SelectField
          label={strings.properties.area}
          value={element.areaId ?? ''}
          options={[
            {
              value: '',
              label: strings.properties.areaDefault(
                viewArea?.name ?? view.name,
                viewArea?.level ?? 1,
              ),
            },
            ...project.areas
              .filter((area) => area.id !== view.areaId)
              .map((area) => ({
                value: area.id,
                label: `${area.name} (${strings.properties.level(area.level)})`,
              })),
          ]}
          onCommit={(areaId) =>
            update({...element, areaId: areaId || undefined})
          }
        />
      )}
      {element.kind === 'track' && (
        <TrackProperties project={project} track={element} />
      )}
      {element.kind === 'turnout' && (
        <TurnoutProperties project={project} turnout={element} />
      )}
      {element.kind === 'signal' && (
        <SignalProperties project={project} signal={element} />
      )}
      {element.kind === 'accessory' && (
        <AccessoryProperties project={project} accessory={element} />
      )}
      {element.kind === 'connector' && (
        <>
          <TextColorField
            value={element.textColor}
            onCommit={(textColor) => update({...element, textColor})}
          />
          <ConnectorPairing project={project} connector={element} />
        </>
      )}
      {element.kind === 'label' && (
        <>
          <TextField
            label={strings.properties.text}
            value={element.text}
            onCommit={(text) => update({...element, text})}
          />
          <SelectField
            label={strings.properties.size}
            value={element.size}
            options={(['small', 'normal', 'large'] as const).map((size) => ({
              value: size,
              label: strings.properties.sizes[size],
            }))}
            onCommit={(size) => update({...element, size})}
          />
          <TextColorField
            value={element.textColor}
            onCommit={(textColor) => update({...element, textColor})}
          />
        </>
      )}
      {element.kind === 'platform' && (
        <>
          <NumberField
            label={strings.properties.width}
            value={element.width}
            min={1}
            max={500}
            onCommit={(width) => width && update({...element, width})}
          />
          <NumberField
            label={strings.properties.height}
            value={element.height}
            min={1}
            max={100}
            onCommit={(height) => height && update({...element, height})}
          />
        </>
      )}
      <SelectionButtons viewId={view.id} ids={[element.id]} />
    </>
  );
};

// --- track and blocks ------------------------------------------------------------

const TrackProperties = ({
  project,
  track,
}: {
  project: Project;
  track: Track;
}) => {
  const block = project.blocks.find(
    (candidate) => candidate.id === track.blockId,
  );
  const updateBlock = (changes: Partial<Block>) =>
    block &&
    edit((p) => ({
      ...p,
      blocks: p.blocks.map((b) => (b.id === block.id ? {...b, ...changes} : b)),
    }));
  return (
    <Section title={strings.properties.block}>
      <SelectField
        label={strings.properties.block}
        value={track.blockId ?? ''}
        options={[
          {value: '', label: strings.properties.none},
          ...project.blocks.map((b) => ({value: b.id, label: b.name || b.id})),
          {value: '__new', label: `+ ${strings.properties.newBlock}`},
        ]}
        onCommit={(value) => {
          if (value === '__new') {
            const created: Block = {
              id: newId('block'),
              name: track.name,
              inputs: [],
            };
            edit((p) =>
              replaceElement(
                {...p, blocks: [...p.blocks, created]},
                {...track, blockId: created.id},
              ),
            );
          } else {
            update({...track, blockId: value || undefined});
          }
        }}
      />
      {block && (
        <>
          <TextField
            label={strings.properties.blockName}
            value={block.name}
            onCommit={(name) => updateBlock({name})}
          />
          <span className="field-label">
            {strings.properties.feedbackInputs}
          </span>
          {block.inputs.map((input, index) => (
            <div key={index} className="feedback-input-row">
              <FeedbackInputEditor
                input={input}
                onChange={(changed) =>
                  updateBlock({
                    inputs: block.inputs.map((old, i) =>
                      i === index ? changed : old,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="button button--small"
                onClick={() =>
                  updateBlock({
                    inputs: block.inputs.filter((_, i) => i !== index),
                  })
                }
              >
                {strings.properties.removeInput}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button button--small"
            onClick={() =>
              updateBlock({inputs: [...block.inputs, newFeedbackInput('rbus')]})
            }
          >
            {strings.properties.addInput}
          </button>
          <NumberField
            label={strings.properties.releaseDelay}
            value={block.releaseDelayMs}
            min={0}
            max={60000}
            optional
            placeholder={`${project.settings.blockReleaseDelayMs}`}
            onCommit={(releaseDelayMs) => updateBlock({releaseDelayMs})}
          />
        </>
      )}
    </Section>
  );
};

// --- turnouts ---------------------------------------------------------------

const TurnoutProperties = ({
  project,
  turnout,
}: {
  project: Project;
  turnout: Turnout;
}) => {
  const profile = project.settings.centralUnit;
  const positions = turnoutPositions(turnout);
  const states = positions.map((position) => ({
    id: position,
    label: strings.positions[position] ?? position,
  }));
  return (
    <>
      <SelectField
        label={strings.properties.type}
        value={turnout.type}
        options={TURNOUT_TYPES.map((type) => ({
          value: type,
          label: strings.turnoutTypes[type],
        }))}
        onCommit={(type: TurnoutType) =>
          update({
            ...turnout,
            type,
            control:
              turnout.control.kind === 'dcc'
                ? {...turnout.control, outputMap: undefined}
                : turnout.control,
            positionFeedback: undefined,
          })
        }
      />
      {positions.length > 0 && (
        <>
          <ControlEditor
            control={turnout.control}
            onChange={(control) => update({...turnout, control})}
            profile={profile}
            addressCount={requiredAddressCount(turnout.type, turnout.control)}
            addressCountChoices={
              turnout.type === 'doubleSlip' ? [1, 2] : undefined
            }
            states={states}
            defaultOutputMap={(count) =>
              defaultTurnoutOutputMap(turnout.type, count, profile)
            }
            allowExtended
          />
          <TestButtons
            states={states}
            onTest={(position) =>
              setHint(testTurnoutPosition(project, turnout, position))
            }
          />
          <details>
            <summary>{strings.properties.positionFeedback}</summary>
            {states.map((state) => {
              const input = turnout.positionFeedback?.[state.id];
              return (
                <div key={state.id} className="feedback-input-row">
                  <span className="field-label">{state.label}</span>
                  {input ? (
                    <>
                      <FeedbackInputEditor
                        input={input}
                        onChange={(changed) =>
                          update({
                            ...turnout,
                            positionFeedback: {
                              ...turnout.positionFeedback,
                              [state.id]: changed,
                            },
                          })
                        }
                      />
                      <button
                        type="button"
                        className="button button--small"
                        onClick={() => {
                          const positionFeedback = {
                            ...turnout.positionFeedback,
                          };
                          delete positionFeedback[state.id];
                          update({...turnout, positionFeedback});
                        }}
                      >
                        {strings.properties.removeInput}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button button--small"
                      onClick={() =>
                        update({
                          ...turnout,
                          positionFeedback: {
                            ...turnout.positionFeedback,
                            [state.id]: newFeedbackInput('rbus'),
                          },
                        })
                      }
                    >
                      {strings.properties.addInput}
                    </button>
                  )}
                </div>
              );
            })}
          </details>
        </>
      )}
    </>
  );
};

// --- signals ----------------------------------------------------------------

const SignalProperties = ({
  project,
  signal,
}: {
  project: Project;
  signal: Signal;
}) => {
  const type = findSignalType(project.signalTypes, signal.signalTypeId);
  const mainSignals = project.views.flatMap((view) =>
    view.elements.filter(
      (element): element is Signal =>
        element.kind === 'signal' &&
        element.id !== signal.id &&
        findSignalType(project.signalTypes, element.signalTypeId)?.category ===
          'main',
    ),
  );
  const states =
    type?.aspects.map((aspect) => ({id: aspect.id, label: aspect.name})) ?? [];
  return (
    <>
      <SelectField
        label={strings.properties.signalType}
        value={signal.signalTypeId}
        options={allSignalTypes(project.signalTypes).map((t) => ({
          value: t.id,
          label: t.name,
        }))}
        onCommit={(signalTypeId) =>
          update({
            ...signal,
            signalTypeId,
            control:
              signal.control.kind === 'dcc'
                ? {...signal.control, outputMap: undefined}
                : signal.control,
          })
        }
      />
      <div className="button-row">
        <button
          type="button"
          className="button"
          onClick={() => update({...signal, facing: opposite(signal.facing)})}
        >
          {strings.properties.reverse}
        </button>
      </div>
      <SelectField
        label={strings.properties.side}
        value={signal.side}
        options={[
          {value: 'right', label: strings.properties.sideRight},
          {value: 'left', label: strings.properties.sideLeft},
        ]}
        onCommit={(side) => update({...signal, side})}
      />
      {type?.category === 'distant' && (
        <SelectField
          label={strings.properties.distantFor}
          value={signal.distantFor ?? ''}
          options={[
            {value: '', label: strings.properties.none},
            ...mainSignals.map((main) => ({
              value: main.id,
              label: main.name || main.id,
            })),
          ]}
          onCommit={(distantFor) =>
            update({...signal, distantFor: distantFor || undefined})
          }
        />
      )}
      {type && (
        <>
          <ControlEditor
            control={signal.control}
            onChange={(control) => update({...signal, control})}
            profile={project.settings.centralUnit}
            addressCount={type.addressCount}
            states={states}
            defaultOutputMap={() =>
              Object.fromEntries(
                type.aspects.map((aspect) => [aspect.id, aspect.outputs]),
              )
            }
            allowExtended
          />
          <TestButtons
            states={states}
            onTest={(aspect) =>
              setHint(testSignalAspect(project, signal, aspect))
            }
          />
        </>
      )}
    </>
  );
};

// --- generic accessories -----------------------------------------------------------

const AccessoryProperties = ({
  project,
  accessory,
}: {
  project: Project;
  accessory: GenericAccessory;
}) => (
  <>
    <SelectField
      label={strings.properties.role}
      value={accessory.role}
      options={(['uncoupler', 'light', 'other'] as const).map((role) => ({
        value: role,
        label: strings.properties.roles[role],
      }))}
      onCommit={(role) => update({...accessory, role})}
    />
    <SelectField
      label={strings.properties.buttonType}
      value={accessory.buttonType}
      options={[
        {value: 'momentary', label: strings.properties.momentary},
        {value: 'toggle', label: strings.properties.toggle},
      ]}
      onCommit={(buttonType) => update({...accessory, buttonType})}
    />
    <ControlEditor
      control={accessory.control}
      onChange={(control) => update({...accessory, control})}
      profile={project.settings.centralUnit}
      addressCount={1}
      states={[
        {id: 'on', label: strings.test.on},
        {id: 'off', label: strings.test.off},
      ]}
      defaultOutputMap={() => ({
        on: [{address: 0, output: 2}],
        off: [{address: 0, output: 1}],
      })}
      allowExtended={false}
    />
    <TestButtons
      states={
        accessory.buttonType === 'momentary'
          ? [{id: 'on', label: strings.test.on}]
          : [
              {id: 'on', label: strings.test.on},
              {id: 'off', label: strings.test.off},
            ]
      }
      onTest={(state) =>
        setHint(testAccessory(project, accessory, state === 'on'))
      }
    />
  </>
);

const TestButtons = ({
  states,
  onTest,
}: {
  states: {id: string; label: string}[];
  onTest: (id: string) => void;
}) => {
  const connected = useEngineStore(
    (state) => state.connection.state === 'connected',
  );
  return (
    <Section title={strings.properties.test}>
      <p className="muted small">{strings.properties.testHint}</p>
      <div className="button-row">
        {states.map((state) => (
          <button
            key={state.id}
            type="button"
            className="button"
            disabled={!connected}
            onClick={() => onTest(state.id)}
          >
            {state.label}
          </button>
        ))}
      </div>
    </Section>
  );
};

// Text colour of a label or exit name (undefined = the usual colour).
const TextColorField = ({
  value,
  onCommit,
}: {
  value: TextColor | undefined;
  onCommit: (value: TextColor | undefined) => void;
}) => (
  <ColorPicker
    label={strings.properties.textColor}
    value={value}
    noneLabel={strings.properties.textColorDefault}
    presets={COLOR_PRESETS.map((preset) => ({
      color: preset.color,
      name: strings.properties.textColorPresets[preset.name],
    }))}
    onCommit={onCommit}
  />
);
