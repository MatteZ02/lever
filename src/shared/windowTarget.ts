// What a window shows (VIEW-2, ARC-3): a station view or an arrangement of
// the full layout view. Passed to a new window in its URL hash, reported
// back to the main process, and saved with the window's position.
import {z} from 'zod';

export type WindowTarget =
  {kind: 'view'; viewId: string} | {kind: 'full'; arrangementId: string};

export const windowTargetTextSchema = z.string().max(200);

export const formatWindowTarget = (target: WindowTarget): string =>
  target.kind === 'view'
    ? `view:${target.viewId}`
    : `full:${target.arrangementId}`;

export const parseWindowTarget = (text: string): WindowTarget | undefined => {
  const [kind, ...rest] = text.split(':');
  const id = rest.join(':');
  if (!id) {
    return undefined;
  }
  return kind === 'view'
    ? {kind: 'view', viewId: id}
    : kind === 'full'
      ? {kind: 'full', arrangementId: id}
      : undefined;
};
