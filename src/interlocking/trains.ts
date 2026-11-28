// Trains on the layout, from block occupancy (BLK-4, Level 3 and 4): a train
// is a train number the operator put on a block, optionally with a loco from
// the project's loco list. When a block next to one of the train's blocks
// becomes occupied, the train moves into it (its new front, entered at the
// node it came through, which also tells its direction); blocks it leaves
// drop off behind it. Occupancy that no train explains stays unlabelled.
//
// Feedback only shows that a block is occupied, not by whom: a train running
// into an already occupied block cannot be seen entering it. When its last
// block becomes free and the block ahead is occupied, it is taken to have
// run in there (and marked so Level 3 can stop it).
//
// Pure: the interlocking calls it with the layout's state.
import {
  BlockExit,
  BlockGraph,
  exitBetween,
  nextBlock,
} from '../model/blockGraph';
import {NodeId} from '../model/topology';

export type TrainBlock = {
  blockId: string;
  // Where the train entered this block; undefined if not known (the train
  // was put here by the operator).
  entryNode?: NodeId;
};

export type Train = {
  id: string;
  name: string;
  locoId?: string;
  // Front first.
  blocks: TrainBlock[];
  // The loco's DCC direction (forward = true) that runs the train ahead,
  // i.e. away from where its front block was entered. Learnt when the train
  // moves on while its loco's direction is known.
  aheadIsForward?: boolean;
  // It ran into a block that was already occupied (see above).
  enteredOccupied?: boolean;
};

// What Lever wants a train's loco to do (Level 3 hold, Level 4 run): a
// speed, and a direction (DCC forward = true) or the one it has.
export type LocoTarget = {kmh: number; forward?: boolean};

export type TrainNotice =
  | {code: 'trainLost'; trainId: string; name: string}
  | {code: 'trainUnclear'; blockId: string};

export type TrainContext = {
  graph: BlockGraph;
  position: (turnoutId: string) => string | undefined;
  occupied: (blockId: string) => boolean;
  // The loco's reported DCC direction (true = forward), if known.
  locoForward: (locoId: string) => boolean | undefined;
};

export class TrainTracker {
  private trains = new Map<string, Train>();
  private counter = 0;

  all(): Train[] {
    return [...this.trains.values()];
  }

  get(trainId: string): Train | undefined {
    return this.trains.get(trainId);
  }

  // The train on a block, if any.
  at(blockId: string): Train | undefined {
    return this.all().find((train) =>
      train.blocks.some((b) => b.blockId === blockId),
    );
  }

  // The operator names the train on a block: a new train, a new name, or
  // (empty name) the train removed.
  label(blockId: string, name: string | null): void {
    const text = name?.trim() ?? '';
    const train = this.at(blockId);
    if (!text) {
      if (train) {
        this.trains.delete(train.id);
      }
      return;
    }
    if (train) {
      train.name = text;
      return;
    }
    const id = `train-${++this.counter}`;
    this.trains.set(id, {id, name: text, blocks: [{blockId}]});
  }

  assignLoco(trainId: string, locoId: string | null): void {
    const train = this.trains.get(trainId);
    if (!train) {
      return;
    }
    if (train.locoId !== (locoId ?? undefined)) {
      // Another loco: its direction is not known yet.
      train.aheadIsForward = undefined;
    }
    train.locoId = locoId ?? undefined;
  }

  // Locos removed from the project, blocks removed from the layout.
  prune(blockIds: ReadonlySet<string>, locoIds: ReadonlySet<string>): void {
    for (const train of this.all()) {
      train.blocks = train.blocks.filter((b) => blockIds.has(b.blockId));
      if (train.locoId && !locoIds.has(train.locoId)) {
        train.locoId = undefined;
        train.aheadIsForward = undefined;
      }
      if (train.blocks.length === 0) {
        this.trains.delete(train.id);
      }
    }
  }

  // A block became occupied or free (after its release delay). Returns
  // notices for the operator and whether any train changed.
  occupancyChanged(
    blockId: string,
    occupied: boolean,
    context: TrainContext,
  ): {changed: boolean; notices: TrainNotice[]} {
    return occupied
      ? this.entered(blockId, context)
      : this.left(blockId, context);
  }

  private entered(
    blockId: string,
    context: TrainContext,
  ): {changed: boolean; notices: TrainNotice[]} {
    if (this.at(blockId)) {
      return {changed: false, notices: []};
    }
    // Trains with a block next to this one, by the way between them.
    const candidates: {train: Train; from: TrainBlock; exit: BlockExit}[] = [];
    for (const train of this.trains.values()) {
      for (const from of train.blocks) {
        const exit = exitBetween(
          context.graph,
          from.blockId,
          blockId,
          context.position,
        );
        if (exit) {
          candidates.push({train, from, exit});
        }
      }
    }
    if (candidates.length === 0) {
      return {changed: false, notices: []};
    }
    // A train heading that way (leaving its front block at its far end)
    // is the likeliest; then any one, if it is the only one.
    const ahead = candidates.filter(
      (c) =>
        c.train.blocks[0] === c.from &&
        c.from.entryNode !== undefined &&
        c.exit.exitNode !== c.from.entryNode,
    );
    const trains = new Set(
      (ahead.length > 0 ? ahead : candidates).map((c) => c.train),
    );
    if (trains.size !== 1) {
      return {changed: false, notices: [{code: 'trainUnclear', blockId}]};
    }
    const chosen = (ahead.length > 0 ? ahead : candidates)[0];
    const {train} = chosen;
    const front = train.blocks[0];
    if (chosen.from !== front) {
      // It moved out at its back: it has reversed; the back is the front now.
      train.blocks.reverse();
    }
    train.blocks.unshift({blockId, entryNode: chosen.exit.entryNode});
    train.enteredOccupied = false;
    const forward = train.locoId
      ? context.locoForward(train.locoId)
      : undefined;
    if (forward !== undefined) {
      train.aheadIsForward = forward;
    } else if (chosen.from !== front && train.aheadIsForward !== undefined) {
      train.aheadIsForward = !train.aheadIsForward;
    }
    return {changed: true, notices: []};
  }

  private left(
    blockId: string,
    context: TrainContext,
  ): {changed: boolean; notices: TrainNotice[]} {
    const train = this.at(blockId);
    if (!train) {
      return {changed: false, notices: []};
    }
    if (train.blocks.length > 1) {
      train.blocks = train.blocks.filter((b) => b.blockId !== blockId);
      return {changed: true, notices: []};
    }
    // Its only block is free: it ran on into an occupied block, or it is
    // gone (taken off, or the detectors lost it).
    const front = train.blocks[0];
    const next = nextBlock(
      context.graph,
      front.blockId,
      front.entryNode,
      context.position,
    );
    if (
      next.kind === 'block' &&
      next.exit.to !== null &&
      context.occupied(next.exit.to)
    ) {
      train.blocks = [{blockId: next.exit.to, entryNode: next.exit.entryNode}];
      train.enteredOccupied = true;
      return {changed: true, notices: []};
    }
    this.trains.delete(train.id);
    return {
      changed: true,
      notices: [{code: 'trainLost', trainId: train.id, name: train.name}],
    };
  }

  clear(): void {
    this.trains.clear();
  }
}
