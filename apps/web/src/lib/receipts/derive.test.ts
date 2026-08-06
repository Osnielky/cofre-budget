import { describe, it, expect } from 'vitest';
import {
  statTotals,
  distinctMerchants,
  filterReceipts,
  countGroups,
  money,
  statusLabel,
  DEFAULT_FILTERS,
  groupItemsByCategory,
  type ReceiptLite,
  type ReceiptItem,
  type CategoryLite,
} from './derive';

function receipt(p: Partial<ReceiptLite> = {}): ReceiptLite {
  return {
    id: 'r1',
    merchant: 'Amazon',
    rawSubject: 'Your order has shipped',
    total: 42.5,
    imported: false,
    orderDate: '2026-07-10',
    matchStatus: 'pending',
    ...p,
  };
}

describe('statTotals', () => {
  it('counts total, imported, and pending', () => {
    const receipts = [receipt({ imported: true }), receipt({ imported: false }), receipt({ imported: false })];
    const totals = statTotals(receipts);
    expect(totals.total).toBe(3);
    expect(totals.imported).toBe(1);
    expect(totals.pending).toBe(2);
  });

  it('counts matchedCount as imported-or-matched, and computes matchRate', () => {
    const receipts = [
      receipt({ imported: true, matchStatus: 'pending' }), // counts via imported
      receipt({ imported: false, matchStatus: 'matched' }), // counts via matchStatus
      receipt({ imported: false, matchStatus: 'pending' }), // neither
    ];
    const totals = statTotals(receipts);
    expect(totals.matchedCount).toBe(2);
    expect(totals.matchRate).toBe(67); // 2/3 rounded
  });

  it('returns zeroes for an empty list', () => {
    expect(statTotals([])).toEqual({ total: 0, imported: 0, pending: 0, matchedCount: 0, matchRate: 0 });
  });

  it('excludes matched (but not imported) receipts from the pending count, matching statusLabel', () => {
    const receipts = [
      receipt({ imported: false, matchStatus: 'matched' }),
      receipt({ imported: false, matchStatus: 'pending' }),
    ];
    const totals = statTotals(receipts);
    expect(totals.pending).toBe(1); // only the truly-pending one
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

  it('filters by status: imported takes priority, then matched, then pending', () => {
    const receipts = [
      receipt({ imported: true, matchStatus: 'matched' }),
      receipt({ imported: false, matchStatus: 'matched' }),
      receipt({ imported: false, matchStatus: 'pending' }),
    ];
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, status: 'imported' })).toHaveLength(1);
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, status: 'matched' })).toHaveLength(1);
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, status: 'pending' })).toHaveLength(1);
  });

  it('filters by date range, excluding receipts with no orderDate when a bound is set', () => {
    const receipts = [receipt({ orderDate: '2026-07-01' }), receipt({ orderDate: '2026-07-15' }), receipt({ orderDate: null })];
    const inRange = filterReceipts(receipts, { ...DEFAULT_FILTERS, dateFrom: '2026-07-10', dateTo: '2026-07-31' });
    expect(inRange).toHaveLength(1);
    expect(inRange[0].orderDate).toBe('2026-07-15');
  });

  it('filters by source', () => {
    const receipts = [receipt({ source: 'gmail' }), receipt({ source: 'manual' })];
    expect(filterReceipts(receipts, { ...DEFAULT_FILTERS, source: 'manual' })).toHaveLength(1);
  });
});

describe('money', () => {
  it('formats a plain amount with two decimal places', () => {
    expect(money(12.5)).toBe('$12.50');
  });
  it('adds a thousands separator', () => {
    expect(money(1234.5)).toBe('$1,234.50');
  });
  it('takes the absolute value of negative amounts', () => {
    expect(money(-42)).toBe('$42.00');
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

describe('statusLabel', () => {
  it('returns Imported when imported is true, regardless of matchStatus', () => {
    expect(statusLabel({ imported: true, matchStatus: 'pending' })).toBe('Imported');
    expect(statusLabel({ imported: true, matchStatus: 'matched' })).toBe('Imported');
  });
  it('returns Matched when not imported but matchStatus is matched', () => {
    expect(statusLabel({ imported: false, matchStatus: 'matched' })).toBe('Matched');
  });
  it('returns Pending when neither imported nor matched', () => {
    expect(statusLabel({ imported: false, matchStatus: 'pending' })).toBe('Pending');
  });
});

describe('groupItemsByCategory', () => {
  const items: ReceiptItem[] = [
    { name: 'Bananas', quantity: 1, unitPrice: 3.49, total: 3.49 },
    { name: 'Bread', quantity: 1, unitPrice: 5.99, total: 5.99 },
    { name: 'USB cable', quantity: 1, unitPrice: 12.99, total: 12.99 },
  ];
  const categories: CategoryLite[] = [
    { id: 'cat-groceries', name: 'Groceries', icon: '🛒', color: '#4FBF7F' },
    { id: 'cat-shopping', name: 'Shopping', icon: '🛍️', color: '#9B6DFF' },
  ];

  it('groups items sharing a category and sums their totals', () => {
    const groups = groupItemsByCategory(
      items,
      { 0: 'cat-groceries', 1: 'cat-groceries', 2: 'cat-shopping' },
      categories,
    );
    expect(groups).toHaveLength(2);
    const groceries = groups.find((g) => g.categoryId === 'cat-groceries');
    expect(groceries?.itemIndices).toEqual([0, 1]);
    expect(groceries?.total).toBeCloseTo(9.48);
    expect(groceries?.categoryName).toBe('Groceries');
  });

  it('puts unassigned items into a trailing Uncategorized group', () => {
    const groups = groupItemsByCategory(items, { 0: 'cat-groceries' }, categories);
    const uncategorized = groups[groups.length - 1];
    expect(uncategorized.categoryId).toBeNull();
    expect(uncategorized.categoryName).toBe('Uncategorized');
    expect(uncategorized.itemIndices).toEqual([1, 2]);
  });

  it('orders categorized groups by total descending, with Uncategorized always last', () => {
    const groups = groupItemsByCategory(items, { 0: 'cat-shopping', 1: 'cat-groceries' }, categories);
    expect(groups.map((g) => g.categoryId)).toEqual(['cat-shopping', 'cat-groceries', null]);
  });

  it('returns a single Uncategorized group when nothing is assigned', () => {
    const groups = groupItemsByCategory(items, {}, categories);
    expect(groups).toHaveLength(1);
    expect(groups[0].categoryId).toBeNull();
    expect(groups[0].itemIndices).toEqual([0, 1, 2]);
  });
});
