import { describe, it, expect } from 'vitest';
import { avatarColor, initials } from './avatar';

const PALETTE = [
  'var(--color-card-violet)', 'var(--color-card-green)', 'var(--color-card-orange)',
  'var(--color-card-amber)', 'var(--color-card-sky)', 'var(--color-rose)',
];

describe('avatarColor', () => {
  it('is deterministic for the same name', () => {
    expect(avatarColor('Whole Foods Market')).toBe(avatarColor('Whole Foods Market'));
  });

  it('returns a value from the known palette', () => {
    expect(PALETTE).toContain(avatarColor('Amazon'));
  });

  it('varies across different names', () => {
    const colors = new Set(['Amazon', 'Netflix', 'Shell', 'Target', 'Chipotle'].map(avatarColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('initials', () => {
  it('takes the first letter of up to two words', () => {
    expect(initials('Whole Foods Market')).toBe('WF');
    expect(initials('Netflix')).toBe('N');
  });

  it('uppercases lowercase input', () => {
    expect(initials('shell #4412')).toBe('S#');
  });

  it('falls back to ? for blank input', () => {
    expect(initials('   ')).toBe('?');
  });
});
