// Turns R-Bus, LocoNet-detector and CAN-detector messages into one shape:
// the state of each feedback input (BLK-1). Reports only inputs that changed,
// so a repeated status report causes no events. Release delays and blocks are
// handled above this layer (BLK-3).
import {
  BroadcastFlag,
  CAN_DETECTOR_ALL,
  decodeCanDetectorReport,
  decodeLocoNetDetectorReport,
  lanCanDetector,
  lanLocoNetDetector,
  lanRmbusGetData,
  LocoNetDetectorRequest,
  RBUS_GROUPS,
  rbusInputStates,
  Z21Message,
} from '@lever/z21-protocol';
import {
  DetectedLoco,
  FeedbackInputRef,
  feedbackInputKey,
  FeedbackInputState,
  FeedbackSource,
} from '../shared/feedback';
import {AccessoryJob} from './AccessoryQueue';

const SOURCE_FLAGS: Record<FeedbackSource, number> = {
  rbus: BroadcastFlag.RBUS,
  loconet: BroadcastFlag.LOCONET_DETECTOR,
  can: BroadcastFlag.CAN_DETECTOR,
};

// Basic flag plus only the feedback sources the layout uses (LOAD-1).
export const broadcastFlagsFor = (sources: FeedbackSource[]): number =>
  sources.reduce(
    (flags, source) => flags | SOURCE_FLAGS[source],
    BroadcastFlag.BASIC as number,
  ) >>> 0;

// Status requests for the configured sources, sent through the accessory
// queue after connecting (LOAD-3). LocoNet uses the Digitrax "Stationary
// Interrogate Request"; Uhlenbrock detectors need their report address,
// which can be added when a project needs it.
export const feedbackStartupQueries = (
  sources: FeedbackSource[],
): AccessoryJob[] =>
  sources.flatMap((source): AccessoryJob[] => {
    switch (source) {
      case 'rbus':
        return RBUS_GROUPS.map((group) => ({
          kind: 'query',
          key: `rbus:${group}`,
          dataset: lanRmbusGetData(group),
        }));
      case 'loconet':
        return [
          {
            kind: 'query',
            key: 'loconet:sic',
            dataset: lanLocoNetDetector(LocoNetDetectorRequest.SIC, 0),
          },
        ];
      case 'can':
        return [
          {
            kind: 'query',
            key: 'can:all',
            dataset: lanCanDetector(CAN_DETECTOR_ALL),
          },
        ];
    }
  });

type Update = {
  occupied?: boolean;
  locos?: DetectedLoco[];
  addLoco?: DetectedLoco;
  removeLoco?: number;
  overload?: number;
  networkId?: number;
};

export class FeedbackTracker {
  private readonly inputs = new Map<string, FeedbackInputState>();

  // Every input reported so far (for the feedback monitor, CARRY-5).
  all(): FeedbackInputState[] {
    return [...this.inputs.values()];
  }

  get(input: FeedbackInputRef): FeedbackInputState | undefined {
    return this.inputs.get(feedbackInputKey(input));
  }

  // Forget everything, e.g. after reconnecting: the central unit is asked
  // again, and nothing stale is shown meanwhile.
  clear(): void {
    this.inputs.clear();
  }

  // Applies a message; returns the inputs whose state changed.
  handle(message: Z21Message, now: number): FeedbackInputState[] {
    switch (message.type) {
      case 'rbusData':
        return rbusInputStates(message.group, message.status).flatMap((state) =>
          this.update(
            {source: 'rbus', module: state.module, input: state.input},
            {occupied: state.occupied},
            now,
          ),
        );
      case 'locoNetDetector':
        return this.handleLocoNet(message, now);
      case 'canDetector':
        return this.handleCan(message, now);
      default:
        return [];
    }
  }

  private handleLocoNet(
    message: Extract<Z21Message, {type: 'locoNetDetector'}>,
    now: number,
  ): FeedbackInputState[] {
    const report = decodeLocoNetDetectorReport(
      message.detectorType,
      message.feedbackAddress,
      message.info,
    );
    const input: FeedbackInputRef = {
      source: 'loconet',
      address: report.feedbackAddress,
    };
    switch (report.kind) {
      case 'occupancy':
      case 'lissyBlock':
        return this.update(input, {occupied: report.occupied}, now);
      case 'transponder':
        return this.update(
          input,
          report.enters
            ? {addLoco: {address: report.transponderAddress}}
            : {removeLoco: report.transponderAddress},
          now,
        );
      case 'lissyLoco':
        return this.update(
          input,
          {locos: [{address: report.locoAddress, forward: report.forward}]},
          now,
        );
      default:
        return [];
    }
  }

  private handleCan(
    message: Extract<Z21Message, {type: 'canDetector'}>,
    now: number,
  ): FeedbackInputState[] {
    const report = decodeCanDetectorReport(
      message.detectorType,
      message.value1,
      message.value2,
    );
    const input: FeedbackInputRef = {
      source: 'can',
      module: message.moduleAddress,
      port: message.port,
    };
    const networkId = message.networkId;
    switch (report.kind) {
      case 'occupancy':
        return this.update(
          input,
          {occupied: report.occupied, overload: report.overload, networkId},
          now,
        );
      case 'locoAddresses': {
        // Type 0x11 starts a new list; later types continue it.
        const previous =
          report.firstIndex === 1 ? [] : (this.get(input)?.locos ?? []);
        const locos = report.locos.map(({address, forward}) =>
          forward === undefined ? {address} : {address, forward},
        );
        return this.update(
          input,
          {locos: [...previous, ...locos], networkId},
          now,
        );
      }
      default:
        return [];
    }
  }

  private update(
    input: FeedbackInputRef,
    update: Update,
    now: number,
  ): FeedbackInputState[] {
    const key = feedbackInputKey(input);
    const current = this.inputs.get(key);
    let locos = update.locos ?? current?.locos ?? [];
    if (update.addLoco) {
      const added = update.addLoco;
      locos = [
        ...locos.filter((loco) => loco.address !== added.address),
        added,
      ];
    }
    if (update.removeLoco !== undefined) {
      locos = locos.filter((loco) => loco.address !== update.removeLoco);
    }
    const next: FeedbackInputState = {
      key,
      input,
      occupied: update.occupied ?? current?.occupied ?? false,
      locos,
      overload: update.overload ?? current?.overload ?? 0,
      ...(update.networkId !== undefined || current?.networkId !== undefined
        ? {networkId: update.networkId ?? current?.networkId}
        : {}),
      changedAt: now,
    };
    if (current && sameState(current, next)) {
      return [];
    }
    this.inputs.set(key, next);
    return [next];
  }
}

const sameState = (a: FeedbackInputState, b: FeedbackInputState): boolean =>
  a.occupied === b.occupied &&
  a.overload === b.overload &&
  a.networkId === b.networkId &&
  a.locos.length === b.locos.length &&
  a.locos.every(
    (loco, index) =>
      loco.address === b.locos[index].address &&
      loco.forward === b.locos[index].forward,
  );
