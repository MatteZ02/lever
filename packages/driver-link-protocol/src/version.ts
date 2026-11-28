// Protocol name and version (contract section 5.1). A minor difference
// works (unknown fields and types are ignored); a major difference does not.
export const PROTOCOL_NAME = 'lever-link';
export const PROTOCOL_MAJOR = 1;
export const PROTOCOL_MINOR = 0;
export const PROTOCOL_VERSION: readonly [number, number] = [
  PROTOCOL_MAJOR,
  PROTOCOL_MINOR,
];

export type VersionRelation = 'same' | 'olderMinor' | 'newerMinor' | 'mismatch';

// How a peer's version relates to ours.
export const relateVersion = (
  peer: readonly [number, number],
  own: readonly [number, number] = PROTOCOL_VERSION,
): VersionRelation => {
  if (peer[0] !== own[0]) {
    return 'mismatch';
  }
  if (peer[1] === own[1]) {
    return 'same';
  }
  return peer[1] > own[1] ? 'newerMinor' : 'olderMinor';
};
