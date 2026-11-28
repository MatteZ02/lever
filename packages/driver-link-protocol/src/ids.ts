// Ids (contract section 3): `<prefix>-<timestamp>-<random>`, the timestamp
// in milliseconds since 1970 in base 36, the random part at least 8 base-36
// characters from a cryptographic source. The source is a parameter so the
// package stays pure: Node passes `crypto.randomBytes`, React Native
// `expo-crypto`'s `getRandomBytes`, a browser `crypto.getRandomValues`.
export const LINK_ID_PREFIXES = ['prj', 'lvr', 'ses', 'thr'] as const;
export type LinkIdPrefix = (typeof LINK_ID_PREFIXES)[number];

export type RandomBytes = (length: number) => Uint8Array;

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
// 10 characters ≈ 51 bits; the contract asks for at least 8.
export const RANDOM_PART_LENGTH = 10;
// Bytes ≥ 252 are skipped so every character is equally likely (252 = 7 × 36).
const UNBIASED_LIMIT = 252;

export const randomBase36 = (
  length: number,
  randomBytes: RandomBytes,
): string => {
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < UNBIASED_LIMIT) {
        out += ALPHABET[byte % 36];
        if (out.length === length) {
          break;
        }
      }
    }
  }
  return out;
};

export const newLinkId = (
  prefix: LinkIdPrefix,
  nowMs: number,
  randomBytes: RandomBytes,
): string =>
  `${prefix}-${Math.max(0, Math.floor(nowMs)).toString(36)}-${randomBase36(
    RANDOM_PART_LENGTH,
    randomBytes,
  )}`;

export const LINK_ID_PATTERN =
  /^(prj|lvr|ses|thr)-[0-9a-z]{1,12}-[0-9a-z]{8,40}$/;

export const isLinkId = (text: string, prefix?: LinkIdPrefix): boolean =>
  LINK_ID_PATTERN.test(text) &&
  (prefix === undefined || text.startsWith(`${prefix}-`));

// When the id was made (ms), or undefined if it is not a link id.
export const linkIdTime = (id: string): number | undefined =>
  isLinkId(id) ? parseInt(id.split('-')[1], 36) : undefined;
