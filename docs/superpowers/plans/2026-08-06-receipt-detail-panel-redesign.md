# Receipt Detail Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Receipts detail panel (`apps/web/src/app/receipts/ReceiptDetailPanel.tsx`) to match the approved reference design — avatar header with email/receipt links, a merchant-history category suggestion banner, pill-style per-item category controls with collapse/group interactions, and a subtotal/tax/total + per-category "this will create" breakdown.

**Architecture:** Frontend-heavy: one new shared lib (`avatar.ts`), additions to the pure `derive.ts` logic module (unit-tested via the existing vitest setup), and an incremental rewrite of `ReceiptDetailPanel.tsx` plus its two callers in `page.tsx`. One backend addition: a `GET /receipts/:id/suggestion` endpoint that tallies categories from the user's own past transactions for the same merchant — no schema changes, reuses the existing `Transaction.receiptId` FK.

**Tech Stack:** Next.js 16 / React 19 / Tailwind v4 (web), NestJS 11 + TypeORM (api), vitest for pure-logic unit tests (`apps/web/src/lib/**`).

## Global Constraints

- No component-level test runner exists (no React Testing Library / jsdom) — verify UI changes manually via `npm run dev:web` plus `npm run build:web` for type-safety, per this repo's established convention (see `docs/superpowers/specs/2026-08-05-receipts-table-layout-design.md`'s Testing/Verification section).
- Pure-logic files under `apps/web/src/lib/{dashboard,receipts,budgets}/**` **do** have real vitest coverage (`npm run test:dashboard`, config at `apps/web/vitest.config.ts`) — any new pure function added there must ship with tests, following `apps/web/src/lib/receipts/derive.test.ts`'s existing style (`describe`/`it`, a small `receipt()`/fixture builder).
- Colors/surfaces must only ever come from the CSS variables already defined in `apps/web/src/app/globals.css` (`--color-*`) — never hardcode hex/theme colors in components. Chart/category colors already carry their own `color` field from the `categories` API — reuse it, don't invent new palettes.
- `--color-primary` / `--color-indigo` are UI accents only, never used as category-identity colors — not relevant here since all category colors come from the `categories` table, but don't introduce new blue/indigo accents for anything that isn't already using them (the violet accent already used for the "this will create" box is fine, matches existing convention).
- Every page/panel must remain responsive across screen sizes — this panel already has a working mobile full-screen overlay in `page.tsx` (the `md:hidden` block); don't break that path, verify at mobile width too.
- Discovered during planning (corrects the design spec): `Receipt.gmailMessageId` is **already** present in the `GET /receipts` JSON response — `ReceiptsService.withMatchStatus` spreads the full TypeORM entity (`{ ...receipt, matchStatus, matchedTransaction }`, `receipts.service.ts:132`) and the entity column has no `select: false`. No backend change is needed to expose it — only the frontend `Receipt` TypeScript interface needs the field added (Task 3).

---

## Task 1: Shared avatar helper (`avatarColor`/`initials`)

**Files:**
- Create: `apps/web/src/lib/avatar.ts`
- Create: `apps/web/src/lib/avatar.test.ts`
- Modify: `apps/web/vitest.config.ts:6` (add the new test file to `include`)
- Modify: `apps/web/src/app/debts/page.tsx:25-37` (remove the duplicated local copy, import the shared one)

**Interfaces:**
- Produces: `avatarColor(name: string): string` (returns one of six `var(--color-card-*)`/`var(--color-rose)` CSS var strings), `initials(name: string): string` (up to 2 uppercase initials, `'?'` fallback). Both consumed later by Task 5 (`ReceiptDetailPanel.tsx` header).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/avatar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { avatarColor, initials } from './avatar';

const PALETTE = [
  'var(--color-card-violet)', 'var(--color-card-green)', 'var(--color-card-orange)',
  'var(--color-card-amber)', 'var(--color-card-sky)', 'var(--color-rose)',
];

describe('avatarColor', () => {
  it('is deterministic for the same name', () => {
    expect(avatarColor('Whole Foods Market')).toBe(avatarColor('Whole Foods Market'));
  });

  it('returns a value from the known palette', () => {
    expect(PALETTE).toContain(avatarColor('Amazon'));
  });

  it('varies across different names', () => {
    const colors = new Set(['Amazon', 'Netflix', 'Shell', 'Target', 'Chipotle'].map(avatarColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('initials', () => {
  it('takes the first letter of up to two words', () => {
    expect(initials('Whole Foods Market')).toBe('WF');
    expect(initials('Netflix')).toBe('N');
  });

  it('uppercases lowercase input', () => {
    expect(initials('shell #4412')).toBe('S#');
  });

  it('falls back to ? for blank input', () => {
    expect(initials('   ')).toBe('?');
  });
});
```

- [ ] **Step 2: Add the file to vitest's include list and run to verify it fails**

Edit `apps/web/vitest.config.ts` — change the `include` array from:

```ts
    include: ['src/lib/dashboard/**/*.test.ts', 'src/lib/receipts/**/*.test.ts', 'src/lib/budgets/**/*.test.ts'],
```

to:

```ts
    include: ['src/lib/dashboard/**/*.test.ts', 'src/lib/receipts/**/*.test.ts', 'src/lib/budgets/**/*.test.ts', 'src/lib/avatar.test.ts'],
```

Run: `npm run test:dashboard`
Expected: FAIL — `Cannot find module './avatar'` (or similar resolution error) from `avatar.test.ts`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/avatar.ts`:

```ts
const AVATAR_COLORS = [
  'var(--color-card-violet)', 'var(--color-card-green)', 'var(--color-card-orange)',
  'var(--color-card-amber)', 'var(--color-card-sky)', 'var(--color-rose)',
];

/** Stable hash of a name to one of the fixed accent colors — used for merchant/person avatars. */
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:dashboard`
Expected: PASS — all `avatar.test.ts` cases plus the pre-existing dashboard/receipts/budgets suites green.

- [ ] **Step 5: Refactor `debts/page.tsx` to use the shared helper**

In `apps/web/src/app/debts/page.tsx`, replace lines 25-37:

```ts
/* People-first: each person gets a stable avatar color derived from their name */
const AVATAR_COLORS = [
  'var(--color-card-violet)', 'var(--color-card-green)', 'var(--color-card-orange)',
  'var(--color-card-amber)', 'var(--color-card-sky)', 'var(--color-rose)',
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';
}
```

with:

```ts
import { avatarColor, initials } from '@/lib/avatar';
```

(Add that import near the top of the file alongside the existing `Sidebar` import at line 5; delete the block above entirely — the two call sites at lines 235 and 255 need no changes since the function names/signatures are identical.)

- [ ] **Step 6: Verify the debts page still compiles and renders**

Run: `npm run build:web`
Expected: build succeeds with no type errors.

Manually: `npm run dev:web`, open `/debts`, confirm each debt still shows a colored initials avatar exactly as before.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/avatar.ts apps/web/src/lib/avatar.test.ts apps/web/vitest.config.ts apps/web/src/app/debts/page.tsx
git commit -m "refactor(web): extract shared avatarColor/initials helper"
```

---

## Task 2: Backend — merchant category suggestion endpoint

**Files:**
- Modify: `apps/api/src/receipts/receipts.service.ts:1-3` (imports), and add a new method after `approve` (currently ending at line 225)
- Modify: `apps/api/src/receipts/receipts.controller.ts` (add a new route)

**Interfaces:**
- Produces: `ReceiptsService.getMerchantSuggestion(userId: string, receiptId: string): Promise<MerchantSuggestion | null>` where `MerchantSuggestion = { categoryId: string; categoryName: string; icon: string; color: string; receiptsConsidered: number }`. Exposed as `GET /receipts/:id/suggestion`. Consumed by the frontend in Task 4.

- [ ] **Step 1: Add the service method**

In `apps/api/src/receipts/receipts.service.ts`, change the import on line 3 from:

```ts
import { Repository, Not, IsNull } from 'typeorm';
```

to:

```ts
import { Repository, Not, IsNull, In } from 'typeorm';
```

Add this new exported interface near the top of the file, right after the existing `MatchedTransaction` interface (after line 34):

```ts
export interface MerchantSuggestion {
  categoryId: string;
  categoryName: string;
  icon: string;
  color: string;
  receiptsConsidered: number;
}
```

Add this new method to the `ReceiptsService` class, right after `approve` (after line 225, before `getImage`):

```ts
  /** Suggests a category for a receipt based on how the user has categorized
      their own past transactions from the same merchant (via Transaction.receiptId
      -> Receipt.merchant). Returns null when there's no prior categorized history. */
  async getMerchantSuggestion(userId: string, receiptId: string): Promise<MerchantSuggestion | null> {
    const receipt = await this.receiptRepo.findOneBy({ id: receiptId, userId });
    if (!receipt) throw new NotFoundException('Receipt not found');

    const pastReceipts = await this.receiptRepo.find({
      where: { userId, merchant: receipt.merchant },
      select: ['id'],
    });
    const pastReceiptIds = pastReceipts.map((r) => r.id).filter((id) => id !== receiptId);
    if (pastReceiptIds.length === 0) return null;

    const pastTxs = await this.txRepo.find({
      where: { receiptId: In(pastReceiptIds), categoryId: Not(IsNull()) },
      relations: ['categoryRef'],
    });
    if (pastTxs.length === 0) return null;

    const byCategoryId = new Map<string, { receiptIds: Set<string>; category: Category }>();
    for (const tx of pastTxs) {
      if (!tx.categoryRef || !tx.receiptId) continue;
      const entry = byCategoryId.get(tx.categoryId) ?? { receiptIds: new Set<string>(), category: tx.categoryRef };
      entry.receiptIds.add(tx.receiptId);
      byCategoryId.set(tx.categoryId, entry);
    }
    if (byCategoryId.size === 0) return null;

    const [topCategoryId, top] = [...byCategoryId.entries()]
      .sort((a, b) => b[1].receiptIds.size - a[1].receiptIds.size)[0];

    return {
      categoryId: topCategoryId,
      categoryName: top.category.name,
      icon: top.category.icon,
      color: top.category.color,
      receiptsConsidered: top.receiptIds.size,
    };
  }
```

- [ ] **Step 2: Add the controller route**

In `apps/api/src/receipts/receipts.controller.ts`, add this route right after `approve` (after line 81, before the `image` route):

```ts
  @Get(':id/suggestion')
  suggestion(@Param('id') id: string, @Request() req: any) {
    return this.service.getMerchantSuggestion(req.user.id, id);
  }
```

- [ ] **Step 3: Build the API and verify it compiles**

Run: `npm run build:api`
Expected: build succeeds with no type errors.

- [ ] **Step 4: Manually verify against a running API**

Run: `npm run dev:api` (or `node dist/apps/api/main.js` after a build), then with a logged-in session cookie (or via the browser dev tools while on the app):

```bash
curl -s -b "access_token=<your cookie>" http://localhost:3333/api/receipts/<some-receipt-id>/suggestion
```

Expected: for a receipt from a merchant with no prior categorized transactions, `null`. For a receipt from a merchant you've previously imported-and-categorized, a JSON object with `categoryId`/`categoryName`/`icon`/`color`/`receiptsConsidered` matching the most common category used for that merchant's past transactions.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/receipts/receipts.service.ts apps/api/src/receipts/receipts.controller.ts
git commit -m "feat(api): add merchant category suggestion endpoint for receipts"
```

---

## Task 3: Frontend — `derive.ts` additions (types + `groupItemsByCategory`)

**Files:**
- Modify: `apps/web/src/lib/receipts/derive.ts`
- Modify: `apps/web/src/lib/receipts/derive.test.ts`

**Interfaces:**
- Consumes: nothing new (pure additions to an existing pure-logic module).
- Produces: `Receipt.gmailMessageId: string | null` (new field), `export interface CategoryLite { id: string; name: string; icon: string; color: string }`, `export interface MerchantSuggestion { categoryId: string; categoryName: string; icon: string; color: string; receiptsConsidered: number }`, `export interface CategoryGroup { categoryId: string | null; categoryName: string; icon: string; color: string; itemIndices: number[]; total: number }`, `export function groupItemsByCategory(items: ReceiptItem[], itemCategories: Record<number, string>, categories: CategoryLite[]): CategoryGroup[]`. Consumed by Task 4 (page.tsx) and Tasks 5-8 (`ReceiptDetailPanel.tsx`).

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/lib/receipts/derive.test.ts` (add the import first — change line 2 from:

```ts
import { statTotals, distinctMerchants, filterReceipts, countGroups, money, statusLabel, DEFAULT_FILTERS, type ReceiptLite } from './derive';
```

to:

```ts
import { statTotals, distinctMerchants, filterReceipts, countGroups, groupItemsByCategory, money, statusLabel, DEFAULT_FILTERS, type ReceiptLite, type ReceiptItem, type CategoryLite } from './derive';
```

then append this block at the end of the file):

```ts
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
    const groups = groupItemsByCategory(items, { 0: 'cat-groceries', 1: 'cat-groceries', 2: 'cat-shopping' }, categories);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:dashboard`
Expected: FAIL — `groupItemsByCategory` is not exported from `./derive`.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/receipts/derive.ts`, add `gmailMessageId: string | null;` to the `Receipt` interface, right after `imageMimeType: string | null;` (line 34):

```ts
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
  reviewed: boolean;
  parsedAt: string;
  source: ReceiptSource;
  matchStatus: MatchStatus;
  matchedTransaction: MatchedTransaction | null;
  imageMimeType: string | null;
  gmailMessageId: string | null;
}
```

Then append these new exports at the end of the file (after `countGroups`):

```ts
export interface CategoryLite { id: string; name: string; icon: string; color: string }

export interface MerchantSuggestion {
  categoryId: string;
  categoryName: string;
  icon: string;
  color: string;
  receiptsConsidered: number;
}

export interface CategoryGroup {
  categoryId: string | null; // null = uncategorized
  categoryName: string;
  icon: string;
  color: string;
  itemIndices: number[];
  total: number;
}

/** Groups a receipt's line items by their currently-assigned category (client-side
    itemCategories state, not persisted). Uncategorized items always form one trailing
    group. Categorized groups sort by total descending — used both for the "group by
    category" list view and the "this will create" transaction preview. */
export function groupItemsByCategory(
  items: ReceiptItem[],
  itemCategories: Record<number, string>,
  categories: CategoryLite[],
): CategoryGroup[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const groups = new Map<string, CategoryGroup>();

  items.forEach((item, idx) => {
    const catId = itemCategories[idx] || null;
    const key = catId ?? '__uncategorized__';
    const cat = catId ? byId.get(catId) : undefined;
    const existing = groups.get(key);
    if (existing) {
      existing.itemIndices.push(idx);
      existing.total += item.total;
    } else {
      groups.set(key, {
        categoryId: catId,
        categoryName: cat?.name ?? 'Uncategorized',
        icon: cat?.icon ?? '❔',
        color: cat?.color ?? 'var(--color-text-muted)',
        itemIndices: [idx],
        total: item.total,
      });
    }
  });

  return [...groups.values()].sort((a, b) => {
    if (a.categoryId === null) return 1;
    if (b.categoryId === null) return -1;
    return b.total - a.total;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:dashboard`
Expected: PASS — all `groupItemsByCategory` cases plus the full existing suite green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/receipts/derive.ts apps/web/src/lib/receipts/derive.test.ts
git commit -m "feat(web): add groupItemsByCategory and suggestion/gmailMessageId types to receipts derive"
```

---

## Task 4: Frontend — wire suggestion fetch + `applyAll` in `page.tsx`, extend Panel props

**Files:**
- Modify: `apps/web/src/app/receipts/page.tsx`
- Modify: `apps/web/src/app/receipts/ReceiptDetailPanel.tsx:1-21` (imports + `Props` interface only — no body changes yet)

**Interfaces:**
- Consumes: `groupItemsByCategory`, `type MerchantSuggestion` from `@/lib/receipts/derive` (Task 3).
- Produces: `ReceiptDetailPanel`'s `Props` gains `onApplyAll: (categoryId: string) => void` and `suggestion: MerchantSuggestion | null`. `page.tsx` gains a `suggestion` state var and an `applyAll` function. Consumed by Tasks 5-8 (panel body) and already fully wired for the panel to use once it does.

- [ ] **Step 1: Extend `ReceiptDetailPanel.tsx`'s Props (no behavior change yet)**

In `apps/web/src/app/receipts/ReceiptDetailPanel.tsx`, change line 4 from:

```ts
import { countGroups, money, statusLabel, type Receipt } from '@/lib/receipts/derive';
```

to:

```ts
import { countGroups, money, statusLabel, type Receipt, type MerchantSuggestion } from '@/lib/receipts/derive';
```

Change the `Props` interface (lines 12-21) from:

```ts
interface Props {
  receipt: Receipt;
  categories: Category[];
  itemCategories: Record<number, string>;
  onSetCategory: (idx: number, categoryId: string) => void;
  onImport: () => void;
  importing: boolean;
  onClose: () => void;
  onReceiptChanged: () => void;
}
```

to:

```ts
interface Props {
  receipt: Receipt;
  categories: Category[];
  itemCategories: Record<number, string>;
  onSetCategory: (idx: number, categoryId: string) => void;
  onApplyAll: (categoryId: string) => void;
  suggestion: MerchantSuggestion | null;
  onImport: () => void;
  importing: boolean;
  onClose: () => void;
  onReceiptChanged: () => void;
}
```

And add `onApplyAll, suggestion,` to the destructured function parameters (line 33), so it reads:

```ts
export default function ReceiptDetailPanel({
  receipt, categories, itemCategories, onSetCategory, onApplyAll, suggestion, onImport, importing, onClose, onReceiptChanged,
}: Props) {
```

(`onApplyAll` and `suggestion` are intentionally unused inside the function body until Task 6 — that's fine, TypeScript won't error on unused destructured params, only unused `const`/`let` locals under stricter lint rules that don't apply to function parameters here.)

- [ ] **Step 2: Wire suggestion fetch + applyAll in `page.tsx`**

In `apps/web/src/app/receipts/page.tsx`, change the import on line 10 from:

```ts
import { filterReceipts, distinctMerchants, DEFAULT_FILTERS, type Receipt, type ReceiptFilters } from '@/lib/receipts/derive';
```

to:

```ts
import { filterReceipts, distinctMerchants, DEFAULT_FILTERS, type Receipt, type ReceiptFilters, type MerchantSuggestion } from '@/lib/receipts/derive';
```

Add a new state var right after `itemCategories` (after line 21):

```ts
  const [suggestion, setSuggestion] = useState<MerchantSuggestion | null>(null);
```

Replace `openReceipt` (lines 58-61) from:

```ts
  function openReceipt(r: Receipt) {
    setSelected(r);
    setItemCategories({});
  }
```

to:

```ts
  function openReceipt(r: Receipt) {
    setSelected(r);
    setItemCategories({});
    setSuggestion(null);
    if (!r.matchedTransaction && !r.imported) {
      fetch(`${API}/receipts/${r.id}/suggestion`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then(setSuggestion)
        .catch(() => setSuggestion(null));
    }
  }
```

Add an `applyAll` function right after `setCategory` (after line 65):

```ts
  function applyAll(categoryId: string) {
    if (!selected) return;
    const next: Record<number, string> = {};
    selected.items.forEach((_, idx) => { next[idx] = categoryId; });
    setItemCategories(next);
  }
```

- [ ] **Step 3: Pass the new props at both `ReceiptDetailPanel` call sites**

There are two identical prop blocks — the desktop rail (around line 200-209) and the mobile overlay (around line 220-229). In **both**, add `suggestion={suggestion}` and `onApplyAll={applyAll}` alongside the existing `onSetCategory={setCategory}` line, e.g.:

```tsx
          <ReceiptDetailPanel
            receipt={selected}
            categories={expenseCategories}
            itemCategories={itemCategories}
            onSetCategory={setCategory}
            onApplyAll={applyAll}
            suggestion={suggestion}
            onImport={handleImport}
            importing={importing}
            onClose={closeReceipt}
            onReceiptChanged={refetchReceipts}
          />
```

- [ ] **Step 4: Verify it compiles and behaves identically**

Run: `npm run build:web`
Expected: build succeeds, no type errors (the new Props fields are satisfied at both call sites).

Manually: `npm run dev:web`, open `/receipts`, open an unmatched/pending receipt, confirm the panel renders exactly as before (no visual change yet — Tasks 5-8 haven't touched the body), and confirm in the Network tab that opening it fires a `GET /receipts/<id>/suggestion` request.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/receipts/page.tsx apps/web/src/app/receipts/ReceiptDetailPanel.tsx
git commit -m "feat(web): wire merchant suggestion fetch and applyAll handler into receipts page"
```

---

## Task 5: Panel header redesign (avatar, subtitle, source/email/receipt links)

**Files:**
- Modify: `apps/web/src/app/receipts/ReceiptDetailPanel.tsx:1-92`

**Interfaces:**
- Consumes: `avatarColor`, `initials` from `@/lib/avatar` (Task 1); `receipt.gmailMessageId` (Task 3).
- Produces: no new exports — this is the header JSX block only.

- [ ] **Step 1: Replace the header block**

In `apps/web/src/app/receipts/ReceiptDetailPanel.tsx`, add the import (alongside the existing imports, after line 6):

```ts
import { avatarColor, initials } from '@/lib/avatar';
```

Replace the entire header section — from the opening `return (` through the closing of the header `</div>` before the matched-transaction block (original lines 53-92) — with:

```tsx
  return (
    <div className="flex flex-col h-full p-6 overflow-y-auto">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm"
            style={{ background: `color-mix(in srgb, ${avatarColor(receipt.merchant)} 20%, transparent)`, color: avatarColor(receipt.merchant) }}>
            {initials(receipt.merchant)}
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-lg truncate" style={{ color: 'var(--color-text-primary)' }}>{receipt.merchant}</h2>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
              {receipt.orderNumber ? `Order ${receipt.orderNumber} · ` : ''}
              {parsedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>
                <SourceIcon source={receipt.source} size={10} />
                {receipt.source === 'manual' ? 'Manual Upload' : 'From Gmail'}
              </span>
              {receipt.source === 'gmail' && receipt.gmailMessageId && (
                <a href={`https://mail.google.com/mail/u/0/#inbox/${receipt.gmailMessageId}`} target="_blank" rel="noreferrer"
                  className="text-[11px] font-medium hover:underline" style={{ color: 'var(--color-sky)' }}>
                  View email ↗
                </a>
              )}
              {receipt.imageMimeType && (
                <a href={imageUrl} target="_blank" rel="noreferrer"
                  className="text-[11px] font-medium hover:underline" style={{ color: 'var(--color-sky)' }}>
                  {isPdf ? 'View PDF' : 'View receipt'} ↗
                </a>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ color: 'var(--color-text-muted)' }}>✕</button>
      </div>
```

(`parsedAt`, `isPdf`, and `imageUrl` are already computed earlier in the function body — lines 39-41 — and are unchanged. The old `receipt.rawSubject`/"Email subject:" line and the image thumbnail are removed, replaced by the "View receipt ↗" link.)

- [ ] **Step 2: Verify it compiles and renders**

Run: `npm run build:web`
Expected: build succeeds.

Manually: `npm run dev:web`, open `/receipts`, click through a few receipts of both sources (gmail and manual):
- Gmail receipt: avatar + name + order/date subtitle + "From Gmail" pill + "View email ↗" (opens Gmail in a new tab) + "View receipt ↗"/"View PDF ↗" if an image exists.
- Manual receipt: "Manual Upload" pill, no "View email" link.
- Confirm the close (✕) button still works, and the matched-transaction block / line items below still render (unchanged in this task).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/receipts/ReceiptDetailPanel.tsx
git commit -m "feat(web): redesign receipt detail panel header with avatar and email/receipt links"
```

---

## Task 6: Editable item rows — pill category control + suggestion banner

**Files:**
- Modify: `apps/web/src/app/receipts/ReceiptDetailPanel.tsx`

**Interfaces:**
- Consumes: `onApplyAll`, `suggestion` (Task 4 props), `groupItemsByCategory` (Task 3).
- Produces: a `renderItemRow` helper used again in Task 7 (collapse) and referenced conceptually in Task 8 (summary reuses `categoryGroups`, not `renderItemRow`).

- [ ] **Step 1: Add `groupItemsByCategory` import and compute `categoryGroups`**

Change the import on line 4 (as already modified by Task 4/5) to also bring in `groupItemsByCategory`:

```ts
import { countGroups, groupItemsByCategory, money, statusLabel, type Receipt, type MerchantSuggestion } from '@/lib/receipts/derive';
```

Inside the component body, right after the existing `const groups = countGroups(receipt.items.length, itemCategories);` line, rename that variable to avoid a naming clash and add the new grouped-by-category computation:

```ts
  const transactionCount = countGroups(receipt.items.length, itemCategories);
  const categoryGroups = groupItemsByCategory(receipt.items, itemCategories, categories);
```

(Delete the old `const groups = countGroups(...)` line — `transactionCount` replaces it. Update its two other usages later in the file — the footer "Create N Transactions" button and the old violet summary box — to reference `transactionCount` instead of `groups`. Task 8 replaces the violet box entirely, so only the footer button needs a rename here: change `` `Create ${groups} Transaction${groups !== 1 ? 's' : ''}` `` to `` `Create ${transactionCount} Transaction${transactionCount !== 1 ? 's' : ''}` ``.)

- [ ] **Step 2: Add a `renderItemRow` helper inside the component**

Add this function inside `ReceiptDetailPanel`, right before the `return (` statement:

```ts
  function renderItemRow(item: Receipt['items'][number], idx: number) {
    const catId = itemCategories[idx] ?? '';
    const cat = categories.find((c) => c.id === catId);
    return (
      <div key={idx} className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{item.name}</p>
          {item.quantity > 1 && (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{item.quantity}× {money(item.unitPrice)}</p>
          )}
        </div>
        <span className="shrink-0 text-sm tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{money(item.total)}</span>
        <select
          value={catId}
          onChange={(e) => onSetCategory(idx, e.target.value)}
          className="shrink-0 text-xs font-medium rounded-full pl-2.5 pr-1.5 py-1 outline-none appearance-none text-center"
          style={{
            background: cat ? `color-mix(in srgb, ${cat.color} 15%, transparent)` : 'var(--color-elevated)',
            color: cat ? cat.color : 'var(--color-text-muted)',
            border: `1px solid ${cat ? `color-mix(in srgb, ${cat.color} 30%, transparent)` : 'var(--color-border)'}`,
          }}>
          <option value="">Choose…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
      </div>
    );
  }
```

- [ ] **Step 3: Replace the editable-branch item rows and add the suggestion banner**

Replace the item-row `.map()` block inside the editable branch (originally lines 143-165 — the `<div className="space-y-2 mb-4">...</div>` containing the per-item cards with inline `<select>`s) with:

```tsx
          {suggestion && (
            <div className="rounded-xl p-3 mb-3 flex items-center justify-between gap-3"
              style={{ background: 'color-mix(in srgb, var(--color-card-violet) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 15%, transparent)' }}>
              <div className="min-w-0">
                <p className="text-xs font-medium" style={{ color: 'var(--color-card-violet)' }}>
                  All {receipt.items.length} item{receipt.items.length !== 1 ? 's' : ''} look{receipt.items.length === 1 ? 's' : ''} like {suggestion.categoryName}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Based on your last {suggestion.receiptsConsidered} {receipt.merchant} receipt{suggestion.receiptsConsidered !== 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => onApplyAll(suggestion.categoryId)}
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                style={{ background: 'var(--color-card-violet)', color: '#fff' }}>
                Apply
              </button>
            </div>
          )}

          <div className="space-y-2 mb-4">
            {receipt.items.map((item, idx) => renderItemRow(item, idx))}
          </div>
```

(This temporarily drops the collapse/group behavior described in the spec — Task 7 adds it back on top of this same block. Keeping this task to "does every item render as a pill row, with Apply working" keeps the diff reviewable on its own.)

- [ ] **Step 4: Verify it compiles and behaves correctly**

Run: `npm run build:web`
Expected: build succeeds.

Manually: `npm run dev:web`, open an unmatched/pending receipt:
- If its merchant has prior categorized history, confirm the suggestion banner appears with the right category name and receipt count, and clicking **Apply** fills every item's pill with that category (compare against the "This will create N transactions" text at the bottom, which should now say 1 transaction).
- If no history, confirm no banner renders and there's no console error.
- Confirm changing an individual item's pill dropdown still works and updates that item only.
- Confirm the footer's "Create N Transactions" button label still updates correctly as categories change.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/receipts/ReceiptDetailPanel.tsx
git commit -m "feat(web): add pill-style category controls and merchant suggestion banner to receipt items"
```

---

## Task 7: Collapse ("N more items") + "Group by category" toggle

**Files:**
- Modify: `apps/web/src/app/receipts/ReceiptDetailPanel.tsx`

**Interfaces:**
- Consumes: `categoryGroups` (Task 6), `renderItemRow` (Task 6).
- Produces: local component state `showAll`, `grouped` — not consumed elsewhere.

- [ ] **Step 1: Add local state**

Add `useState` calls inside the component, alongside the existing `const [approving, setApproving] = useState(false);` (line 35):

```ts
  const [approving, setApproving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [grouped, setGrouped] = useState(false);
```

- [ ] **Step 2: Compute visible/hidden item indices**

Right after the `categoryGroups` computation added in Task 6, add:

```ts
  const itemCount = receipt.items.length;
  const visibleCount = showAll ? itemCount : Math.min(itemCount, 6);
  const hiddenCount = itemCount - visibleCount;
  const hiddenIndices = Array.from({ length: hiddenCount }, (_, i) => visibleCount + i);
  const hiddenCategoryIds = new Set(hiddenIndices.map((idx) => itemCategories[idx] ?? ''));
  const hiddenCategoryLabel = hiddenCount > 0 && hiddenCategoryIds.size === 1 && [...hiddenCategoryIds][0]
    ? categories.find((c) => c.id === [...hiddenCategoryIds][0])?.name ?? null
    : null;
```

- [ ] **Step 3: Replace the flat item list with the collapsible/groupable version**

Replace the block added in Task 6, Step 3's final `<div className="space-y-2 mb-4">...</div>` (the one containing `{receipt.items.map((item, idx) => renderItemRow(item, idx))}`), with:

```tsx
          {categoryGroups.length > 1 && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                {itemCount} item{itemCount !== 1 ? 's' : ''}
              </span>
              <button onClick={() => setGrouped((g) => !g)} className="text-[11px] font-medium hover:underline" style={{ color: 'var(--color-sky)' }}>
                {grouped ? 'Show original order' : 'Group by category'}
              </button>
            </div>
          )}

          <div className="space-y-2 mb-2">
            {grouped ? (
              categoryGroups.map((group) => (
                <div key={group.categoryId ?? 'uncategorized'}>
                  <div className="flex items-center justify-between px-1 mb-1">
                    <span className="text-[11px] font-semibold" style={{ color: group.color }}>{group.icon} {group.categoryName}</span>
                    <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{money(group.total)}</span>
                  </div>
                  <div className="space-y-2">
                    {group.itemIndices.map((idx) => renderItemRow(receipt.items[idx], idx))}
                  </div>
                </div>
              ))
            ) : (
              Array.from({ length: visibleCount }, (_, idx) => renderItemRow(receipt.items[idx], idx))
            )}
          </div>

          {!grouped && hiddenCount > 0 && (
            <button onClick={() => setShowAll(true)} className="text-xs font-medium mb-4 hover:underline block" style={{ color: 'var(--color-sky)' }}>
              {hiddenCount} more item{hiddenCount !== 1 ? 's' : ''}{hiddenCategoryLabel ? ` · all ${hiddenCategoryLabel}` : ''} · Show all
            </button>
          )}
          {(grouped || hiddenCount === 0) && <div className="mb-4" />}
```

(The trailing `{(grouped || hiddenCount === 0) && <div className="mb-4" />}` just preserves consistent bottom spacing whether or not the "Show all" link is present — matches the `mb-4` the removed block used to carry on its own wrapper.)

- [ ] **Step 4: Verify it compiles and behaves correctly**

Run: `npm run build:web`
Expected: build succeeds.

Manually: `npm run dev:web`, open a pending receipt with more than 6 items (if none exists locally, temporarily assign different categories to items on any multi-item receipt to test grouping, or use the Amazon-style multi-item seed data if present):
- Confirm only 6 items show by default with a "N more items · Show all" link, and clicking it reveals the rest.
- If the hidden items all share one category, confirm the link reads "N more items · all {category} · Show all".
- Confirm "Group by category" only appears once more than one distinct category is in use, and toggling it re-renders items clustered under category subheaders with subtotals, then toggling back restores original order.
- Confirm single-category or very short receipts (≤6 items, one category) show neither control, matching the simpler pre-Task-7 look.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/receipts/ReceiptDetailPanel.tsx
git commit -m "feat(web): add item-list collapse and group-by-category toggle to receipt panel"
```

---

## Task 8: Summary block — subtotal/tax/total + "This will create" breakdown

**Files:**
- Modify: `apps/web/src/app/receipts/ReceiptDetailPanel.tsx`

**Interfaces:**
- Consumes: `categoryGroups`, `transactionCount` (Task 6/7).
- Produces: nothing new — final piece of the editable branch.

- [ ] **Step 1: Replace the old violet "this will create" box**

Replace the old summary box (originally lines 167-172, the single `<div>` with `This will create <strong>{groups}</strong> transaction...`) with:

```tsx
          <div className="rounded-xl p-3 mb-3 space-y-1.5" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--color-text-muted)' }}>Subtotal</span>
              <span style={{ color: 'var(--color-text-secondary)' }}>{money(subtotal)}</span>
            </div>
            {tax > 0.01 && (
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--color-text-muted)' }}>Tax</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{money(tax)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm font-bold pt-1" style={{ borderTop: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-primary)' }}>Receipt total</span>
              <span style={{ color: 'var(--color-text-primary)' }}>{money(receipt.total)}</span>
            </div>
          </div>

          <div className="rounded-xl p-3 mb-4"
            style={{ background: 'color-mix(in srgb, var(--color-card-violet) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 15%, transparent)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-card-violet)' }}>
              This will create {transactionCount} transaction{transactionCount !== 1 ? 's' : ''}
            </p>
            <div className="space-y-1.5">
              {categoryGroups.map((group) => (
                <div key={group.categoryId ?? 'uncategorized'} className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {group.icon} {group.categoryName} · {group.itemIndices.length} item{group.itemIndices.length !== 1 ? 's' : ''}
                  </span>
                  <span className="font-medium tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{money(group.total)}</span>
                </div>
              ))}
            </div>
          </div>
```

Add the `subtotal`/`tax` computations right after `transactionCount`/`categoryGroups` (added in Task 6):

```ts
  const subtotal = receipt.items.reduce((sum, item) => sum + item.total, 0);
  const tax = receipt.total - subtotal;
```

- [ ] **Step 2: Verify it compiles and behaves correctly**

Run: `npm run build:web`
Expected: build succeeds.

Manually: `npm run dev:web`, open a few different pending receipts:
- One where item totals sum to less than the receipt total (real tax): confirm a Tax row appears and Subtotal + Tax = Receipt total.
- One where items already sum to the full total (or slightly over/under from rounding): confirm the Tax row is hidden (no negative or ~$0.00 tax line).
- Confirm the "This will create N transactions" box lists one row per distinct category (icon, name, item count, subtotal) plus an "Uncategorized" row when applicable, and that N matches the footer's "Create N Transactions" button.
- Assign categories to change the grouping, confirm both the breakdown list and the button count update together.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/receipts/ReceiptDetailPanel.tsx
git commit -m "feat(web): add subtotal/tax/total and per-category breakdown to receipt panel"
```

---

## Task 9: Full manual verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full build and test suite**

```bash
npm run build:web
npm run build:api
npm run test:dashboard
```

Expected: all three succeed with no errors.

- [ ] **Step 2: Walk the full spec checklist**

With `npm run dev:web` and `npm run dev:api` running, in the browser:

1. Open an unmatched receipt from a merchant with prior imported/categorized history — confirm the suggestion banner shows the right category and receipt count, and **Apply** pre-fills every item.
2. Open an unmatched receipt from a merchant with no history — confirm no banner, no console error.
3. Open a receipt with more than 6 items — confirm collapse ("N more items · Show all") and "Group by category" both work as described in Task 7.
4. Confirm subtotal/tax/total math renders sensibly on at least one receipt with real tax and one without (Task 8).
5. Open an already-matched or already-imported receipt — confirm the header redesign (avatar/pills/links) shows correctly and the read-only item list / matched-transaction block are unaffected.
6. Confirm "View email ↗" appears only for gmail-sourced receipts with a `gmailMessageId`, and opens the correct Gmail URL in a new tab.
7. Resize the browser to a mobile width (or use device toolbar) — confirm the full-screen mobile overlay (`page.tsx`'s `md:hidden` block) still renders the redesigned panel correctly, per this repo's responsive-design requirement.
8. Confirm the footer Approve / Create N Transactions buttons and `MatchTransactionSection` are unchanged and still functional.

- [ ] **Step 3: Fix anything that doesn't match, then commit if any fixes were needed**

If Step 2 surfaces issues, fix them in `ReceiptDetailPanel.tsx`/`page.tsx`, re-run Step 1, and commit:

```bash
git add apps/web/src/app/receipts/ReceiptDetailPanel.tsx apps/web/src/app/receipts/page.tsx
git commit -m "fix(web): polish receipt detail panel redesign after manual verification"
```

(Skip this step entirely if Step 2 found nothing to fix.)
