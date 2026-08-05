/* Pure, framework-free receipt derivation logic for the /receipts page:
   stat-strip totals, merchant list, list filtering, and transaction-
   group counting. Kept separate from the React components so it can be
   unit tested directly, mirroring src/lib/dashboard/derive.ts. */

export interface ReceiptItem { name: string; quantity: number; unitPrice: number; total: number }

export type ReceiptSource = 'gmail' | 'manual';
export type MatchStatus = 'matched' | 'pending';

export interface MatchedTransaction {
  id: string;
  name: string;
  amount: number;
  date: string;
  category: { id: string; name: string; icon: string; color: string } | null;
}

export interface Receipt {
  id: string;
  merchant: string;
  orderNumber: string | null;
  orderDate: string | null;
  total: number;
  currency: string;
  items: ReceiptItem[];
  rawSubject: string;
  imported: boolean;
  parsedAt: string;
  source: ReceiptSource;
  matchStatus: MatchStatus;
  matchedTransaction: MatchedTransaction | null;
  imageMimeType: string | null;
}

/** Subset of Receipt needed by stat/filter logic — any Receipt satisfies this structurally. */
export interface ReceiptLite {
  id: string;
  merchant: string;
  rawSubject: string;
  total: number;
  imported: boolean;
  orderDate: string | null;
  matchStatus: MatchStatus;
  source?: ReceiptSource;
}

export type ReceiptStatus = 'all' | 'imported' | 'matched' | 'pending';

export interface ReceiptFilters {
  search: string;
  merchant: string;
  dateFrom: string;   // '' = no lower bound, else 'YYYY-MM-DD'
  dateTo: string;     // '' = no upper bound
  status: ReceiptStatus;
  source: '' | ReceiptSource; // '' = all
}

export const DEFAULT_FILTERS: ReceiptFilters = {
  search: '', merchant: '', dateFrom: '', dateTo: '', status: 'all', source: '',
};

export interface StatTotals {
  total: number;
  imported: number;
  pending: number;
  matchedCount: number; // imported OR matched — either way it has a linked transaction
  matchRate: number;    // 0-100, rounded, matchedCount / total
}

export function statTotals(receipts: ReceiptLite[]): StatTotals {
  const imported = receipts.filter((r) => r.imported).length;
  const matchedCount = receipts.filter((r) => r.imported || r.matchStatus === 'matched').length;
  return {
    total: receipts.length,
    imported,
    pending: receipts.length - imported,
    matchedCount,
    matchRate: receipts.length ? Math.round((matchedCount / receipts.length) * 100) : 0,
  };
}

export function distinctMerchants(receipts: ReceiptLite[]): string[] {
  return [...new Set(receipts.map((r) => r.merchant))].sort((a, b) => a.localeCompare(b));
}

/** Imported takes priority (it's already a real transaction), then Matched, then Pending. */
export function statusLabel(r: { imported: boolean; matchStatus: MatchStatus }): 'Imported' | 'Matched' | 'Pending' {
  if (r.imported) return 'Imported';
  return r.matchStatus === 'matched' ? 'Matched' : 'Pending';
}

export function filterReceipts<T extends ReceiptLite>(receipts: T[], filters: ReceiptFilters): T[] {
  const search = filters.search.trim().toLowerCase();
  return receipts.filter((r) => {
    if (search && !r.merchant.toLowerCase().includes(search) && !r.rawSubject.toLowerCase().includes(search)) return false;
    if (filters.merchant && r.merchant !== filters.merchant) return false;
    if (filters.source && r.source !== filters.source) return false;
    const label = statusLabel(r);
    if (filters.status === 'imported' && label !== 'Imported') return false;
    if (filters.status === 'matched' && label !== 'Matched') return false;
    if (filters.status === 'pending' && label !== 'Pending') return false;
    if (filters.dateFrom && (!r.orderDate || r.orderDate < filters.dateFrom)) return false;
    if (filters.dateTo && (!r.orderDate || r.orderDate > filters.dateTo)) return false;
    return true;
  });
}

/** Shared dollar formatter for the receipts feature — always displays a
    positive figure (callers never need to show a negative sign here). */
export function money(n: number): string {
  return `$${Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Number of transactions creating a receipt's items will produce: one per
    distinct assigned category, plus one for any items left uncategorized. */
export function countGroups(itemCount: number, itemCategories: Record<number, string>): number {
  const assigned = new Set<string>();
  let hasUncategorized = false;
  for (let idx = 0; idx < itemCount; idx++) {
    const catId = itemCategories[idx];
    if (catId) assigned.add(catId);
    else hasUncategorized = true;
  }
  return assigned.size + (hasUncategorized ? 1 : 0) || 1;
}
