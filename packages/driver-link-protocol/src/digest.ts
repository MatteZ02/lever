// A short, stable text digest for `hello.locosDigest` and Lever's
// `linesVersion`. The contract treats both as opaque strings compared only
// for equality, so any function would do; this one is offered so both apps
// need no hashing library. Not cryptographic.
const FNV_PRIME = 0x01000193;

const fnv1a = (text: string, seed: number): number => {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
};

// 16 hex characters (two 32-bit FNV-1a hashes with different seeds).
export const textDigest = (text: string): string =>
  fnv1a(text, 0x811c9dc5).toString(16).padStart(8, '0') +
  fnv1a(text, 0x01234567).toString(16).padStart(8, '0');
