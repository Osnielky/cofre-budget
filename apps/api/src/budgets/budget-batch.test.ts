import { describe, it, expect } from 'vitest';
import { parseAmount, parseBatchBody, MAX_BATCH_ITEMS } from './budget-batch';

describe('parseAmount', () => {
  it('accepts non-negative amounts with up to 2 decimals', () => {
    expect(parseAmount(400)).toBe(400);
    expect(parseAmount('250.5')).toBe(250.5);
    expect(parseAmount(0.1 + 0.2)).toBe(0.3); // float noise is tolerated, not rounded away
    expect(parseAmount(0)).toBe(0);
  });
  it('rejects negatives, NaN, >2 decimals and junk', () => {
    expect(parseAmount(-1)).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount(1.234)).toBeNull();
    expect(parseAmount(Infinity)).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
});

describe('parseBatchBody', () => {
  it('normalizes updates and creates', () => {
    const r = parseBatchBody({ month: '2026-10', items: [{ id: 'b1', amount: 400 }, { categoryId: 'c1', amount: '12.50' }] });
    expect(r).toEqual({ month: '2026-10', items: [{ kind: 'update', id: 'b1', amount: 400 }, { kind: 'create', categoryId: 'c1', amount: 12.5 }] });
  });
  it('rejects bad month, empty items, duplicates and invalid amounts', () => {
    expect(() => parseBatchBody({ month: '2026-13', items: [{ id: 'a', amount: 1 }] })).toThrow();
    expect(() => parseBatchBody({ month: '2026-10', items: [] })).toThrow();
    expect(() => parseBatchBody({ month: '2026-10', items: [{ id: 'a', amount: 1 }, { id: 'a', amount: 2 }] })).toThrow(/Duplicate/);
    expect(() => parseBatchBody({ month: '2026-10', items: [{ id: 'a', amount: -5 }] })).toThrow(/amount/);
    expect(() => parseBatchBody({ month: '2026-10', items: [{ amount: 5 }] })).toThrow(/id or a categoryId/);
    expect(() => parseBatchBody(null)).toThrow();
  });
  it('caps batch size', () => {
    const items = Array.from({ length: MAX_BATCH_ITEMS + 1 }, (_, i) => ({ id: `b${i}`, amount: 1 }));
    expect(() => parseBatchBody({ month: '2026-10', items })).toThrow(/At most/);
  });
});
