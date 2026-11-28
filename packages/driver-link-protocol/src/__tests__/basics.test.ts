import {
  CAPABILITIES_V1,
  hasCapability,
  intersectCapabilities,
  RESERVED_CAPABILITIES,
} from '../capabilities.ts';
import {textDigest} from '../digest.ts';
import {
  isLinkId,
  LINK_ID_PATTERN,
  linkIdTime,
  newLinkId,
  randomBase36,
} from '../ids.ts';
import {isKnownCode, NOTICE_CODES} from '../messages.ts';
import {PROTOCOL_VERSION, relateVersion} from '../version.ts';

// Random sources for tests: a fixed byte sequence, repeated.
const bytesFrom =
  (values: number[]) =>
  (length: number): Uint8Array =>
    Uint8Array.from({length}, (_, i) => values[i % values.length]);

const pseudoRandom = () => {
  let state = 12345;
  return (length: number): Uint8Array =>
    Uint8Array.from({length}, () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state >> 23;
    });
};

describe('ids', () => {
  it('have the format <prefix>-<base-36 ms>-<random>', () => {
    const id = newLinkId('prj', 1764331234567, bytesFrom([0, 1, 35, 36, 71]));
    expect(id).toBe(`prj-${(1764331234567).toString(36)}-01z0z01z0z`);
    expect(LINK_ID_PATTERN.test(id)).toBe(true);
    expect(linkIdTime(id)).toBe(1764331234567);
  });

  it('skip bytes that would bias the alphabet', () => {
    expect(randomBase36(4, bytesFrom([252, 255, 1, 253, 2, 254]))).toBe('1212');
  });

  it('are unique and well-formed for every prefix', () => {
    const random = pseudoRandom();
    const ids = new Set<string>();
    for (const prefix of ['prj', 'lvr', 'ses', 'thr'] as const) {
      for (let i = 0; i < 500; i++) {
        const id = newLinkId(prefix, 1764331234567, random);
        expect(isLinkId(id, prefix)).toBe(true);
        ids.add(id);
      }
    }
    expect(ids.size).toBe(2000);
  });

  it('tell link ids from other text', () => {
    expect(isLinkId('project-ab12cd34')).toBe(false);
    expect(isLinkId('club-layout')).toBe(false);
    expect(isLinkId('prj-mihdtmo7-short')).toBe(false);
    expect(isLinkId('thr-mihdtmo7-5mx7o6cbe3', 'prj')).toBe(false);
    expect(linkIdTime('nope')).toBeUndefined();
  });
});

describe('versions', () => {
  it.each([
    [[1, 0], 'same'],
    [[1, 4], 'newerMinor'],
    [[2, 0], 'mismatch'],
    [[0, 9], 'mismatch'],
  ] as const)('%j is %s', (peer, relation) => {
    expect(relateVersion(peer, [1, 0])).toBe(relation);
  });

  it('an older minor is readable', () => {
    expect(relateVersion([1, 0], [1, 2])).toBe('olderMinor');
    expect(PROTOCOL_VERSION).toEqual([1, 0]);
  });
});

describe('capabilities', () => {
  it('only the intersection is used, in our order', () => {
    expect(
      intersectCapabilities(
        ['lines', 'strips', 'lineStatus', 'lines'],
        ['lineStatus', 'voice', 'lines'],
      ),
    ).toEqual(['lines', 'lineStatus']);
  });

  it('version 1 offers no reserved capability', () => {
    for (const reserved of RESERVED_CAPABILITIES) {
      expect(CAPABILITIES_V1 as readonly string[]).not.toContain(reserved);
    }
    expect(hasCapability(['lines'], 'lines')).toBe(true);
    expect(hasCapability(['lines'], 'strips')).toBe(false);
  });
});

describe('textDigest', () => {
  it('is stable, 16 hex characters, and differs for different text', () => {
    expect(textDigest('abc')).toBe(textDigest('abc'));
    expect(textDigest('abc')).toMatch(/^[0-9a-f]{16}$/);
    expect(textDigest('abc')).not.toBe(textDigest('abd'));
    expect(textDigest('')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('open codes', () => {
  it('known and unknown codes', () => {
    expect(isKnownCode(NOTICE_CODES, 'locoConflict')).toBe(true);
    expect(isKnownCode(NOTICE_CODES, 'trainArrived')).toBe(false);
  });
});
