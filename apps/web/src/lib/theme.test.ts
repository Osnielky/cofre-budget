import { describe, it, expect } from 'vitest';
import { stepTheme, THEMES } from './theme';

const ids = THEMES.map((t) => t.id);

describe('stepTheme', () => {
  it('moves forward and back', () => {
    expect(stepTheme(ids, 'cobalt', 1)).toBe('noir-gold');
    expect(stepTheme(ids, 'aurora', -1)).toBe('noir-gold');
  });
  it('wraps at both ends', () => {
    expect(stepTheme(ids, 'daylight', 1)).toBe('cobalt');
    expect(stepTheme(ids, 'cobalt', -1)).toBe('daylight');
  });
  it('starts from the first theme when the current id is unknown', () => {
    expect(stepTheme(ids, 'gone' as never, 1)).toBe('noir-gold');
  });
});
