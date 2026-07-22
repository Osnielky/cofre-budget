/* Pure, framework-free receipt derivation logic for the /receipts page:
   stat-strip totals, merchant list, list filtering, and transaction-
   group counting. Kept separate from the React components so it can be
   unit tested directly, mirroring src/lib/dashboard/derive.ts. */

export interface ReceiptItem { name: string; quantity: number; unitPrice: number; total: number }

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
}

/** Subset of Receipt needed by stat/filter logic — any Receipt satisfies this structurally. */
export interface ReceiptLite {
  id: string;
  merchant: string;
  rawSubject: string;
  total: number;
  imported: boolean;
  orderDate: string | null;
}

export type ReceiptStatus = 'all' | 'imported' | 'pending';

export interface ReceiptFilters {
  search: string;
  merchant: string;  // '' = all
  dateFrom: string;   // '' = no lower bound, else 'YYYY-MM-DD'
  dateTo: string;     // '' = no upper bound
  status: ReceiptStatus;
}

export const DEFAULT_FILTERS: ReceiptFilters = {
  search: '', merchant: '', dateFrom: '', dateTo: '', status: 'all',
};

export function currentMonthPrefix(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export interface StatTotals {
  total: number;
  imported: number;
  pending: number;
  thisMonthTotal: number;
}

export function statTotals(receipts: ReceiptLite[], now = new Date()): StatTotals {
  const monthPrefix = currentMonthPrefix(now);
  const imported = receipts.filter((r) => r.imported).length;
  const thisMonthTotal = receipts
    .filter((r) => r.orderDate?.startsWith(monthPrefix))
    .reduce((sum, r) => sum + Number(r.total), 0);
  return {
    total: receipts.length,
    imported,
    pending: receipts.length - imported,
    thisMonthTotal,
  };
}

export function distinctMerchants(receipts: ReceiptLite[]): string[] {
  return [...new Set(receipts.map((r) => r.merchant))].sort((a, b) => a.localeCompare(b));
}

export function filterReceipts<T extends ReceiptLite>(receipts: T[], filters: ReceiptFilters): T[] {
  const search = filters.search.trim().toLowerCase();
  return receipts.filter((r) => {
    if (search && !r.merchant.toLowerCase().includes(search) && !r.rawSubject.toLowerCase().includes(search)) return false;
    if (filters.merchant && r.merchant !== filters.merchant) return false;
    if (filters.status === 'imported' && !r.imported) return false;
    if (filters.status === 'pending' && r.imported) return false;
    if (filters.dateFrom && (!r.orderDate || r.orderDate < filters.dateFrom)) return false;
    if (filters.dateTo && (!r.orderDate || r.orderDate > filters.dateTo)) return false;
    return true;
  });
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
