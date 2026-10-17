import { describe, it, expect } from 'vitest';
import { fillRestAmount } from './split';

describe('fillRestAmount', () => {
  it('gives the last row whatever the other rows leave', () => {
    expect(fillRestAmount(73.79, ['36.90', ''], 1)).toBe('36.89');
  });

  it("replaces the row's own amount rather than adding to it", () => {
    expect(fillRestAmount(100, ['60', '10'], 1)).toBe('40.00');
  });

  it('returns null when the split already balances', () => {
    expect(fillRestAmount(73.79, ['36.90', '36.89'], 1)).toBeNull();
  });

  it('returns null when the other rows already exceed the total', () => {
    expect(fillRestAmount(50, ['60', ''], 1)).toBeNull();
  });

  it('rounds to cents without floating-point dust', () => {
    // 0.1 + 0.2 style sums must not produce 99.69999999.
    expect(fillRestAmount(100, ['0.10', '0.20', ''], 2)).toBe('99.70');
  });

  it('treats blank and invalid amounts as zero', () => {
    expect(fillRestAmount(20, ['abc', '', ''], 2)).toBe('20.00');
  });
});
