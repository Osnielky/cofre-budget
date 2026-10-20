import { describe, it, expect } from 'vitest';
import { normaliseLoginIdentifier } from './login-identifier';

describe('normaliseLoginIdentifier', () => {
  it('turns a bare name into the demo-domain email, case-insensitively', () => {
    expect(normaliseLoginIdentifier('Rockefeller')).toBe('rockefeller@demo.cofre');
    expect(normaliseLoginIdentifier('  ROCKEFELLER ')).toBe('rockefeller@demo.cofre');
  });
  it('leaves real emails alone', () => {
    expect(normaliseLoginIdentifier('Owner@Cofre.dev')).toBe('Owner@Cofre.dev');
  });
  it('returns an empty string for blank input', () => {
    expect(normaliseLoginIdentifier('   ')).toBe('');
  });
});
