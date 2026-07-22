# Receipts Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/receipts` from a simple card list + modal into a stat-strip + filter bar + row list + responsive detail panel, matching the visual bar set on the Dashboard and Transactions pages — no backend changes.

**Architecture:** Pure filter/stat logic is extracted into a new, unit-tested module (`src/lib/receipts/derive.ts`, mirroring the existing `src/lib/dashboard/derive.ts` pattern). Four new presentational components (`StatStrip`, `FilterBar`, `ReceiptRow`, `ReceiptDetailPanel`) consume that logic. `receipts/page.tsx` is rewritten to orchestrate them, following the exact `hidden md:flex` rail convention already used by `transactions/InsightsPanel.tsx`.

**Tech Stack:** Next.js 16 / React 19 / Tailwind v4 (web), Vitest (unit tests for pure logic only — no component-level test runner exists in this repo).

## Global Constraints

- No new backend endpoints or entity changes — reuses `GET /api/receipts`, `GET /api/categories`, `POST /api/receipts/:id/import` exactly as they exist today.
- All colors must come from the theme CSS variables in `apps/web/src/app/globals.css` (`--color-surface`, `--color-elevated`, `--color-border`, `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-primary`, `--color-green`, `--color-amber`, `--color-sky`, `--color-violet`, `--color-card-violet`, `--glass-blur`, `--glass-border`, `--glass-shadow`, `--popover-bg`, `--color-base`) — never hardcoded hex/rgba.
- No "Category" filter or chip — `Receipt` has no category field (see spec correction in `docs/superpowers/specs/2026-07-22-receipts-redesign-design.md`).
- No "Source" filter and no stat-strip deltas in this pass — explicitly deferred (see spec).
- Desktop detail panel must be `hidden md:flex` (invisible below the `md` breakpoint), matching `apps/web/src/app/transactions/InsightsPanel.tsx`'s exact convention.
- Commit locally after each task; do not push.

---

### Task 1: Extract pure receipt logic (`src/lib/receipts/derive.ts`)

**Files:**
- Create: `apps/web/src/lib/receipts/derive.ts`
- Create: `apps/web/src/lib/receipts/derive.test.ts`
- Modify: `apps/web/vitest.config.ts`

**Interfaces:**
- Produces: `ReceiptItem`, `Receipt`, `ReceiptLite`, `ReceiptStatus`, `ReceiptFilters`, `DEFAULT_FILTERS`, `statTotals(receipts, now?) => { total, imported, pending, thisMonthTotal }`, `distinctMerchants(receipts) => string[]`, `filterReceipts(receipts, filters) => Receipt[]`, `countGroups(itemCount, itemCategories) => number` — all consumed by Tasks 2–4.

- [ ] **Step 1: Write the failing test file**

Create `apps/web/src/lib/receipts/derive.test.ts`:

```ts
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
```

- [ ] **Step 2: Update vitest config to include the new test path**

Modify `apps/web/vitest.config.ts` — change the `include` array:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/lib/dashboard/**/*.test.ts', 'src/lib/receipts/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run --root apps/web src/lib/receipts`
Expected: FAIL — `Cannot find module './derive'` (file doesn't exist yet)

- [ ] **Step 4: Write the implementation**

Create `apps/web/src/lib/receipts/derive.ts`:

```ts
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
  return now.toISOString().slice(0, 7);
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run --root apps/web src/lib/receipts`
Expected: PASS — all 13 tests green

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/receipts/derive.ts apps/web/src/lib/receipts/derive.test.ts apps/web/vitest.config.ts
git commit -m "feat(receipts): extract pure stat/filter/group logic with unit tests"
```

---

### Task 2: `StatStrip` and `FilterBar` components

**Files:**
- Create: `apps/web/src/app/receipts/StatStrip.tsx`
- Create: `apps/web/src/app/receipts/FilterBar.tsx`

**Interfaces:**
- Consumes: `statTotals`, `ReceiptLite`, `ReceiptFilters`, `ReceiptStatus`, `DEFAULT_FILTERS` from `@/lib/receipts/derive` (Task 1).
- Produces: `StatStrip` component (props: `{ receipts: ReceiptLite[]; loading: boolean }`), `FilterBar` component (props: `{ filters: ReceiptFilters; onChange: (next: ReceiptFilters) => void; merchants: string[] }`) — both consumed by Task 4.

- [ ] **Step 1: Create the StatStrip component**

Create `apps/web/src/app/receipts/StatStrip.tsx`:

```tsx
'use client';

/* Four summary tiles for the receipts page: total / auto-imported /
   pending review / this month's $, computed from the already-fetched
   receipts list via statTotals(). No period-over-period deltas (unlike
   the transactions StatStrip) — not enough historical signal yet. */

import { statTotals, type ReceiptLite } from '@/lib/receipts/derive';

interface Props {
  receipts: ReceiptLite[];
  loading: boolean;
}

function MiniIcon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const I_DOC    = 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M14 3v6h6 M9 13h6 M9 17h6';
const I_CHECK  = 'M4 12l5 5L20 6';
const I_CLOCK  = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 8v4l3 3';
const I_DOLLAR = 'M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6';

const money = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function StatStrip({ receipts, loading }: Props) {
  const t = statTotals(receipts);

  const tiles: { label: string; value: string; color: string; icon: string }[] = [
    { label: 'Total Receipts', value: String(t.total), color: 'var(--color-sky)', icon: I_DOC },
    { label: 'Auto-imported', value: String(t.imported), color: 'var(--color-green)', icon: I_CHECK },
    { label: 'Pending Review', value: String(t.pending), color: 'var(--color-amber)', icon: I_CLOCK },
    { label: 'This Month', value: money(t.thisMonthTotal), color: 'var(--color-violet)', icon: I_DOLLAR },
  ];

  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      {tiles.map((tile) => (
        <div key={tile.label} className="flex items-center gap-3 rounded-xl py-2.5 px-3 min-w-0"
          style={{ border: 'var(--glass-border)', background: `color-mix(in srgb, ${tile.color} 4%, transparent)` }}>
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{
              color: tile.color,
              background: `color-mix(in srgb, ${tile.color} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${tile.color} 40%, transparent)`,
              boxShadow: `0 0 10px color-mix(in srgb, ${tile.color} 20%, transparent)`,
            }}>
            <MiniIcon d={tile.icon} />
          </span>
          <div className="min-w-0">
            <p className="text-[10.5px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{tile.label}</p>
            <p className="text-[14px] font-bold tabular-nums truncate">{loading ? '—' : tile.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create the FilterBar component**

Create `apps/web/src/app/receipts/FilterBar.tsx`:

```tsx
'use client';

import type { ReceiptFilters, ReceiptStatus } from '@/lib/receipts/derive';
import { DEFAULT_FILTERS } from '@/lib/receipts/derive';

interface Props {
  filters: ReceiptFilters;
  onChange: (next: ReceiptFilters) => void;
  merchants: string[];
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-elevated)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)',
};

export default function FilterBar({ filters, onChange, merchants }: Props) {
  function set<K extends keyof ReceiptFilters>(key: K, value: ReceiptFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  const isDefault =
    !filters.search && !filters.merchant && !filters.dateFrom && !filters.dateTo && filters.status === 'all';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        placeholder="Search receipts, merchants…"
        value={filters.search}
        onChange={(e) => set('search', e.target.value)}
        className="flex-1 min-w-[180px] px-3 py-2 text-sm rounded-xl outline-none"
        style={inputStyle}
      />
      <select value={filters.merchant} onChange={(e) => set('merchant', e.target.value)}
        className="px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle}>
        <option value="">All Merchants</option>
        {merchants.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <input type="date" value={filters.dateFrom} onChange={(e) => set('dateFrom', e.target.value)}
        className="px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />
      <span style={{ color: 'var(--color-text-muted)' }}>→</span>
      <input type="date" value={filters.dateTo} onChange={(e) => set('dateTo', e.target.value)}
        className="px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle} />
      <select value={filters.status} onChange={(e) => set('status', e.target.value as ReceiptStatus)}
        className="px-3 py-2 text-sm rounded-xl outline-none" style={inputStyle}>
        <option value="all">All Statuses</option>
        <option value="imported">Imported</option>
        <option value="pending">Pending Review</option>
      </select>
      {!isDefault && (
        <button
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="px-3 py-2 text-sm font-medium rounded-xl transition-colors"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
          Clear filters
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify the project still builds**

Run: `npm run build:web`
Expected: exits 0 with no type errors (these components aren't imported anywhere yet, but the build must still succeed — a syntax/type error in a new file fails the whole build even if unused)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/receipts/StatStrip.tsx apps/web/src/app/receipts/FilterBar.tsx
git commit -m "feat(receipts): add StatStrip and FilterBar components"
```

---

### Task 3: `ReceiptRow` and `ReceiptDetailPanel` components

**Files:**
- Create: `apps/web/src/app/receipts/ReceiptRow.tsx`
- Create: `apps/web/src/app/receipts/ReceiptDetailPanel.tsx`

**Interfaces:**
- Consumes: `Receipt`, `countGroups` from `@/lib/receipts/derive` (Task 1).
- Produces: `ReceiptRow` component (props: `{ receipt: Receipt; onClick: () => void }`), `ReceiptDetailPanel` component (props: `{ receipt: Receipt; categories: Category[]; itemCategories: Record<number, string>; onSetCategory: (idx: number, categoryId: string) => void; onImport: () => void; importing: boolean; onClose: () => void }`, where `Category = { id: string; name: string; icon: string; color: string; type: string }`) — both consumed by Task 4.

- [ ] **Step 1: Create the ReceiptRow component**

Create `apps/web/src/app/receipts/ReceiptRow.tsx`:

```tsx
'use client';

import type { Receipt } from '@/lib/receipts/derive';

interface Props {
  receipt: Receipt;
  onClick: () => void;
}

function money(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

export default function ReceiptRow({ receipt: r, onClick }: Props) {
  const itemCount = r.items.length;
  return (
    <button onClick={onClick}
      className="w-full text-left rounded-2xl p-4 transition-colors hover:brightness-110 flex items-center justify-between gap-3"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)' }}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{r.merchant}</p>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
          {r.orderDate ?? '—'}{r.orderNumber ? ` · Order ${r.orderNumber}` : ''}
        </p>
      </div>
      <span className="text-xs px-2 py-1 rounded-full shrink-0 hidden sm:inline-block"
        style={{ background: 'color-mix(in srgb, var(--color-violet) 12%, transparent)', color: 'var(--color-violet)' }}>
        {itemCount} item{itemCount === 1 ? '' : 's'}
      </span>
      <div className="text-right shrink-0">
        <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>{money(r.total)}</p>
        <span className="text-xs px-2 py-0.5 rounded-full"
          style={r.imported
            ? { background: 'color-mix(in srgb, var(--color-green) 12%, transparent)', color: 'var(--color-green)' }
            : { background: 'color-mix(in srgb, var(--color-amber) 12%, transparent)', color: 'var(--color-amber)' }}>
          {r.imported ? 'Imported' : 'Pending Review'}
        </span>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Create the ReceiptDetailPanel component**

Create `apps/web/src/app/receipts/ReceiptDetailPanel.tsx`:

```tsx
'use client';

import { countGroups, type Receipt } from '@/lib/receipts/derive';

interface Category { id: string; name: string; icon: string; color: string; type: string }

interface Props {
  receipt: Receipt;
  categories: Category[];
  itemCategories: Record<number, string>;
  onSetCategory: (idx: number, categoryId: string) => void;
  onImport: () => void;
  importing: boolean;
  onClose: () => void;
}

function money(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

export default function ReceiptDetailPanel({
  receipt, categories, itemCategories, onSetCategory, onImport, importing, onClose,
}: Props) {
  const groups = countGroups(receipt.items.length, itemCategories);

  return (
    <div className="flex flex-col h-full p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="font-bold text-lg" style={{ color: 'var(--color-text-primary)' }}>{receipt.merchant}</h2>
          {receipt.orderNumber && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Order {receipt.orderNumber}</p>}
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ color: 'var(--color-text-muted)' }}>✕</button>
      </div>

      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium mb-4 px-2 py-1 rounded-full self-start"
        style={{ background: 'color-mix(in srgb, var(--color-sky) 12%, transparent)', color: 'var(--color-sky)' }}>
        Imported via Gmail
      </span>

      <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Assign a category to each item. Items with the same category become one transaction.
      </p>

      <div className="space-y-2 mb-6">
        {receipt.items.map((item, idx) => (
          <div key={idx} className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{item.name}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {item.quantity > 1 ? `${item.quantity}× ` : ''}{money(item.unitPrice)} = {money(item.total)}
              </p>
            </div>
            <select
              value={itemCategories[idx] ?? ''}
              onChange={(e) => onSetCategory(idx, e.target.value)}
              className="text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', minWidth: 120 }}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="rounded-xl p-3 mb-4"
        style={{ background: 'color-mix(in srgb, var(--color-card-violet) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 15%, transparent)' }}>
        <p className="text-xs" style={{ color: 'var(--color-card-violet)' }}>
          This will create <strong>{groups}</strong> transaction{groups !== 1 ? 's' : ''} totaling <strong>{money(receipt.total)}</strong>.
        </p>
      </div>

      <button onClick={onImport} disabled={importing}
        className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-80 disabled:opacity-50 mt-auto"
        style={{ background: 'linear-gradient(180deg, var(--color-card-violet), var(--color-primary))', color: '#fff' }}>
        {importing ? 'Creating…' : `Create ${groups} Transaction${groups !== 1 ? 's' : ''}`}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify the project still builds**

Run: `npm run build:web`
Expected: exits 0 with no type errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/receipts/ReceiptRow.tsx apps/web/src/app/receipts/ReceiptDetailPanel.tsx
git commit -m "feat(receipts): add ReceiptRow and ReceiptDetailPanel components"
```

---

### Task 4: Rewrite `receipts/page.tsx` to wire everything together

**Files:**
- Modify: `apps/web/src/app/receipts/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `StatStrip` (Task 2), `FilterBar` (Task 2), `ReceiptRow` (Task 3), `ReceiptDetailPanel` (Task 3), `filterReceipts`, `distinctMerchants`, `DEFAULT_FILTERS`, `Receipt`, `ReceiptFilters` (Task 1).

- [ ] **Step 1: Replace the entire file**

Replace the full contents of `apps/web/src/app/receipts/page.tsx` with:

```tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import StatStrip from './StatStrip';
import FilterBar from './FilterBar';
import ReceiptRow from './ReceiptRow';
import ReceiptDetailPanel from './ReceiptDetailPanel';
import { filterReceipts, distinctMerchants, DEFAULT_FILTERS, type Receipt, type ReceiptFilters } from '@/lib/receipts/derive';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Category { id: string; name: string; icon: string; color: string; type: string }

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Receipt | null>(null);
  const [itemCategories, setItemCategories] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [filters, setFilters] = useState<ReceiptFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    fetch(`${API}/gmail/status`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setGmailConnected(d.connected))
      .catch(() => setGmailConnected(false));

    fetch(`${API}/categories`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});

    fetch(`${API}/receipts`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setReceipts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const merchants = useMemo(() => distinctMerchants(receipts), [receipts]);
  const visible = useMemo(() => filterReceipts(receipts, filters), [receipts, filters]);
  const expenseCategories = categories.filter((c) => c.type === 'expense');

  function openReceipt(r: Receipt) {
    setSelected(r);
    setItemCategories({});
  }
  function closeReceipt() { setSelected(null); }
  function setCategory(idx: number, categoryId: string) {
    setItemCategories((prev) => ({ ...prev, [idx]: categoryId }));
  }

  async function handleImport() {
    if (!selected) return;
    setImporting(true);

    const groups: Record<string, number[]> = {};
    selected.items.forEach((_, idx) => {
      const catId = itemCategories[idx] || '__uncategorized__';
      if (!groups[catId]) groups[catId] = [];
      groups[catId].push(idx);
    });
    const splits = Object.entries(groups).map(([catId, indices]) => ({
      itemIndices: indices,
      categoryId: catId === '__uncategorized__' ? null : catId,
      bankAccountId: null,
    }));

    try {
      const res = await fetch(`${API}/receipts/${selected.id}/import`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ splits }),
      });
      if (res.ok) {
        setReceipts((prev) => prev.map((r) => r.id === selected.id ? { ...r, imported: true } : r));
        setSelected(null);
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto min-w-0 pt-14 md:pt-0">
        <div className="p-6 md:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>Receipts</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              Browse merchant receipts from your Gmail and create transactions.
            </p>
          </div>

          {gmailConnected === false && (
            <div className="rounded-2xl p-6 mb-6 text-center"
              style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)' }}>
              <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                Connect your Gmail to find receipts automatically.
              </p>
              <a href="/settings?tab=integrations"
                className="inline-block text-sm px-4 py-2 rounded-xl font-medium"
                style={{ background: 'color-mix(in srgb, var(--color-card-violet) 15%, transparent)', color: 'var(--color-card-violet)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 25%, transparent)', textDecoration: 'none' }}>
                Connect Gmail →
              </a>
            </div>
          )}

          <div className="mb-6">
            <StatStrip receipts={receipts} loading={loading} />
          </div>

          <div className="mb-6">
            <FilterBar filters={filters} onChange={setFilters} merchants={merchants} />
          </div>

          {loading && (
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading receipts…</p>
          )}

          {!loading && receipts.length === 0 && gmailConnected && (
            <div className="rounded-2xl p-8 text-center"
              style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)' }}>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No receipt emails found in the last 90 days.</p>
            </div>
          )}

          {!loading && receipts.length > 0 && visible.length === 0 && (
            <div className="rounded-2xl p-8 text-center"
              style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)' }}>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No receipts match these filters.</p>
            </div>
          )}

          <div className="grid gap-3">
            {visible.map((r) => (
              <ReceiptRow key={r.id} receipt={r} onClick={() => openReceipt(r)} />
            ))}
          </div>
        </div>
      </main>

      {/* Desktop detail rail — hidden below md, matching transactions/InsightsPanel.tsx */}
      <aside className="hidden md:flex shrink-0 flex-col overflow-hidden border-l"
        style={{ width: 400, borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        {selected ? (
          <ReceiptDetailPanel
            receipt={selected}
            categories={expenseCategories}
            itemCategories={itemCategories}
            onSetCategory={setCategory}
            onImport={handleImport}
            importing={importing}
            onClose={closeReceipt}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Select a receipt to see its details.</p>
          </div>
        )}
      </aside>

      {/* Mobile detail overlay */}
      {selected && (
        <div className="md:hidden fixed inset-0 z-50" style={{ background: 'var(--color-base)' }}>
          <ReceiptDetailPanel
            receipt={selected}
            categories={expenseCategories}
            itemCategories={itemCategories}
            onSetCategory={setCategory}
            onImport={handleImport}
            importing={importing}
            onClose={closeReceipt}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build:web`
Expected: exits 0 with no type errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/receipts/page.tsx
git commit -m "feat(receipts): wire stat strip, filters, row list, and detail rail into the page"
```

---

### Task 5: Manual browser verification

**Files:** none (verification only)

- [ ] **Step 1: Start both dev servers**

```bash
npm run dev:api &
npm run dev:web &
```

Wait for `http://localhost:3000` and `http://localhost:3333/api` to be reachable.

- [ ] **Step 2: Load the page and check each state**

Open `http://localhost:3000/receipts` in a browser (or via the project's `run`/`browse` tooling) and confirm, per the design spec's Testing section:
- Empty state renders correctly if there are no receipts yet
- Loaded state shows the stat strip (4 tiles), filter bar, and row list populated
- Search, Merchant, Date Range, and Status filters each narrow the row list correctly, and "Clear filters" reappears/disappears correctly
- Clicking a row opens the right-hand rail at desktop width (≥768px) with line items, category dropdowns, and the "Create N Transaction(s)" summary
- Resizing the browser to a mobile width (<768px) hides the rail and shows the same detail content as a full-screen overlay when a row is clicked, with a working close (✕) button
- Switching the app's theme (Settings → Appearance) confirms no hardcoded colors remain — the page should look correct in at least the default Cobalt theme and one other

- [ ] **Step 3: Stop the dev servers**

```bash
kill %1 %2
```

- [ ] **Step 4: Final commit (if any fixes were needed during verification)**

```bash
git add -A
git commit -m "fix(receipts): address issues found during manual verification"
```

(Skip this step if verification passed with no changes needed.)
