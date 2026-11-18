// The interlocking core (section 5, layer 4): live state of turnouts,
// signals, accessories and blocks, reconciled with what the central unit
// reports (ARC-2). Pure and deterministic: time and timers are injected, and
// accessory commands leave through `enqueue` (the engine's queue).
//
// It never claims more than it knows (MULTI-3): positions are worked out
// from reported outputs, start-up reports are marked as such, and a command
// counts only when a matching report arrives.
import {TurnoutInfoPosition} from '@lever/z21-protocol';
import {AccessoryJob} from '../connection/AccessoryQueue';
import {
  accessoryButtonCommands,
  CommandPlan,
  ResolvedOutput,
  resolveOutputs,
  signalAspectCommands,
  stateOutputs,
  turnoutCommands,
} from '../model/accessoryCommands';
import {levelOf} from '../model/areas';
import {
  DiagramElement,
  GenericAccessory,
  Signal,
  Turnout,
} from '../model/elements';
import {turnoutPositions} from '../model/ports';
import {Block, Project, StationView} from '../model/project';
import {OutputReport, reconstructState} from '../model/reconstruct';
import {findSignalType, SignalType} from '../model/signalTypes';
import {
  DetectedLoco,
  feedbackInputKey,
  FeedbackInputState,
} from '../shared/feedback';
import {
  AccessoryLive,
  BlockLive,
  LayoutLive,
  LayoutLiveChanges,
  SignalLive,
  TurnoutLive,
} from '../shared/liveState';
import {checkCommand, ElementCommand, RefusalReason} from './levels';

export type InterlockingNotice =
  | {code: 'refused'; elementId: string; reason: RefusalReason}
  | {code: 'incomplete'; elementId: string; reason: string}
  | {code: 'failed'; elementId: string}
  | {code: 'labelNeedsFeedback'; blockId: string};

export type InterlockingDeps = {
  enqueue: (job: AccessoryJob) => void;
  // Returns a function that cancels the timer.
  schedule: (ms: number, run: () => void) => () => void;
  onChange: (changes: LayoutLiveChanges) => void;
  onNotice: (notice: InterlockingNotice) => void;
};

type ControlledInfo = {
  element: Turnout | Signal | GenericAccessory;
  view: StationView;
  signalType?: SignalType;
  // Outputs per position/aspect/on-off (DCC elements).
  states: Map<string, ResolvedOutput[]>;
};

type Pending = {
  target: string;
  attempts: number;
  cancel?: () => void;
};

const reportToOutput = (position: TurnoutInfoPosition): OutputReport =>
  position === 'output1' ? 0 : position === 'output2' ? 1 : 'unknown';

export class Interlocking {
  private project: Project | null = null;
  private infos = new Map<string, ControlledInfo>();
  private blocks = new Map<string, Block>();
  private byFAdr = new Map<number, string[]>();
  private byExtRaw = new Map<number, string[]>();
  private blocksByInput = new Map<string, string[]>();
  private turnoutsByInput = new Map<string, string[]>();

  private outputs = new Map<number, OutputReport>();
  private extValues = new Map<number, number | undefined>();
  private feedback = new Map<string, FeedbackInputState>();
  // Elements seen switching in this session (any client).
  private seenSwitching = new Set<string>();
  private pending = new Map<string, Pending>();
  private releaseTimers = new Map<string, () => void>();

  private live: LayoutLive = {
    turnouts: {},
    signals: {},
    accessories: {},
    blocks: {},
  };
  private changes: LayoutLiveChanges = {};

  constructor(private readonly deps: InterlockingDeps) {}

  state(): LayoutLive {
    return this.live;
  }

  // Every function address in the layout (start-up query, LOAD-3).
  addresses(): number[] {
    return [...this.byFAdr.keys()].sort((a, b) => a - b);
  }

  // A new or edited project. Live state of elements that still exist is
  // kept; everything is worked out again from the reports.
  load(project: Project): void {
    this.project = project;
    this.infos.clear();
    this.byFAdr.clear();
    this.byExtRaw.clear();
    this.blocks = new Map(project.blocks.map((block) => [block.id, block]));
    this.blocksByInput.clear();
    this.turnoutsByInput.clear();
    const profile = project.settings.centralUnit;

    for (const view of project.views) {
      for (const element of view.elements) {
        if (
          element.kind !== 'turnout' &&
          element.kind !== 'signal' &&
          element.kind !== 'accessory'
        ) {
          continue;
        }
        const signalType =
          element.kind === 'signal'
            ? findSignalType(project.signalTypes, element.signalTypeId)
            : undefined;
        const states =
          element.kind === 'accessory'
            ? accessoryStates(element, profile)
            : stateOutputs(element, signalType, profile);
        this.infos.set(element.id, {element, view, signalType, states});
        for (const outputs of states.values()) {
          for (const {fAdr} of outputs) {
            const list = this.byFAdr.get(fAdr) ?? [];
            if (!list.includes(element.id)) {
              list.push(element.id);
            }
            this.byFAdr.set(fAdr, list);
          }
        }
        if (element.control.kind === 'extended') {
          const raw = element.control.address + 3;
          this.byExtRaw.set(raw, [
            ...(this.byExtRaw.get(raw) ?? []),
            element.id,
          ]);
        }
        if (element.kind === 'turnout') {
          for (const input of Object.values(element.positionFeedback ?? {})) {
            const key = feedbackInputKey(input);
            this.turnoutsByInput.set(key, [
              ...(this.turnoutsByInput.get(key) ?? []),
              element.id,
            ]);
          }
        }
      }
    }
    for (const block of project.blocks) {
      for (const input of block.inputs) {
        const key = feedbackInputKey(input);
        this.blocksByInput.set(key, [
          ...(this.blocksByInput.get(key) ?? []),
          block.id,
        ]);
      }
    }

    // Drop state of removed elements, then rebuild the rest.
    const previous = this.live;
    this.live = {turnouts: {}, signals: {}, accessories: {}, blocks: {}};
    for (const [id, info] of this.infos) {
      const kind =
        info.element.kind === 'turnout'
          ? 'turnouts'
          : info.element.kind === 'signal'
            ? 'signals'
            : 'accessories';
      const old = previous[kind][id];
      if (old) {
        (this.live[kind] as Record<string, unknown>)[id] = old;
      }
      this.update(id);
    }
    for (const block of project.blocks) {
      const old = previous.blocks[block.id];
      this.live.blocks[block.id] = old ?? emptyBlock(block);
      this.updateBlock(block.id);
    }
    for (const id of this.pending.keys()) {
      if (!this.infos.has(id)) {
        this.pending.get(id)?.cancel?.();
        this.pending.delete(id);
      }
    }
    this.changes = {};
    this.deps.onChange(this.live);
  }

  // --- reports from the central unit ----------------------------------------

  // LAN_X_TURNOUT_INFO. `solicited`: the answer to our own query; otherwise
  // a broadcast, i.e. the turnout was just switched (by any client).
  accessoryReport(
    fAdr: number,
    position: TurnoutInfoPosition,
    solicited: boolean,
  ): void {
    this.outputs.set(fAdr, reportToOutput(position));
    for (const id of this.byFAdr.get(fAdr) ?? []) {
      if (!solicited) {
        this.seenSwitching.add(id);
      }
      this.update(id);
    }
    this.flush();
  }

  extAccessoryReport(
    rawAddress: number,
    value: number | undefined,
    solicited: boolean,
  ): void {
    this.extValues.set(rawAddress, value);
    for (const id of this.byExtRaw.get(rawAddress) ?? []) {
      if (!solicited) {
        this.seenSwitching.add(id);
      }
      this.update(id);
    }
    this.flush();
  }

  feedbackChanged(changes: FeedbackInputState[]): void {
    const blocks = new Set<string>();
    const turnouts = new Set<string>();
    for (const change of changes) {
      this.feedback.set(change.key, change);
      this.blocksByInput.get(change.key)?.forEach((id) => blocks.add(id));
      this.turnoutsByInput.get(change.key)?.forEach((id) => turnouts.add(id));
    }
    blocks.forEach((id) => this.updateBlock(id));
    turnouts.forEach((id) => this.update(id));
    this.flush();
  }

  // Connection lost: nothing reported before can be trusted (MULTI-3).
  // Positions recorded by the operator and train labels are kept.
  connectionLost(): void {
    this.outputs.clear();
    this.extValues.clear();
    this.feedback.clear();
    this.seenSwitching.clear();
    for (const pending of this.pending.values()) {
      pending.cancel?.();
    }
    this.pending.clear();
    for (const cancel of this.releaseTimers.values()) {
      cancel();
    }
    this.releaseTimers.clear();
    for (const id of this.infos.keys()) {
      this.update(id);
    }
    for (const id of this.blocks.keys()) {
      this.setBlock(id, {
        ...this.live.blocks[id],
        occupied: false,
        releasing: false,
        locos: [],
      });
    }
    this.flush();
  }

  // --- operator commands ------------------------------------------------------

  // ACC-4: commands the last known positions of turnouts that the central
  // unit controls. Manual turnouts are skipped (nothing to send; recording
  // them would claim the operator had checked them). A reported position is
  // not trusted (the central unit may have restarted and report a default),
  // so only turnouts already seen in the saved position this session are
  // left alone. Goes through the same checks and queue as an operator's click.
  restoreTurnouts(positions: Record<string, string>): void {
    for (const [elementId, position] of Object.entries(positions)) {
      const element = this.infos.get(elementId)?.element;
      const live = this.live.turnouts[elementId];
      const alreadyThere =
        live?.status === 'confirmed' && live.position === position;
      if (
        element?.kind === 'turnout' &&
        element.control.kind !== 'manual' &&
        // The turnout may have been changed to another type since.
        turnoutPositions(element).includes(position) &&
        !alreadyThere
      ) {
        this.command({type: 'setTurnout', elementId, position});
      }
    }
  }

  command(command: ElementCommand): void {
    const info = this.infos.get(command.elementId);
    if (!info || !this.project) {
      return;
    }
    const decision = checkCommand(
      command,
      levelOf(this.project, info.view, info.element),
    );
    if (!decision.ok) {
      this.deps.onNotice({
        code: 'refused',
        elementId: command.elementId,
        reason: decision.reason,
      });
      return;
    }
    const profile = this.project.settings.centralUnit;
    const {element} = info;
    let target: string;
    let plan: CommandPlan;
    if (command.type === 'setTurnout' && element.kind === 'turnout') {
      target = command.position;
      plan = turnoutCommands(element, target, profile);
    } else if (
      command.type === 'setSignal' &&
      element.kind === 'signal' &&
      info.signalType
    ) {
      target = command.aspectId;
      plan = signalAspectCommands(element, info.signalType, target, profile);
    } else if (
      command.type === 'pressAccessory' &&
      element.kind === 'accessory'
    ) {
      target = command.on ? 'on' : 'off';
      plan = accessoryButtonCommands(element, command.on, profile);
    } else {
      return;
    }

    if (plan.kind === 'manual') {
      // Not connected: the operator has set it by hand and records it here.
      this.setValue(element, target, 'manual', undefined);
      this.flush();
      return;
    }
    if (plan.kind === 'incomplete') {
      this.deps.onNotice({
        code: 'incomplete',
        elementId: element.id,
        reason: plan.reason,
      });
      return;
    }
    this.pending.get(element.id)?.cancel?.();
    this.pending.set(element.id, {target, attempts: 0});
    this.send(element.id, plan);
    // A momentary accessory has no lasting state to confirm.
    if (element.kind === 'accessory' && element.buttonType === 'momentary') {
      this.pending.delete(element.id);
      return;
    }
    this.update(element.id);
    this.flush();
  }

  // Train number labels (BLK-4): only on blocks with feedback.
  setTrainLabel(blockId: string, label: string | null): void {
    const block = this.live.blocks[blockId];
    if (!block) {
      return;
    }
    if (!block.hasFeedback) {
      this.deps.onNotice({code: 'labelNeedsFeedback', blockId});
      return;
    }
    const text = label?.trim();
    this.setBlock(blockId, {...block, label: text ? text : undefined});
    this.flush();
  }

  // The engine's queue started a job of this element: the confirmation
  // timeout runs from now (a long route may wait in the queue first).
  jobStarted(elementId: string): void {
    const pending = this.pending.get(elementId);
    if (!pending || !this.project) {
      return;
    }
    pending.cancel?.();
    pending.cancel = this.deps.schedule(
      this.project.settings.centralUnit.confirmTimeoutMs,
      () => this.timeout(elementId),
    );
  }

  // --- internals --------------------------------------------------------------

  private send(elementId: string, plan: CommandPlan): void {
    if (plan.kind === 'commands') {
      for (const command of plan.commands) {
        this.deps.enqueue({
          kind: 'switch',
          fAdr: command.fAdr,
          output: command.output,
          pulseMs: command.pulseMs,
          queued: command.queued,
          tag: elementId,
        });
      }
    } else if (plan.kind === 'extended') {
      this.deps.enqueue({
        kind: 'extAccessory',
        rawAddress: plan.rawAddress,
        value: plan.value,
        tag: elementId,
      });
    }
  }

  private timeout(elementId: string): void {
    const pending = this.pending.get(elementId);
    const info = this.infos.get(elementId);
    if (!pending || !info || !this.project) {
      return;
    }
    const current = this.currentValue(info);
    if (current === pending.target) {
      this.pending.delete(elementId);
      this.seenSwitching.add(elementId);
      this.update(elementId);
      this.flush();
      return;
    }
    if (pending.attempts === 0) {
      // One more try: a z21 start silently ignores a command for a turnout
      // whose other output another client holds active at that moment.
      pending.attempts = 1;
      pending.cancel = undefined;
      const profile = this.project.settings.centralUnit;
      const {element} = info;
      const plan =
        element.kind === 'turnout'
          ? turnoutCommands(element, pending.target, profile)
          : element.kind === 'signal' && info.signalType
            ? signalAspectCommands(
                element,
                info.signalType,
                pending.target,
                profile,
              )
            : element.kind === 'accessory'
              ? accessoryButtonCommands(
                  element,
                  pending.target === 'on',
                  profile,
                )
              : undefined;
      if (plan) {
        this.send(elementId, plan);
      }
      this.update(elementId);
      this.flush();
      return;
    }
    this.pending.delete(elementId);
    if (this.project.settings.centralUnit.confirmation === 'assume') {
      // For central units that do not report accessory changes.
      this.setValue(info.element, pending.target, 'confirmed', undefined);
    } else {
      const old = this.valueOf(info.element);
      this.setValue(info.element, old.value, 'failed', undefined);
      this.deps.onNotice({code: 'failed', elementId});
    }
    this.flush();
  }

  // The position/aspect/on-off the reports say, if any.
  private currentValue(info: ControlledInfo): string | undefined {
    const {element} = info;
    if (element.control.kind === 'extended') {
      const value = this.extValues.get(element.control.address + 3);
      if (value === undefined) {
        return undefined;
      }
      const valueMap =
        element.control.valueMap ??
        (element.kind === 'signal'
          ? Object.fromEntries(
              (info.signalType?.aspects ?? [])
                .filter((aspect) => aspect.extValue !== undefined)
                .map((aspect) => [aspect.id, aspect.extValue!]),
            )
          : {});
      return Object.entries(valueMap).find(([, v]) => v === value)?.[0];
    }
    const result = reconstructState(
      info.states,
      (fAdr) => this.outputs.get(fAdr) ?? 'unknown',
    );
    return result.kind === 'state' ? result.state : undefined;
  }

  private reconstruction(info: ControlledInfo) {
    if (info.element.control.kind === 'extended') {
      const value = this.currentValue(info);
      return value
        ? ({kind: 'state', state: value} as const)
        : ({kind: 'unknown'} as const);
    }
    return reconstructState(
      info.states,
      (fAdr) => this.outputs.get(fAdr) ?? 'unknown',
    );
  }

  // Works out the displayed state of one element from everything known.
  private update(elementId: string): void {
    const info = this.infos.get(elementId);
    if (!info) {
      return;
    }
    const {element} = info;
    const old = this.valueOf(element);
    if (element.control.kind === 'manual') {
      // Recorded by the operator, or unknown.
      this.setValue(
        element,
        old.value,
        old.value ? 'manual' : 'unknown',
        undefined,
      );
      return;
    }
    const pending = this.pending.get(elementId);
    const result = this.reconstruction(info);
    let value = result.kind === 'state' ? result.state : undefined;
    let status: TurnoutLive['status'];
    if (pending) {
      if (value === pending.target) {
        pending.cancel?.();
        this.pending.delete(elementId);
        this.seenSwitching.add(elementId);
        status = 'confirmed';
      } else {
        status = pending.attempts > 0 ? 'retrying' : 'commanded';
      }
    } else if (old.status === 'failed' && value === old.value) {
      status = 'failed';
    } else if (result.kind === 'inconsistent') {
      status = 'inconsistent';
    } else if (result.kind === 'unknown') {
      status = 'unknown';
    } else {
      status = this.seenSwitching.has(elementId) ? 'confirmed' : 'reported';
    }

    // Position feedback (ACC-3) has the last word on turnouts.
    let feedbackPosition: string | undefined;
    if (element.kind === 'turnout' && element.positionFeedback) {
      for (const [position, input] of Object.entries(
        element.positionFeedback,
      )) {
        if (this.feedback.get(feedbackInputKey(input))?.occupied) {
          feedbackPosition = feedbackPosition === undefined ? position : '';
        }
      }
      if (feedbackPosition === '') {
        feedbackPosition = undefined;
      }
      if (feedbackPosition !== undefined && !pending) {
        if (value === undefined) {
          value = feedbackPosition;
          status = 'confirmed';
        } else if (value !== feedbackPosition) {
          status = 'mismatch';
        } else {
          status = 'confirmed';
        }
      }
    }
    this.setValue(
      element,
      value,
      status,
      this.pending.get(elementId)?.target,
      feedbackPosition,
    );
  }

  private valueOf(element: DiagramElement): {value?: string; status?: string} {
    if (element.kind === 'turnout') {
      const live = this.live.turnouts[element.id];
      return {value: live?.position, status: live?.status};
    }
    if (element.kind === 'signal') {
      const live = this.live.signals[element.id];
      return {value: live?.aspect, status: live?.status};
    }
    const live = this.live.accessories[element.id];
    return {
      value: live?.on === undefined ? undefined : live.on ? 'on' : 'off',
      status: live?.status,
    };
  }

  private setValue(
    element: DiagramElement,
    value: string | undefined,
    status: TurnoutLive['status'],
    commanded: string | undefined,
    feedback?: string,
  ): void {
    if (element.kind === 'turnout') {
      const next: TurnoutLive = {status};
      if (value !== undefined) next.position = value;
      if (commanded !== undefined) next.commanded = commanded;
      if (feedback !== undefined) next.feedback = feedback;
      if (!sameJson(this.live.turnouts[element.id], next)) {
        this.live.turnouts[element.id] = next;
        (this.changes.turnouts ??= {})[element.id] = next;
      }
    } else if (element.kind === 'signal') {
      const next: SignalLive = {status};
      if (value !== undefined) next.aspect = value;
      if (commanded !== undefined) next.commanded = commanded;
      if (!sameJson(this.live.signals[element.id], next)) {
        this.live.signals[element.id] = next;
        (this.changes.signals ??= {})[element.id] = next;
      }
    } else if (element.kind === 'accessory') {
      const next: AccessoryLive = {status};
      if (value !== undefined) next.on = value === 'on';
      if (!sameJson(this.live.accessories[element.id], next)) {
        this.live.accessories[element.id] = next;
        (this.changes.accessories ??= {})[element.id] = next;
      }
    }
  }

  private updateBlock(blockId: string): void {
    const block = this.blocks.get(blockId);
    const current = this.live.blocks[blockId];
    if (!block || !current || !this.project) {
      return;
    }
    const inputs = block.inputs.map((input) =>
      this.feedback.get(feedbackInputKey(input)),
    );
    const occupiedNow = inputs.some((input) => input?.occupied);
    const locos: DetectedLoco[] = inputs.flatMap((input) => input?.locos ?? []);
    const base = {...current, locos, hasFeedback: block.inputs.length > 0};
    if (occupiedNow) {
      // Occupation is shown at once (BLK-3).
      this.releaseTimers.get(blockId)?.();
      this.releaseTimers.delete(blockId);
      this.setBlock(blockId, {...base, occupied: true, releasing: false});
      return;
    }
    if (current.occupied && !current.releasing) {
      // Freed: keep showing it as occupied for the release delay, against
      // flicker from dirty wheels or track (BLK-3).
      const delay =
        block.releaseDelayMs ?? this.project.settings.blockReleaseDelayMs;
      this.setBlock(blockId, {...base, occupied: true, releasing: true});
      this.releaseTimers.set(
        blockId,
        this.deps.schedule(delay, () => {
          this.releaseTimers.delete(blockId);
          const latest = this.live.blocks[blockId];
          if (latest?.releasing) {
            this.setBlock(blockId, {
              ...latest,
              occupied: false,
              releasing: false,
            });
            this.flush();
          }
        }),
      );
      return;
    }
    this.setBlock(blockId, {
      ...base,
      occupied: current.occupied,
      releasing: current.releasing,
    });
  }

  private setBlock(blockId: string, next: BlockLive): void {
    if (!sameJson(this.live.blocks[blockId], next)) {
      this.live.blocks[blockId] = next;
      (this.changes.blocks ??= {})[blockId] = next;
    }
  }

  private flush(): void {
    if (Object.keys(this.changes).length > 0) {
      const changes = this.changes;
      this.changes = {};
      this.deps.onChange(changes);
    }
  }
}

const emptyBlock = (block: Block): BlockLive => ({
  occupied: false,
  releasing: false,
  locos: [],
  hasFeedback: block.inputs.length > 0,
});

// On/off outputs of a generic accessory, for reading its state back.
const accessoryStates = (
  accessory: GenericAccessory,
  profile: Project['settings']['centralUnit'],
): Map<string, ResolvedOutput[]> => {
  const result = new Map<string, ResolvedOutput[]>();
  const {control} = accessory;
  if (control.kind !== 'dcc') {
    return result;
  }
  for (const [state, refs] of [
    ['on', control.outputMap?.['on'] ?? [{address: 0, output: 2 as const}]],
    ['off', control.outputMap?.['off'] ?? [{address: 0, output: 1 as const}]],
  ] as const) {
    const resolved = resolveOutputs([...refs], control, profile);
    if (typeof resolved !== 'string') {
      result.set(state, resolved);
    }
  }
  return result;
};

const sameJson = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
