// Editor test mode (EDT-7): set turnouts to each position and signals to each
// aspect, to check addresses and output mapping while configuring. Commands
// are built by the model (accessoryCommands.ts) and go through the engine's
// normal queue (LOAD-2).
import {
  accessoryButtonCommands,
  CommandPlan,
  signalAspectCommands,
  turnoutCommands,
} from '../../../model/accessoryCommands';
import {DiagramElement} from '../../../model/elements';
import {turnoutPositions} from '../../../model/ports';
import {Project} from '../../../model/project';
import {findSignalType} from '../../../model/signalTypes';
import {strings} from '../../../shared/strings';
import {sendCommand} from '../store/engineStore';

// Sends a plan. Returns a message for the operator.
export const sendPlan = (plan: CommandPlan): string => {
  switch (plan.kind) {
    case 'manual':
      return strings.test.manual;
    case 'incomplete':
      return strings.test.incomplete[plan.reason];
    case 'extended':
      sendCommand({
        type: 'setExtAccessory',
        rawAddress: plan.rawAddress,
        value: plan.value,
      });
      return strings.test.sent;
    case 'commands':
      for (const command of plan.commands) {
        sendCommand({
          type: 'switchAccessory',
          fAdr: command.fAdr,
          output: command.output,
          pulseMs: command.pulseMs,
          queued: command.queued,
        });
      }
      return strings.test.sent;
  }
};

export const testTurnoutPosition = (
  project: Project,
  element: DiagramElement,
  position: string,
): string =>
  element.kind === 'turnout'
    ? `${element.name || strings.kinds.turnout}: ${strings.positions[position] ?? position} — ${sendPlan(
        turnoutCommands(element, position, project.settings.centralUnit),
      )}`
    : '';

export const testSignalAspect = (
  project: Project,
  element: DiagramElement,
  aspectId: string,
): string => {
  if (element.kind !== 'signal') {
    return '';
  }
  const type = findSignalType(project.signalTypes, element.signalTypeId);
  if (!type) {
    return strings.test.incomplete.unknownPosition;
  }
  const aspect = type.aspects.find((candidate) => candidate.id === aspectId);
  return `${element.name || strings.kinds.signal}: ${aspect?.name ?? aspectId} — ${sendPlan(
    signalAspectCommands(element, type, aspectId, project.settings.centralUnit),
  )}`;
};

export const testAccessory = (
  project: Project,
  element: DiagramElement,
  on: boolean,
): string =>
  element.kind === 'accessory'
    ? `${element.name || strings.kinds.accessory}: ${on ? strings.test.on : strings.test.off} — ${sendPlan(
        accessoryButtonCommands(element, on, project.settings.centralUnit),
      )}`
    : '';

// Clicking an element in test mode steps through its positions/aspects.
const lastTested = new Map<string, number>();

export const testNext = (project: Project, element: DiagramElement): string => {
  const next = (count: number) => {
    const index = ((lastTested.get(element.id) ?? -1) + 1) % count;
    lastTested.set(element.id, index);
    return index;
  };
  switch (element.kind) {
    case 'turnout': {
      const positions = turnoutPositions(element);
      return positions.length === 0
        ? ''
        : testTurnoutPosition(
            project,
            element,
            positions[next(positions.length)],
          );
    }
    case 'signal': {
      const type = findSignalType(project.signalTypes, element.signalTypeId);
      return type
        ? testSignalAspect(
            project,
            element,
            type.aspects[next(type.aspects.length)].id,
          )
        : strings.test.incomplete.unknownPosition;
    }
    case 'accessory':
      return element.buttonType === 'momentary'
        ? testAccessory(project, element, true)
        : testAccessory(project, element, next(2) === 0);
    default:
      return '';
  }
};
