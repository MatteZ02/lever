// Capabilities (contract section 5.1): each side lists what it supports in
// `hello` / `welcome`; only the intersection is used.
export const CAPABILITIES_V1 = [
  'locoInfo',
  'locoState',
  'functions',
  'lines',
  'lineChoice',
  'strips',
  'operatorEdits',
  'lineStatus',
  'driverView',
  'conflicts',
  'notices',
  'chunking',
] as const;
export type Capability = (typeof CAPABILITIES_V1)[number];

// Names kept for later versions; never offered by version 1.
export const RESERVED_CAPABILITIES = [
  'requests',
  'pairing',
  'thumbnails',
  'discovery',
] as const;

// The capabilities both sides offer, in our order, without duplicates.
// Names we do not know (from a newer peer) drop out naturally.
export const intersectCapabilities = (
  own: readonly string[],
  peer: readonly string[],
): string[] => {
  const theirs = new Set(peer);
  return [...new Set(own)].filter((name) => theirs.has(name));
};

export const hasCapability = (
  capabilities: readonly string[],
  name: Capability,
): boolean => capabilities.includes(name);
