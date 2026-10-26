import { describe, it, expect } from 'vitest';
import { CountryCode } from 'plaid';
import { parsePlaidCountries, DEFAULT_PLAID_COUNTRIES } from './plaid-countries';

describe('parsePlaidCountries', () => {
  it('defaults to the US when unset or empty', () => {
    expect(parsePlaidCountries(undefined)).toEqual([CountryCode.Us]);
    expect(parsePlaidCountries('')).toEqual(DEFAULT_PLAID_COUNTRIES);
  });

  it('accepts a comma-separated list in any case, trimmed and de-duplicated', () => {
    expect(parsePlaidCountries(' us, ca ,GB,us')).toEqual([CountryCode.Us, CountryCode.Ca, CountryCode.Gb]);
  });

  it('drops codes Plaid does not know instead of sending them', () => {
    expect(parsePlaidCountries('US,XX,BR')).toEqual([CountryCode.Us]);
  });

  it('falls back to the US when nothing valid is left', () => {
    expect(parsePlaidCountries('XX, , nope')).toEqual([CountryCode.Us]);
  });
});
