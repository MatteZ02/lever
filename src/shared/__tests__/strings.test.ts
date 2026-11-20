// The Finnish table has every string of the English one, and nothing else.
import {describe, expect, it} from 'vitest';
import {setLanguage, strings} from '../strings';
import {fi} from '../strings.fi';

// Every key path; functions with their number of parameters.
const paths = (value: unknown, prefix = ''): string[] => {
  if (typeof value === 'function') {
    return [`${prefix}(${value.length})`];
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) =>
      paths(inner, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [`${prefix}${typeof value === 'string' && value ? '' : ' empty'}`];
};

describe('user interface languages', () => {
  it('given the Finnish table, has the same strings as the English one', () => {
    setLanguage('en');
    const english = paths(strings);
    expect(paths(fi)).toEqual(english);
  });

  it('switches the shared table', () => {
    setLanguage('fi');
    expect(strings).toBe(fi);
    setLanguage('en');
    expect(strings).not.toBe(fi);
  });
});
