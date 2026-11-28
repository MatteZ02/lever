// What a window shows (VIEW-2, ARC-3): a station view, an arrangement of
// the full layout view, or the traffic view (routes and trains, no diagram). Passed to a new window in its URL hash, reported
// back to the main process, and saved with the window's position.
import {z} from 'zod';

export type WindowTarget =
  | {kind: 'view'; viewId: string}
  | {kind: 'full'; arrangementId: string}
  | {kind: 'traffic'};

const TRAFFIC_TARGET = 'traffic:board';

export const windowTargetTextSchema = z.string().max(200);

export const formatWindowTarget = (target: WindowTarget): string =>
  target.kind === 'view'
    ? `view:${target.viewId}`
    : target.kind === 'full'
      ? `full:${target.arrangementId}`
      : TRAFFIC_TARGET;

export const parseWindowTarget = (text: string): WindowTarget | undefined => {
  if (text === TRAFFIC_TARGET) {
    return {kind: 'traffic'};
  }
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

// A window's URL hash: its target, and whether it is a plain station window
// (only the diagram and the station picker; opened with "New window").
const PLAIN_PREFIX = 'plain;';

export const formatWindowHash = (target: string, plain: boolean): string =>
  `${plain ? PLAIN_PREFIX : ''}${target}`;

export const parseWindowHash = (
  hash: string,
): {target?: WindowTarget; plain: boolean} => {
  const plain = hash.startsWith(PLAIN_PREFIX);
  const text = plain ? hash.slice(PLAIN_PREFIX.length) : hash;
  return {target: parseWindowTarget(text), plain};
};
