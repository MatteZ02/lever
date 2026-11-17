// Rows for the address overview (EDT-6): every accessory and feedback
// address used in the project, for finding conflicts and for wiring.
import {fAdrToDccAddressAndPort} from '@lever/z21-protocol';
import {feedbackInputKey} from '../shared/feedback';
import {addressToFAdr} from './accessoryCommands';
import {ElementKind, isControlled} from './elements';
import {Project} from './project';

export type AddressRow = {
  key: string;
  // Element to select; for blocks the first track of the block.
  elementId?: string;
  viewId?: string;
  viewName: string;
  kind: ElementKind | 'block';
  name: string;
  addressType: 'accessory' | 'extended' | 'feedback';
  // Accessory: number as the Roco app shows it. Feedback: input key.
  address: number | string;
  // Accessory only: the DCC decoder address and port it ends up on.
  dccAddress?: number;
  port?: number;
  // Which of the element's addresses (1-based) or which position feedback.
  detail?: string;
  // Used by more than one element.
  conflict: boolean;
};

export const buildAddressTable = (project: Project): AddressRow[] => {
  const profile = project.settings.centralUnit;
  const rows: AddressRow[] = [];

  for (const view of project.views) {
    for (const element of view.elements) {
      if (isControlled(element)) {
        const {control} = element;
        if (control.kind === 'dcc') {
          control.addresses.forEach((address, index) => {
            const fAdr = addressToFAdr(address, profile);
            const dcc =
              fAdr === undefined ? undefined : fAdrToDccAddressAndPort(fAdr);
            rows.push({
              key: `${element.id}:a${index}`,
              elementId: element.id,
              viewId: view.id,
              viewName: view.name,
              kind: element.kind,
              name: element.name,
              addressType: 'accessory',
              address,
              dccAddress: dcc?.dccAddress,
              port: dcc?.port,
              detail: control.addresses.length > 1 ? `${index + 1}` : undefined,
              conflict: false,
            });
          });
        } else if (control.kind === 'extended') {
          rows.push({
            key: `${element.id}:ext`,
            elementId: element.id,
            viewId: view.id,
            viewName: view.name,
            kind: element.kind,
            name: element.name,
            addressType: 'extended',
            address: control.address,
            conflict: false,
          });
        }
      }
      if (element.kind === 'turnout' && element.positionFeedback) {
        for (const [position, input] of Object.entries(
          element.positionFeedback,
        )) {
          rows.push({
            key: `${element.id}:fb:${position}`,
            elementId: element.id,
            viewId: view.id,
            viewName: view.name,
            kind: 'turnout',
            name: element.name,
            addressType: 'feedback',
            address: feedbackInputKey(input),
            detail: position,
            conflict: false,
          });
        }
      }
    }
  }

  for (const block of project.blocks) {
    const view = project.views.find((candidate) =>
      candidate.elements.some(
        (element) => element.kind === 'track' && element.blockId === block.id,
      ),
    );
    const track = view?.elements.find(
      (element) => element.kind === 'track' && element.blockId === block.id,
    );
    block.inputs.forEach((input, index) => {
      rows.push({
        key: `${block.id}:in${index}`,
        elementId: track?.id,
        viewId: view?.id,
        viewName: view?.name ?? '',
        kind: 'block',
        name: block.name,
        addressType: 'feedback',
        address: feedbackInputKey(input),
        conflict: false,
      });
    });
  }

  // Mark conflicts: the same address used by different elements/blocks.
  const owners = new Map<string, Set<string>>();
  const conflictKey = (row: AddressRow) =>
    row.addressType === 'accessory'
      ? `acc:${addressToFAdr(row.address as number, profile) ?? row.address}`
      : `${row.addressType}:${row.address}`;
  for (const row of rows) {
    const key = conflictKey(row);
    const owner =
      row.kind === 'block'
        ? `block:${row.name}:${row.key.split(':')[0]}`
        : (row.elementId ?? row.key);
    owners.set(key, (owners.get(key) ?? new Set()).add(owner));
  }
  return rows.map((row) => ({
    ...row,
    conflict: (owners.get(conflictKey(row))?.size ?? 0) > 1,
  }));
};
