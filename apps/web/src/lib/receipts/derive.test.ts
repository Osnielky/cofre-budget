import { describe, it, expect } from 'vitest';
import { statTotals, distinctMerchants, filterReceipts, countGroups, DEFAULT_FILTERS, type ReceiptLite } from './derive';

function receipt(p: Partial<ReceiptLite> = {}): ReceiptLite {
  return {
    id: 'r1', merchant: 'Amazon', rawSubject: 'Your order has shipped',
    total: 42.5, imported: false, orderDate: '2026-07-10', ...p,
  };
}

const NOW = new Date(2026, 6, 20); // Jul 20 2026

describe('statTotals', () => {
  it('counts total, imported, and pending', () => {
    const receipts = [receipt({ imported: true }), receipt({ imported: false }), receipt({ imported: false })];
    const totals = statTotals(receipts, NOW);
    expect(totals.total).toBe(3);
    expect(totals.imported).toBe(1);
    expect(totals.pending).toBe(2);
  });

  it('sums totals only for receipts dated in the current month', () => {
    const receipts = [
      receipt({ orderDate: '2026-07-05', total: 10 }),
      receipt({ orderDate: '2026-06-30', total: 100 }), // previous month — excluded
      receipt({ orderDate: null, total: 50 }),           // no date — excluded
    ];
    expect(statTotals(receipts, NOW).thisMonthTotal).toBe(10);
  });

  it('returns zeroes for an empty list', () => {
    expect(statTotals([], NOW)).toEqual({ total: 0, imported: 0, pending: 0, thisMonthTotal: 0 });
  });
});

describe('distinctMerchants', () => {
  it('dedupes and sorts alphabetically', () => {
    const receipts = [receipt({ merchant: 'Walmart' }), receipt({ merchant: 'Amazon' }), receipt({ merchant: 'Amazon' })];
    expect(distinctMerchants(receipts)).toEqual(['Amazon', 'Walmart']);
  });
});

describe('filterReceipts', () => {
  it('returns everything when filters are default', () => {
    const receipts = [receipt(), receipt({ merchant: 'Costco' })];
    expect(filterReceipts(receipts, DEFAULT_FILTERS)).toHaveLength(2);
  });

  it('matches search against merchant or subject', () => {
    const receipts = [
      receipt({ merchant: 'Costco', rawSubject: 'Your receipt' }),
      receipt({ merchant: 'Amazon', rawSubject: 'Order shipped' }),
    ];
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, search: 'costco' })).toHaveLength(1);
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, search: 'shipped' })).toHaveLength(1);
  });

  it('filters by exact merchant', () => {
    const receipts = [receipt({ merchant: 'Costco' }), receipt({ merchant: 'Amazon' })];
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, merchant: 'Costco' })).toHaveLength(1);
  });

  it('filters by status', () => {
    const receipts = [receipt({ imported: true }), receipt({ imported: false })];
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, status: 'imported' })).toHaveLength(1);
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, status: 'pending' })).toHaveLength(1);
  });

  it('filters by date range, excluding receipts with no orderDate when a bound is set', () => {
    const receipts = [
      receipt({ orderDate: '2026-07-01' }),
      receipt({ orderDate: '2026-07-15' }),
      receipt({ orderDate: null }),
    ];
    const inRange = filterReceipts(receipts, { ...DEFAULT_FILTERS, dateFrom: '2026-07-10', dateTo: '2026-07-31' });
    expect(inRange).toHaveLength(1);
    expect(inRange[0].orderDate).toBe('2026-07-15');
  });
});

describe('countGroups', () => {
  it('returns 1 when nothing is categorized', () => {
    expect(countGroups(3, {})).toBe(1);
  });
  it('counts distinct categories plus one uncategorized bucket', () => {
    expect(countGroups(3, { 0: 'cat-a', 1: 'cat-a', 2: 'cat-b' })).toBe(2);
  });
  it('adds an uncategorized bucket when some items are unassigned', () => {
    expect(countGroups(3, { 0: 'cat-a' })).toBe(2); // cat-a + uncategorized
  });
  it('never returns zero for an empty item list', () => {
    expect(countGroups(0, {})).toBe(1);
  });
});
