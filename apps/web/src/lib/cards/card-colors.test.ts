import { describe, it, expect } from 'vitest';
import { cardColor } from './card-colors';

describe('cardColor', () => {
  it('matches a known product by name, ignoring case and ®/™ marks', () => {
    expect(cardColor('American Express', 'Gold Card®')).toBe(cardColor('Amex', 'american express gold card'));
    expect(cardColor('Chase', 'Sapphire Reserve®')).not.toBe(cardColor('Chase', 'Sapphire Preferred®'));
  });

  it('a product match beats the issuer color', () => {
    expect(cardColor('American Express', 'Platinum Card')).not.toBe(cardColor('American Express', 'Some Other Card'));
  });

  it('falls back to the issuer color when the product is unknown', () => {
    const boa = cardColor('Bank of America', 'Customized Cash Rewards Visa Signature');
    expect(boa).toMatch(/^#[0-9A-F]{6}$/i);
    expect(cardColor('Bank of America', 'Unlimited Cash Rewards Visa Signature')).toBe(boa);
    expect(cardColor('Chase', 'Ultimate Rewards®')).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('recognizes issuers written differently', () => {
    expect(cardColor('BofA', 'Card')).toBe(cardColor('Bank of America', 'Card'));
    expect(cardColor('JPMorgan Chase', 'Card')).toBe(cardColor('Chase', 'Card'));
    expect(cardColor('Capital One', 'Card')).toBe(cardColor('CapitalOne', 'Card'));
  });

  it('returns null for an unknown bank so the theme accent is used', () => {
    expect(cardColor('First Platypus Bank', 'Plaid Credit Card')).toBeNull();
    expect(cardColor('', '')).toBeNull();
  });
});
