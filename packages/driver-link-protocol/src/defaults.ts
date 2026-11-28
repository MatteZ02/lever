// Default values from the contract (section 11). Every one is configurable;
// these are what both apps start with.
export const LINK_DEFAULTS = {
  port: 21110,
  // Both sides.
  maxDatagramBytes: 1200,
  resendMs: 500,
  resendMaxMs: 8000,
  chunkTimeoutMs: 2000,
  // Throttle.
  helloIntervalS: 3,
  noDataAfterS: 6,
  retryBackoffMinS: 3,
  retryBackoffMaxS: 30,
  stateRatePerS: 4,
  // Lever (app).
  maxPhones: 20,
  leaseTimeoutS: 10,
  refreshIntervalS: 2,
  maxDatagramsPerPhonePerS: 10,
  // Lever (project).
  conflictTolerance: 0.05,
  stripAutoEndMin: 10,
  lookAheadMax: 5,
} as const;

// Limits of the format itself, not settings.
export const LINK_LIMITS = {
  // The largest UDP payload over IPv4.
  maxDatagramBytes: 65507,
  // Parts of one chunked message (version 1 needs a few for `lines`).
  maxParts: 64,
  // Messages being reassembled at once, per sender.
  maxPendingPerSender: 8,
  // Reassembled body text.
  maxMessageBytes: 64 * 1024,
} as const;
