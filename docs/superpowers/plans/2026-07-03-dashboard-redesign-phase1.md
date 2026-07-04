# Dashboard Redesign Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the cofre dashboard as an 18-panel dense grid (modeled on the user's reference screenshot) with a pure, unit-tested derivation layer, plus two tiny backend additions: `Category.isFixed` and `User.savingsGoal`.

**Architecture:** Three layers — `apps/web/src/lib/dashboard/` (pure derivation functions, vitest-tested), `useDashboardData` hook (all fetching), and 18 presentational panel components composed by a slim `page.tsx`. Backend: two entity columns riding existing endpoints (`synchronize: true` applies them locally).

**Tech Stack:** Next.js 16 / React 19 / Tailwind v4 / recharts (web), NestJS 11 + TypeORM (api), vitest (new, scoped to `lib/dashboard`).

**Spec:** `docs/superpowers/specs/2026-07-03-dashboard-redesign-phase1-design.md`

## Global Constraints

- Cofre design language: glass cards (`rgba` surface + `backdrop-filter`), never solid `--color-surface` on cards. Density: `p-5` panel padding.
- Charts: **single dollar axis, never dual-axis**. Categorical colors from theme tokens via `useThemeColors()` (`tc.green`, `tc.sky`, `tc.orange`, `tc.amber`, `tc.violet`, `tc.rose`). Sequential ramp (calendar): sky hue only. Diverging (expense change): green/rose. Legends for ≥ 2 series. Tooltips on all charts.
- `derive.ts` is pure: no React, no `new Date()` inside — current date always passed in. All transfer/tracking exclusions live there and only there.
- Panels are presentational: props in, JSX out. No fetch, no aggregation.
- Money classification rules (single source of truth): transfer = `categoryRef?.type === 'transfer' || !!debtId`; tracking = `isTrackingAccount(bankAccount?.accountType ?? '')`; cash flow includes only non-transfer, non-tracking.
- API entity changes: import the entity in `apps/api/src/config/database.config.ts` only if adding a NEW entity (not needed here — we only add columns).
- Commits: conventional style (`feat:`, `test:`, `refactor:`), end body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Windows environment; run commands from repo root `d:\Coding\cofre-budget` unless stated. Shell examples are bash (Git Bash).
- The working tree already contains an uncommitted upgrade to the dashboard Cash Flow chart (stacked project/personal bars in `page.tsx`); Task 4 commits its logic as `monthlyCashFlow()` and Task 9 moves its JSX into a panel. Do not discard it.

---

### Task 1: `Category.isFixed` (backend + web form toggle)

**Files:**
- Modify: `apps/api/src/categories/category.entity.ts`
- Modify: `apps/api/src/categories/dto/upsert-category.dto.ts`
- Modify: `apps/api/src/categories/categories.service.ts` (only if it whitelists fields — inspect first)
- Modify: `apps/web/src/components/CategoryFormModal.tsx`

**Interfaces:**
- Consumes: existing `Category` entity, `UpsertCategoryDto`, `CategoryFormModal` form state.
- Produces: `Category.isFixed: boolean` (default `false`) present in every category API response; `isFixed` accepted on create/update. Web `Category` interface (exported from `CategoryFormModal.tsx`) gains `isFixed?: boolean`.

- [ ] **Step 1: Add the column to the entity**

In `apps/api/src/categories/category.entity.ts`, after the `isDefault` column:

```ts
  /* true = fixed expense (rent, insurance…), false = variable */
  @Column({ default: false })
  isFixed: boolean;
```

- [ ] **Step 2: Add to the DTO**

In `apps/api/src/categories/dto/upsert-category.dto.ts`:

```ts
export class UpsertCategoryDto {
  name: string;
  icon: string;
  color: string;
  type?: string;
  description?: string | null;
  isFixed?: boolean;
}
```

- [ ] **Step 3: Check the service persists it**

Read `apps/api/src/categories/categories.service.ts`. If `create`/`update` spread the DTO (`this.repo.create({ ...dto, userId })` or similar), nothing to change. If they copy fields explicitly, add `isFixed: dto.isFixed ?? false` (create) and `if (dto.isFixed !== undefined) cat.isFixed = dto.isFixed` (update).

- [ ] **Step 4: Build the API and smoke-test**

```bash
npx nx build api && node -e "console.log('build ok')"
```

Start the built API (`node dist/apps/api/main.js`) against the local DB; `synchronize: true` adds the column on boot. Verify:

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d cofre_budget -c "\d categories" | grep isFixed
```

Expected: `isFixed | boolean | not null | default false`.

- [ ] **Step 5: Web — add the toggle to the category form**

In `apps/web/src/components/CategoryFormModal.tsx`:

1. Extend the exported interface (line ~8):

```ts
export interface Category {
  id: string; name: string; icon: string; color: string;
  type: string; isDefault: boolean; description: string | null;
  isFixed?: boolean;
}
```

2. Add to form state (line ~59):

```ts
    isFixed: editing?.isFixed ?? false,
```

3. Add the toggle UI after the description input (line ~208), matching the modal's existing style. Only meaningful for expense-capable categories, so hide it for pure income/transfer types:

```tsx
{(form.type === 'expense' || form.type === 'both') && (
  <label className="flex items-center justify-between gap-3 cursor-pointer">
    <div>
      <p className="text-sm font-medium">Fixed expense</p>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Rent, insurance, loan payments — costs that don&apos;t change month to month.
      </p>
    </div>
    <input type="checkbox" checked={form.isFixed}
      onChange={(e) => setForm((f) => ({ ...f, isFixed: e.target.checked }))}
      className="w-4 h-4 accent-[var(--color-card-violet)]" />
  </label>
)}
```

The form already posts `JSON.stringify(form)` (line ~92), so `isFixed` rides along.

- [ ] **Step 6: Verify end-to-end**

With `npm run dev:web` + API running: Settings → Categories → edit an expense category → toggle "Fixed expense" → save → re-open and confirm the toggle persisted. Then `GET /api/categories` (browser devtools) shows `"isFixed": true`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/categories apps/web/src/components/CategoryFormModal.tsx
git commit -m "feat(categories): add isFixed flag for fixed-vs-variable expense classification"
```

---

### Task 2: `User.savingsGoal` (backend + web user type)

**Files:**
- Modify: `apps/api/src/users/user.entity.ts`
- Modify: `apps/api/src/users/users.service.ts:84-89` (`updateProfile`)
- Modify: `apps/api/src/auth/auth.controller.ts:105-110` (`PATCH /auth/profile`)
- Modify: `apps/web/src/components/UserProvider.tsx:7-16` (`User` interface)

**Interfaces:**
- Consumes: existing `PATCH /api/auth/profile` (JWT-scoped, no id param — no IDOR surface) and `GET /api/auth/me` (returns the full User via `findById`).
- Produces: `User.savingsGoal: string | null` (TypeORM decimal columns return strings) in `/auth/me` responses; `PATCH /auth/profile` accepts `{ savingsGoal?: number | null }`. Web `User` interface gains `savingsGoal?: string | number | null`. Task 11's SavingsGrowthPanel consumes both.

- [ ] **Step 1: Add the column**

In `apps/api/src/users/user.entity.ts`, after the `plan` column:

```ts
  /* Yearly savings goal in dollars; null = not set */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: null })
  savingsGoal: string | null;
```

- [ ] **Step 2: Extend `updateProfile`**

In `apps/api/src/users/users.service.ts`, replace the method:

```ts
  async updateProfile(id: string, data: { name?: string; savingsGoal?: number | null }): Promise<User> {
    const patch: Partial<User> = {};
    if (typeof data.name === 'string') patch.name = data.name.trim();
    if (data.savingsGoal !== undefined) {
      if (data.savingsGoal === null) {
        patch.savingsGoal = null;
      } else {
        const n = Number(data.savingsGoal);
        if (!Number.isFinite(n) || n < 0) throw new BadRequestException('savingsGoal must be a non-negative number');
        patch.savingsGoal = n.toFixed(2);
      }
    }
    if (Object.keys(patch).length) await this.repo.update(id, patch);
    return this.repo.findOneByOrFail({ id });
  }
```

Add `BadRequestException` to the `@nestjs/common` import at the top of the file.

- [ ] **Step 3: Extend the controller body type**

In `apps/api/src/auth/auth.controller.ts` (`updateProfile`, line ~108):

```ts
  updateProfile(@Request() req: any, @Body() body: { name?: string; savingsGoal?: number | null }) {
    return this.usersService.updateProfile(req.user.id, { name: body.name, savingsGoal: body.savingsGoal });
  }
```

- [ ] **Step 4: Build + verify column and validation**

```bash
npx nx build api
```

Boot `node dist/apps/api/main.js`, then:

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d cofre_budget -c "\d users" | grep savingsGoal
```

Expected: `savingsGoal | numeric(12,2) | | | NULL`.

Manual check from a logged-in browser session (devtools console):

```js
fetch('/api/auth/profile', { method:'PATCH', credentials:'include',
  headers:{'Content-Type':'application/json'}, body: JSON.stringify({ savingsGoal: 15000 }) }).then(r=>r.json())
// → user object with savingsGoal: "15000.00"
// then: body { savingsGoal: -5 } → 400
```

- [ ] **Step 5: Web `User` interface**

In `apps/web/src/components/UserProvider.tsx`, add to the `User` interface:

```ts
  savingsGoal?: string | number | null;
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/users apps/api/src/auth/auth.controller.ts apps/web/src/components/UserProvider.tsx
git commit -m "feat(users): add savingsGoal setting via PATCH /auth/profile"
```

---

### Task 3: vitest setup + `lib/dashboard/types.ts` + classification helpers

**Files:**
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/lib/dashboard/types.ts`
- Create: `apps/web/src/lib/dashboard/derive.ts`
- Test: `apps/web/src/lib/dashboard/derive.test.ts`
- Modify: `package.json` (root — devDependency + script)

**Interfaces:**
- Consumes: `isTrackingAccount` from `apps/web/src/lib/accountTypes.ts` (`(accountType: string) => boolean`).
- Produces (used by every later task):
  - Types: `Category { id, name, icon, color, type, isFixed? }`, `BankAccount { id, bankName, accountName, accountType, color, balance, last4? }`, `Transaction { id, name, amount, date, source, categoryRef, bankAccount, projectId, debtId? }`, `Budget { id, amount, spent, category, projectCategoryId? }`, `Project` (copy of the dashboard page's current interface), `Debt { remaining, status }`.
  - `isTransfer(t: Transaction): boolean`
  - `inCashFlow(t: Transaction): boolean`
  - `txInMonth(txs: Transaction[], monthKey: string): Transaction[]` (monthKey = `'YYYY-MM'`)
  - `monthKeyOf(d: Date): string`
  - Test helper `tx(partial): Transaction` (exported from the test file only).

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create `apps/web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/lib/dashboard/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

Add to root `package.json` scripts:

```json
"test:dashboard": "vitest run --root apps/web"
```

- [ ] **Step 3: Create `apps/web/src/lib/dashboard/types.ts`**

```ts
export interface Category {
  id: string; name: string; icon: string; color: string; type: string;
  isFixed?: boolean;
}
export interface BankAccount {
  id: string; bankName: string; accountName: string; accountType: string;
  color: string; balance: number; last4?: string;
}
export interface Transaction {
  id: string; name: string; amount: number; date: string; source: string;
  categoryRef: Category | null; bankAccount: BankAccount | null;
  projectId: string | null; debtId?: string | null;
}
export interface Budget {
  id: string; amount: number; spent: number; category: Category | null;
  projectCategoryId?: string | null;
}
export interface Project {
  id: string; name: string; icon: string; color: string; type: string; status: string;
  expenses: number; income: number; costBasis: number; netGain: number | null;
  roi: number | null; purchasePrice: number;
}
export interface Debt { remaining: number; status: 'open' | 'paid' }
```

- [ ] **Step 4: Write failing tests for the classification helpers**

`apps/web/src/lib/dashboard/derive.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isTransfer, inCashFlow, txInMonth, monthKeyOf } from './derive';
import type { Transaction, Category, BankAccount } from './types';

export function cat(p: Partial<Category> = {}): Category {
  return { id: 'c1', name: 'Food', icon: '🍔', color: '#fff', type: 'expense', ...p };
}
export function acct(p: Partial<BankAccount> = {}): BankAccount {
  return { id: 'a1', bankName: 'B', accountName: 'A', accountType: 'checking', color: '#fff', balance: 0, ...p };
}
export function tx(p: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1', name: 'Store', amount: -10, date: '2026-07-01', source: 'manual',
    categoryRef: cat(), bankAccount: acct(), projectId: null, debtId: null, ...p,
  };
}

describe('isTransfer', () => {
  it('flags transfer-type categories', () => {
    expect(isTransfer(tx({ categoryRef: cat({ type: 'transfer' }) }))).toBe(true);
  });
  it('flags debt repayments', () => {
    expect(isTransfer(tx({ debtId: 'd1' }))).toBe(true);
  });
  it('passes normal expenses', () => {
    expect(isTransfer(tx())).toBe(false);
  });
});

describe('inCashFlow', () => {
  it('excludes transfers', () => {
    expect(inCashFlow(tx({ debtId: 'd1' }))).toBe(false);
  });
  it('excludes tracking accounts (investment)', () => {
    expect(inCashFlow(tx({ bankAccount: acct({ accountType: 'investment' }) }))).toBe(false);
  });
  it('includes ordinary checking expenses', () => {
    expect(inCashFlow(tx())).toBe(true);
  });
  it('tolerates null bankAccount', () => {
    expect(inCashFlow(tx({ bankAccount: null }))).toBe(true);
  });
});

describe('txInMonth / monthKeyOf', () => {
  it('filters by YYYY-MM prefix', () => {
    const txs = [tx({ date: '2026-06-30' }), tx({ date: '2026-07-01' }), tx({ date: '2026-07-31' })];
    expect(txInMonth(txs, '2026-07')).toHaveLength(2);
  });
  it('monthKeyOf formats with zero-padding', () => {
    expect(monthKeyOf(new Date(2026, 0, 15))).toBe('2026-01');
  });
});
```

- [ ] **Step 5: Run tests, verify they fail**

```bash
npm run test:dashboard
```

Expected: FAIL — `derive.ts` does not exist / exports missing.

- [ ] **Step 6: Implement**

`apps/web/src/lib/dashboard/derive.ts`:

```ts
import { isTrackingAccount } from '@/lib/accountTypes';
import type { Transaction } from './types';

/** Transfers between own accounts + debt repayments — excluded everywhere. */
export function isTransfer(t: Transaction): boolean {
  return t.categoryRef?.type === 'transfer' || !!t.debtId;
}

/** Cash-flow eligible: not a transfer, not on a net-worth-only tracking account. */
export function inCashFlow(t: Transaction): boolean {
  return !isTransfer(t) && !isTrackingAccount(t.bankAccount?.accountType ?? '');
}

export function txInMonth(txs: Transaction[], monthKey: string): Transaction[] {
  return txs.filter((t) => t.date.startsWith(monthKey));
}

export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
```

- [ ] **Step 7: Run tests, verify pass**

```bash
npm run test:dashboard
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/src/lib/dashboard package.json package-lock.json
git commit -m "feat(dashboard): add vitest + pure derivation layer foundation"
```

---

### Task 4: derive — `monthlyCashFlow` + `trendSeries`

**Files:**
- Modify: `apps/web/src/lib/dashboard/derive.ts`
- Test: `apps/web/src/lib/dashboard/derive.test.ts`

**Interfaces:**
- Consumes: Task 3 helpers + test factories.
- Produces:
  - `interface CashFlowMonth { month: string; revPersonal: number; revProject: number; expPersonal: number; expProject: number; net: number }`
  - `monthlyCashFlow(yearTx: Transaction[], now: Date): CashFlowMonth[]` — Jan → current month, project split via `projectId`, per-month net. (This is the logic currently inline in `page.tsx` from the working-tree chart upgrade.)
  - `interface TrendPoint { month: string; income: number; expenses: number; net: number }`
  - `trendSeries(yearTx: Transaction[], now: Date, months?: number): TrendPoint[]` — last `months` (default 6) calendar months, clamped to Jan of the current year.

- [ ] **Step 1: Write failing tests** (append to `derive.test.ts`)

```ts
import { monthlyCashFlow, trendSeries } from './derive';

const NOW = new Date(2026, 6, 3); // Jul 3 2026

describe('monthlyCashFlow', () => {
  it('splits project vs personal and computes per-month net', () => {
    const txs = [
      tx({ date: '2026-01-05', amount: 1000 }),                       // personal income
      tx({ date: '2026-01-06', amount: 500, projectId: 'p1' }),       // project income
      tx({ date: '2026-01-07', amount: -300 }),                       // personal expense
      tx({ date: '2026-01-08', amount: -200, projectId: 'p1' }),      // project expense
    ];
    const out = monthlyCashFlow(txs, NOW);
    expect(out).toHaveLength(7); // Jan..Jul
    expect(out[0]).toEqual({ month: 'Jan', revPersonal: 1000, revProject: 500, expPersonal: 300, expProject: 200, net: 1000 });
    expect(out[1].net).toBe(0); // empty Feb
  });
  it('excludes transfers and tracking accounts', () => {
    const txs = [
      tx({ date: '2026-01-05', amount: 1000, debtId: 'd1' }),
      tx({ date: '2026-01-05', amount: 1000, bankAccount: acct({ accountType: 'investment' }) }),
    ];
    expect(monthlyCashFlow(txs, NOW)[0].revPersonal).toBe(0);
  });
});

describe('trendSeries', () => {
  it('returns the last 6 months with income, expenses, net', () => {
    const txs = [tx({ date: '2026-07-01', amount: 800 }), tx({ date: '2026-07-02', amount: -300 })];
    const out = trendSeries(txs, NOW);
    expect(out).toHaveLength(6); // Feb..Jul
    expect(out[5]).toEqual({ month: 'Jul', income: 800, expenses: 300, net: 500 });
  });
  it('clamps to January when fewer months exist', () => {
    expect(trendSeries([], new Date(2026, 2, 15))).toHaveLength(3); // Jan, Feb, Mar
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npm run test:dashboard` → missing exports.

- [ ] **Step 3: Implement** (append to `derive.ts`)

```ts
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export interface CashFlowMonth {
  month: string; revPersonal: number; revProject: number;
  expPersonal: number; expProject: number; net: number;
}

export function monthlyCashFlow(yearTx: Transaction[], now: Date): CashFlowMonth[] {
  const year = now.getFullYear();
  return Array.from({ length: now.getMonth() + 1 }, (_, i) => {
    const txs = txInMonth(yearTx, `${year}-${String(i + 1).padStart(2, '0')}`).filter(inCashFlow);
    const sum = (pred: (t: Transaction) => boolean) =>
      +txs.filter(pred).reduce((s, t) => s + Math.abs(Number(t.amount)), 0).toFixed(2);
    const revPersonal = sum((t) => Number(t.amount) > 0 && !t.projectId);
    const revProject  = sum((t) => Number(t.amount) > 0 && !!t.projectId);
    const expPersonal = sum((t) => Number(t.amount) < 0 && !t.projectId);
    const expProject  = sum((t) => Number(t.amount) < 0 && !!t.projectId);
    return {
      month: MONTHS_SHORT[i], revPersonal, revProject, expPersonal, expProject,
      net: +(revPersonal + revProject - expPersonal - expProject).toFixed(2),
    };
  });
}

export interface TrendPoint { month: string; income: number; expenses: number; net: number }

export function trendSeries(yearTx: Transaction[], now: Date, months = 6): TrendPoint[] {
  const year = now.getFullYear();
  const end = now.getMonth();               // 0-based current month
  const start = Math.max(0, end - months + 1);
  return Array.from({ length: end - start + 1 }, (_, k) => {
    const i = start + k;
    const txs = txInMonth(yearTx, `${year}-${String(i + 1).padStart(2, '0')}`).filter(inCashFlow);
    const income   = +txs.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0).toFixed(2);
    const expenses = +txs.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0).toFixed(2);
    return { month: MONTHS_SHORT[i], income, expenses, net: +(income - expenses).toFixed(2) };
  });
}
```

**Note:** `monthlyCashFlow` adds `inCashFlow` filtering (tracking-account exclusion) that the current inline page code lacks — this is the intended single-source-of-truth correction, matching how the stat cards already behave.

- [ ] **Step 4: Run, verify PASS** — `npm run test:dashboard`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/dashboard
git commit -m "feat(dashboard): monthlyCashFlow and trendSeries derivations"
```

---

### Task 5: derive — `categoryTotals`, `foldOther`, `topMerchants`, `expenseChanges`

**Files:**
- Modify: `apps/web/src/lib/dashboard/derive.ts`
- Test: `apps/web/src/lib/dashboard/derive.test.ts`

**Interfaces:**
- Produces:
  - `interface CategorySlice { id: string; name: string; icon: string; color: string; value: number; pct: number }`
  - `categoryTotals(txs: Transaction[], dir: 'income' | 'expense'): CategorySlice[]` — cash-flow txs grouped by `categoryRef`, uncategorized folded into a `{ id: 'uncat', name: 'Uncategorized', icon: '❓', color: '#6B6B8A' }` slice, sorted desc, `pct` of total.
  - `foldOther(slices: CategorySlice[], max: number): CategorySlice[]` — keeps top `max-1`, sums the rest into `{ id: 'other', name: 'Other', icon: '·', color: '#6B6B8A' }`.
  - `interface MerchantSlice { name: string; total: number }`
  - `topMerchants(txs: Transaction[], n?: number): MerchantSlice[]` — expenses grouped by trimmed, case-insensitively-normalized `name` (display name = first-seen casing), top `n` (default 5).
  - `interface ExpenseChange { id: string; name: string; icon: string; color: string; current: number; previous: number; delta: number; pct: number | null }`
  - `expenseChanges(yearTx: Transaction[], monthKey: string): { changes: ExpenseChange[]; unchanged: number }` — per-category current vs previous month; rows with `|delta| < 5` AND (`pct === null` or `|pct| < 2`) are counted in `unchanged`, not listed. `pct` is `null` when previous = 0. Sorted by `|delta|` desc.

- [ ] **Step 1: Write failing tests** (append)

```ts
import { categoryTotals, foldOther, topMerchants, expenseChanges } from './derive';

describe('categoryTotals', () => {
  it('groups expenses by category with pct', () => {
    const food = cat({ id: 'f', name: 'Food' });
    const gas  = cat({ id: 'g', name: 'Gas' });
    const out = categoryTotals([
      tx({ amount: -75, categoryRef: food }), tx({ amount: -25, categoryRef: gas }),
      tx({ amount: 500, categoryRef: cat({ id: 'i', type: 'income' }) }), // ignored for dir=expense
    ], 'expense');
    expect(out.map((s) => [s.id, s.value, s.pct])).toEqual([['f', 75, 75], ['g', 25, 25]]);
  });
  it('folds uncategorized', () => {
    const out = categoryTotals([tx({ amount: -10, categoryRef: null })], 'expense');
    expect(out[0].id).toBe('uncat');
  });
});

describe('foldOther', () => {
  it('keeps top max-1 and sums the tail', () => {
    const slices = [80, 10, 6, 4].map((v, i) => ({ id: `c${i}`, name: `C${i}`, icon: '', color: '', value: v, pct: v }));
    const out = foldOther(slices, 3);
    expect(out).toHaveLength(3);
    expect(out[2]).toMatchObject({ id: 'other', value: 10 });
  });
  it('no-ops when under the cap', () => {
    expect(foldOther([], 6)).toHaveLength(0);
  });
});

describe('topMerchants', () => {
  it('normalizes names case-insensitively and ranks by total', () => {
    const out = topMerchants([
      tx({ name: 'Amazon', amount: -50 }), tx({ name: 'AMAZON ', amount: -30 }),
      tx({ name: 'Walmart', amount: -60 }),
    ]);
    expect(out[0]).toEqual({ name: 'Amazon', total: 80 });
    expect(out[1]).toEqual({ name: 'Walmart', total: 60 });
  });
});

describe('expenseChanges', () => {
  const food = cat({ id: 'f', name: 'Food' });
  it('computes per-category deltas vs previous month', () => {
    const { changes } = expenseChanges([
      tx({ date: '2026-06-10', amount: -100, categoryRef: food }),
      tx({ date: '2026-07-10', amount: -150, categoryRef: food }),
    ], '2026-07');
    expect(changes[0]).toMatchObject({ id: 'f', current: 150, previous: 100, delta: 50, pct: 50 });
  });
  it('collapses trivial changes into unchanged count', () => {
    const { changes, unchanged } = expenseChanges([
      tx({ date: '2026-06-10', amount: -100, categoryRef: food }),
      tx({ date: '2026-07-10', amount: -101, categoryRef: food }),
    ], '2026-07');
    expect(changes).toHaveLength(0);
    expect(unchanged).toBe(1);
  });
  it('handles January (previous month = December prior year) without crashing', () => {
    const { changes } = expenseChanges([tx({ date: '2026-01-10', amount: -100, categoryRef: food })], '2026-01');
    expect(changes[0].pct).toBeNull(); // no previous data
  });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** (append to `derive.ts`)

```ts
export interface CategorySlice { id: string; name: string; icon: string; color: string; value: number; pct: number }

const UNCAT = { id: 'uncat', name: 'Uncategorized', icon: '❓', color: '#6B6B8A' };
const OTHER = { id: 'other', name: 'Other', icon: '·', color: '#6B6B8A' };

export function categoryTotals(txs: Transaction[], dir: 'income' | 'expense'): CategorySlice[] {
  const sign = dir === 'income' ? 1 : -1;
  const map = new Map<string, CategorySlice>();
  for (const t of txs) {
    if (!inCashFlow(t) || Math.sign(Number(t.amount)) !== sign) continue;
    const c = t.categoryRef ?? UNCAT as never;
    const key = t.categoryRef ? t.categoryRef.id : 'uncat';
    const cur = map.get(key) ?? { id: key, name: c.name, icon: c.icon, color: c.color, value: 0, pct: 0 };
    cur.value = +(cur.value + Math.abs(Number(t.amount))).toFixed(2);
    map.set(key, cur);
  }
  const slices = [...map.values()].sort((a, b) => b.value - a.value);
  const total = slices.reduce((s, x) => s + x.value, 0);
  for (const s of slices) s.pct = total > 0 ? +((s.value / total) * 100).toFixed(1) : 0;
  return slices;
}

export function foldOther(slices: CategorySlice[], max: number): CategorySlice[] {
  if (slices.length <= max) return slices;
  const head = slices.slice(0, max - 1);
  const tail = slices.slice(max - 1);
  const value = +tail.reduce((s, x) => s + x.value, 0).toFixed(2);
  const pct = +tail.reduce((s, x) => s + x.pct, 0).toFixed(1);
  return [...head, { ...OTHER, value, pct }];
}

export interface MerchantSlice { name: string; total: number }

export function topMerchants(txs: Transaction[], n = 5): MerchantSlice[] {
  const map = new Map<string, MerchantSlice>();
  for (const t of txs) {
    if (!inCashFlow(t) || Number(t.amount) >= 0) continue;
    const display = t.name.trim();
    const key = display.toLowerCase();
    const cur = map.get(key) ?? { name: display, total: 0 };
    cur.total = +(cur.total + Math.abs(Number(t.amount))).toFixed(2);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, n);
}

export interface ExpenseChange {
  id: string; name: string; icon: string; color: string;
  current: number; previous: number; delta: number; pct: number | null;
}

export function expenseChanges(yearTx: Transaction[], monthKey: string): { changes: ExpenseChange[]; unchanged: number } {
  const [y, m] = monthKey.split('-').map(Number);
  const prev = new Date(y, m - 2); // previous month
  const prevKey = monthKeyOf(prev);
  const cur = categoryTotals(txInMonth(yearTx, monthKey), 'expense');
  const before = new Map(categoryTotals(txInMonth(yearTx, prevKey), 'expense').map((s) => [s.id, s]));
  const all: ExpenseChange[] = [];
  const seen = new Set<string>();
  for (const s of cur) {
    seen.add(s.id);
    const p = before.get(s.id)?.value ?? 0;
    all.push({
      id: s.id, name: s.name, icon: s.icon, color: s.color,
      current: s.value, previous: p, delta: +(s.value - p).toFixed(2),
      pct: p > 0 ? +(((s.value - p) / p) * 100).toFixed(1) : null,
    });
  }
  for (const [id, s] of before) {
    if (seen.has(id)) continue; // category dropped to zero this month
    all.push({ id, name: s.name, icon: s.icon, color: s.color, current: 0, previous: s.value, delta: -s.value, pct: -100 });
  }
  const meaningful = (c: ExpenseChange) => Math.abs(c.delta) >= 5 && (c.pct === null || Math.abs(c.pct) >= 2);
  return {
    changes: all.filter(meaningful).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    unchanged: all.filter((c) => !meaningful(c)).length,
  };
}
```

- [ ] **Step 4: Run, verify PASS.** Note the January test: `expenseChanges` only sees `yearTx` (Jan 1 → today), so December-prior-year data is absent by construction — `previous` is 0 and `pct` is `null`, which the panel renders as "new".

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/dashboard
git commit -m "feat(dashboard): category, merchant, and expense-change derivations"
```

---

### Task 6: derive — `calendarDays` + `spendingPace`

**Files:**
- Modify: `apps/web/src/lib/dashboard/derive.ts`
- Test: `apps/web/src/lib/dashboard/derive.test.ts`

**Interfaces:**
- Produces:
  - `interface CalendarCell { day: number | null; total: number; intensity: 0 | 1 | 2 | 3 | 4 }` — `day: null` = leading/trailing pad cell.
  - `calendarDays(yearTx: Transaction[], monthKey: string): CalendarCell[]` — length is a multiple of 7, Sunday-first. Intensity buckets: 0 = $0; else quartile of the month's max daily spend (1: ≤25%, 2: ≤50%, 3: ≤75%, 4: >75%).
  - `interface PaceStats { monthPct: number; budgetPct: number; projected: number; overBy: number; hasBudgets: boolean }` — `projected` = spent / monthFraction; `overBy` = projected − totalBudget (negative = under).
  - `spendingPace(budgets: Budget[], yearTx: Transaction[], monthKey: string, now: Date): PaceStats`

- [ ] **Step 1: Write failing tests** (append)

```ts
import { calendarDays, spendingPace } from './derive';

describe('calendarDays', () => {
  it('pads to full weeks, Sunday-first', () => {
    const out = calendarDays([], '2026-07'); // Jul 1 2026 = Wednesday
    expect(out.length % 7).toBe(0);
    expect(out.slice(0, 3).every((c) => c.day === null)).toBe(true); // Sun,Mon,Tue pads
    expect(out[3].day).toBe(1);
  });
  it('buckets intensity by quartile of max daily spend', () => {
    const out = calendarDays([
      tx({ date: '2026-07-01', amount: -100 }),
      tx({ date: '2026-07-02', amount: -20 }),
    ], '2026-07');
    const d1 = out.find((c) => c.day === 1)!;
    const d2 = out.find((c) => c.day === 2)!;
    const d3 = out.find((c) => c.day === 3)!;
    expect(d1.intensity).toBe(4);
    expect(d2.intensity).toBe(1);
    expect(d3.intensity).toBe(0);
  });
});

describe('spendingPace', () => {
  const budget = { id: 'b1', amount: 1000, spent: 0, category: cat() };
  it('computes month vs budget percentages and projection', () => {
    // Jul 15 of a 31-day month ≈ 48.4% elapsed; $600 spent of $1000 = 60%
    const out = spendingPace([budget], [tx({ date: '2026-07-10', amount: -600 })], '2026-07', new Date(2026, 6, 15));
    expect(out.monthPct).toBeCloseTo(48.4, 1);
    expect(out.budgetPct).toBe(60);
    expect(out.projected).toBeCloseTo(1240, 0);
    expect(out.overBy).toBeCloseTo(240, 0);
  });
  it('flags missing budgets', () => {
    expect(spendingPace([], [], '2026-07', new Date(2026, 6, 15)).hasBudgets).toBe(false);
  });
  it('views past months as fully elapsed', () => {
    expect(spendingPace([budget], [], '2026-06', new Date(2026, 6, 15)).monthPct).toBe(100);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** (append)

```ts
export interface CalendarCell { day: number | null; total: number; intensity: 0 | 1 | 2 | 3 | 4 }

export function calendarDays(yearTx: Transaction[], monthKey: string): CalendarCell[] {
  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDow = new Date(y, m - 1, 1).getDay(); // 0 = Sunday
  const perDay = new Map<number, number>();
  for (const t of txInMonth(yearTx, monthKey)) {
    if (!inCashFlow(t) || Number(t.amount) >= 0) continue;
    const day = Number(t.date.slice(8, 10));
    perDay.set(day, +(((perDay.get(day) ?? 0) + Math.abs(Number(t.amount)))).toFixed(2));
  }
  const max = Math.max(0, ...perDay.values());
  const bucket = (v: number): CalendarCell['intensity'] =>
    v <= 0 || max <= 0 ? 0 : v <= max * 0.25 ? 1 : v <= max * 0.5 ? 2 : v <= max * 0.75 ? 3 : 4;
  const cells: CalendarCell[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, total: 0, intensity: 0 });
  for (let d = 1; d <= daysInMonth; d++) {
    const total = perDay.get(d) ?? 0;
    cells.push({ day: d, total, intensity: bucket(total) });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, total: 0, intensity: 0 });
  return cells;
}

export interface PaceStats { monthPct: number; budgetPct: number; projected: number; overBy: number; hasBudgets: boolean }

export function spendingPace(budgets: Budget[], yearTx: Transaction[], monthKey: string, now: Date): PaceStats {
  const spendingBudgets = budgets.filter((b) => b.category ? b.category.type !== 'income' : true);
  const totalBudget = spendingBudgets.reduce((s, b) => s + Number(b.amount), 0);
  const spent = txInMonth(yearTx, monthKey)
    .filter((t) => inCashFlow(t) && Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurrent = monthKeyOf(now) === monthKey;
  const isFuture = monthKey > monthKeyOf(now);
  const frac = isFuture ? 0 : isCurrent ? now.getDate() / daysInMonth : 1;
  const projected = frac > 0 ? +(spent / frac).toFixed(2) : 0;
  return {
    monthPct: +(frac * 100).toFixed(1),
    budgetPct: totalBudget > 0 ? +((spent / totalBudget) * 100).toFixed(1) : 0,
    projected,
    overBy: +(projected - totalBudget).toFixed(2),
    hasBudgets: spendingBudgets.length > 0 && totalBudget > 0,
  };
}
```

Add `Budget` to the type import at the top of `derive.ts`:

```ts
import type { Transaction, Budget } from './types';
```

- [ ] **Step 4: Run, verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/dashboard
git commit -m "feat(dashboard): calendar heatmap and spending-pace derivations"
```

---

### Task 7: derive — `fixedVariable`, `savingsSeries`, `netWorthBreakdown`

**Files:**
- Modify: `apps/web/src/lib/dashboard/derive.ts`
- Test: `apps/web/src/lib/dashboard/derive.test.ts`

**Interfaces:**
- Produces:
  - `interface FixedVariableSplit { fixedTotal: number; variableTotal: number; fixedPct: number; fixed: CategorySlice[]; variable: CategorySlice[] }`
  - `fixedVariable(yearTx: Transaction[], monthKey: string): FixedVariableSplit` — split on `categoryRef?.isFixed === true`; uncategorized and unflagged → variable.
  - `interface SavingsPoint { month: string; actual: number; goal: number | null }`
  - `interface SavingsStats { points: SavingsPoint[]; current: number; goal: number | null; onTrackPct: number | null }`
  - `savingsSeries(yearTx: Transaction[], now: Date, goal: number | null): SavingsStats` — `actual` = cumulative net (Jan → current month); `goal` line = linear ramp `goal × (monthIndex+1)/12`; `onTrackPct` = current / (goal ramp at current month) × 100, null if no goal.
  - `interface NetWorthItem { label: string; value: number; color: string }`
  - `interface NetWorthBreakdown { total: number; assets: number; liabilities: number; assetItems: NetWorthItem[]; liabilityItems: NetWorthItem[]; deltaPct: number | null }`
  - `netWorthBreakdown(accounts: BankAccount[], debts: Debt[], yearTx: Transaction[], monthKey: string): NetWorthBreakdown` — assets = non-liability account balances + open-debt receivables… **match the existing page math exactly** (read `page.tsx` lines 160-175 during implementation and replicate: liabilities via `isLiability(accountType)`, open debts' `remaining` treated as they are today). `deltaPct` = approximation: `netCashFlowThisMonth / (total − netCashFlowThisMonth) × 100`, null when the denominator is ≤ 0.

- [ ] **Step 1: Write failing tests** (append)

```ts
import { fixedVariable, savingsSeries, netWorthBreakdown } from './derive';

describe('fixedVariable', () => {
  it('splits on category.isFixed; unflagged goes variable', () => {
    const rent = cat({ id: 'r', name: 'Rent', isFixed: true });
    const out = fixedVariable([
      tx({ date: '2026-07-01', amount: -1500, categoryRef: rent }),
      tx({ date: '2026-07-02', amount: -500 }),           // Food, unflagged
      tx({ date: '2026-07-03', amount: -100, categoryRef: null }),
    ], '2026-07');
    expect(out.fixedTotal).toBe(1500);
    expect(out.variableTotal).toBe(600);
    expect(out.fixedPct).toBeCloseTo(71.4, 1);
    expect(out.fixed).toHaveLength(1);
    expect(out.variable).toHaveLength(2);
  });
});

describe('savingsSeries', () => {
  const NOW = new Date(2026, 6, 3);
  it('accumulates net and ramps the goal linearly', () => {
    const out = savingsSeries([
      tx({ date: '2026-01-05', amount: 2000 }), tx({ date: '2026-01-06', amount: -500 }),
      tx({ date: '2026-02-05', amount: 1000 }),
    ], NOW, 12000);
    expect(out.points).toHaveLength(7);
    expect(out.points[0].actual).toBe(1500);
    expect(out.points[1].actual).toBe(2500);
    expect(out.points[0].goal).toBe(1000);   // 12000 × 1/12
    expect(out.points[6].goal).toBe(7000);   // 12000 × 7/12
    expect(out.current).toBe(2500);
    expect(out.onTrackPct).toBeCloseTo(35.7, 1); // 2500 / 7000
  });
  it('handles no goal', () => {
    const out = savingsSeries([], NOW, null);
    expect(out.goal).toBeNull();
    expect(out.onTrackPct).toBeNull();
    expect(out.points[0].goal).toBeNull();
  });
});

describe('netWorthBreakdown', () => {
  it('sums assets minus liabilities with receivables', () => {
    const out = netWorthBreakdown(
      [acct({ id: 'a1', accountName: 'Chk', accountType: 'checking', balance: 5000 }),
       acct({ id: 'a2', accountName: 'CC', accountType: 'credit', balance: 1200 })],
      [{ remaining: 300, status: 'open' }],
      [], '2026-07',
    );
    expect(out.assets).toBe(5300);       // 5000 + 300 receivable
    expect(out.liabilities).toBe(1200);
    expect(out.total).toBe(4100);
  });
  it('approximates month delta from this month cash flow', () => {
    const out = netWorthBreakdown(
      [acct({ balance: 5000 })], [],
      [tx({ date: '2026-07-01', amount: 1000 })], '2026-07',
    );
    expect(out.deltaPct).toBeCloseTo(25, 0); // 1000 / (5000-1000)
  });
});
```

**IMPORTANT:** Before implementing, read the current net-worth math in `apps/web/src/app/dashboard/page.tsx` (search `netWorth`, `receivables`, `isLiability`). If it differs from the test above (e.g. how credit balances are signed, whether receivables come from debts), **adjust the test to match the page's existing behavior** — the panel must not silently change the user's net-worth number.

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** (append; adjust to the verified page math)

```ts
export interface FixedVariableSplit {
  fixedTotal: number; variableTotal: number; fixedPct: number;
  fixed: CategorySlice[]; variable: CategorySlice[];
}

export function fixedVariable(yearTx: Transaction[], monthKey: string): FixedVariableSplit {
  const txs = txInMonth(yearTx, monthKey).filter((t) => inCashFlow(t) && Number(t.amount) < 0);
  const fixed = categoryTotals(txs.filter((t) => t.categoryRef?.isFixed === true), 'expense');
  const variable = categoryTotals(txs.filter((t) => t.categoryRef?.isFixed !== true), 'expense');
  const fixedTotal = +fixed.reduce((s, x) => s + x.value, 0).toFixed(2);
  const variableTotal = +variable.reduce((s, x) => s + x.value, 0).toFixed(2);
  const all = fixedTotal + variableTotal;
  return {
    fixedTotal, variableTotal,
    fixedPct: all > 0 ? +((fixedTotal / all) * 100).toFixed(1) : 0,
    fixed, variable,
  };
}

export interface SavingsPoint { month: string; actual: number; goal: number | null }
export interface SavingsStats { points: SavingsPoint[]; current: number; goal: number | null; onTrackPct: number | null }

export function savingsSeries(yearTx: Transaction[], now: Date, goal: number | null): SavingsStats {
  const flow = monthlyCashFlow(yearTx, now);
  let cum = 0;
  const points: SavingsPoint[] = flow.map((m, i) => {
    cum = +(cum + m.net).toFixed(2);
    return { month: m.month, actual: cum, goal: goal != null ? +((goal * (i + 1)) / 12).toFixed(2) : null };
  });
  const current = points.length ? points[points.length - 1].actual : 0;
  const goalNow = points.length && goal != null ? points[points.length - 1].goal! : null;
  return {
    points, current, goal,
    onTrackPct: goalNow && goalNow > 0 ? +((current / goalNow) * 100).toFixed(1) : null,
  };
}

export interface NetWorthItem { label: string; value: number; color: string }
export interface NetWorthBreakdown {
  total: number; assets: number; liabilities: number;
  assetItems: NetWorthItem[]; liabilityItems: NetWorthItem[]; deltaPct: number | null;
}

export function netWorthBreakdown(
  accounts: BankAccount[], debts: Debt[], yearTx: Transaction[], monthKey: string,
): NetWorthBreakdown {
  const assetAccts = accounts.filter((a) => !isLiability(a.accountType));
  const liabAccts  = accounts.filter((a) => isLiability(a.accountType));
  const receivables = debts.filter((d) => d.status === 'open').reduce((s, d) => s + Number(d.remaining), 0);
  const assets = +(assetAccts.reduce((s, a) => s + Number(a.balance), 0) + receivables).toFixed(2);
  const liabilities = +liabAccts.reduce((s, a) => s + Number(a.balance), 0).toFixed(2);
  const total = +(assets - liabilities).toFixed(2);
  const monthNet = txInMonth(yearTx, monthKey).filter(inCashFlow)
    .reduce((s, t) => s + Number(t.amount), 0);
  const base = total - monthNet;
  const assetItems: NetWorthItem[] = [
    ...assetAccts.map((a) => ({ label: a.accountName, value: Number(a.balance), color: a.color })),
    ...(receivables > 0 ? [{ label: 'Owed to you', value: receivables, color: '#6B6B8A' }] : []),
  ];
  return {
    total, assets, liabilities,
    assetItems,
    liabilityItems: liabAccts.map((a) => ({ label: a.accountName, value: Number(a.balance), color: a.color })),
    deltaPct: base > 0 ? +((monthNet / base) * 100).toFixed(1) : null,
  };
}
```

Update imports at the top of `derive.ts`:

```ts
import { isTrackingAccount, isLiability } from '@/lib/accountTypes';
import type { Transaction, Budget, BankAccount, Debt } from './types';
```

- [ ] **Step 4: Run, verify PASS** — `npm run test:dashboard`. Also run `npx tsc --noEmit -p apps/web/tsconfig.json` (pre-existing errors: `validator.ts` hello route + two `b.category` possibly-null at old lines 685/688 — anything NEW is yours to fix).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/dashboard
git commit -m "feat(dashboard): fixed/variable, savings, and net-worth derivations"
```

---

### Task 8: `useDashboardData` hook + `Panel` chrome + `chartTheme`

**Files:**
- Create: `apps/web/src/hooks/useDashboardData.ts`
- Create: `apps/web/src/components/dashboard/Panel.tsx`
- Create: `apps/web/src/components/dashboard/chartTheme.ts`

**Interfaces:**
- Consumes: types from `@/lib/dashboard/types`, `useThemeColors()` (returns `{ primary, green, rose, amber, orange, sky, violet, textPrimary, textSecondary, textMuted, border, elevated }`), `useUser()`.
- Produces:
  - `useDashboardData(): { month, setMonth, transactions, yearTx, accounts, budgets, projects, debts, loading, reload }` — exact copy of the fetch logic currently in `page.tsx` lines 125-148 (6 parallel fetches, `credentials: 'include'`, array guards).
  - `<Panel title subtitle legend colSpan children>` — glass card: `title: string`, `subtitle?: string`, `legend?: React.ReactNode` (right slot), `colSpan?: 1 | 2` (maps to `xl:col-span-1/2`), `loading?: boolean` (renders centered "Loading…").
  - `makeChartTheme(tc)` returning `{ axisTick, axisProps, gridProps, tooltipProps }` used by every recharts panel.

- [ ] **Step 1: Create the hook** — `apps/web/src/hooks/useDashboardData.ts`:

```ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Transaction, BankAccount, Budget, Project, Debt } from '@/lib/dashboard/types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

function currentMonth() { return new Date().toISOString().slice(0, 7); }
function monthFrom(m: string) { return `${m}-01`; }
function monthTo(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).toISOString().slice(0, 10);
}

export function useDashboardData() {
  const [month, setMonth] = useState(currentMonth);
  const [transactions, setTx] = useState<Transaction[]>([]);
  const [yearTx, setYearTx] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const from = monthFrom(month), to = monthTo(month);
      const yearFrom = `${new Date().getFullYear()}-01-01`;
      const yearTo = new Date().toISOString().slice(0, 10);
      const [tx, ytx, accs, bdg, proj, dbt] = await Promise.all([
        fetch(`${API}/transactions?from=${from}&to=${to}&limit=500`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API}/transactions?from=${yearFrom}&to=${yearTo}&limit=5000`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API}/bank-accounts`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API}/budgets?month=${month}`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API}/projects`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`${API}/debts`, { credentials: 'include' }).then((r) => r.json()),
      ]);
      setTx(Array.isArray(tx) ? tx : []);
      setYearTx(Array.isArray(ytx) ? ytx : []);
      setAccounts(Array.isArray(accs) ? accs : []);
      setBudgets(Array.isArray(bdg) ? bdg : []);
      setProjects(Array.isArray(proj) ? proj : []);
      setDebts(Array.isArray(dbt) ? dbt : []);
    } catch {} finally { setLoading(false); }
  }, [month]);

  useEffect(() => { reload(); }, [reload]);

  return { month, setMonth, transactions, yearTx, accounts, budgets, projects, debts, loading, reload };
}
```

- [ ] **Step 2: Create `Panel.tsx`** — `apps/web/src/components/dashboard/Panel.tsx`:

```tsx
'use client';

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

interface PanelProps {
  title: string;
  subtitle?: string;
  legend?: React.ReactNode;
  colSpan?: 1 | 2;
  loading?: boolean;
  children: React.ReactNode;
}

export default function Panel({ title, subtitle, legend, colSpan = 1, loading, children }: PanelProps) {
  return (
    <div className={`flex flex-col gap-3 p-5 rounded-2xl min-w-0 ${colSpan === 2 ? 'xl:col-span-2' : ''}`} style={glass}>
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <p className="card-title">{title}</p>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>}
        </div>
        {legend}
      </div>
      {loading
        ? <div className="flex-1 min-h-32 flex items-center justify-center text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
        : children}
    </div>
  );
}

/** Standard legend chip row for chart panels. */
export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex items-center gap-3 text-[10px] font-semibold flex-wrap" style={{ color: 'var(--color-text-secondary)' }}>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className={it.line ? 'w-4 h-0.5 rounded-full' : 'w-2.5 h-1.5 rounded-sm'} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Standard empty state used by every panel. */
export function PanelEmpty({ message }: { message: string }) {
  return (
    <div className="flex-1 min-h-32 flex items-center justify-center text-xs text-center px-4"
      style={{ color: 'var(--color-text-muted)' }}>
      {message}
    </div>
  );
}
```

- [ ] **Step 3: Create `chartTheme.ts`** — `apps/web/src/components/dashboard/chartTheme.ts`:

```ts
import type { ThemeColors } from '@/components/ThemeProvider';

/** $1,234.56 */
export function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2 }); }

/** Compact axis money: -$12k / $850 */
export function fmtAxis(v: number) {
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  return `${sign}$${a >= 1000 ? `${(a / 1000).toFixed(0)}k` : a}`;
}

export function makeChartTheme(tc: ThemeColors) {
  return {
    xAxis: { tick: { fill: tc.textMuted, fontSize: 10 }, axisLine: false, tickLine: false } as const,
    yAxis: {
      tick: { fill: tc.textMuted, fontSize: 10 }, axisLine: false, tickLine: false,
      width: 44, tickFormatter: fmtAxis,
    } as const,
    grid: { vertical: false, stroke: tc.border } as const,
    tooltip: {
      cursor: { fill: 'color-mix(in srgb, currentColor 5%, transparent)' },
      contentStyle: { background: 'var(--color-elevated)', border: 'var(--glass-border)', borderRadius: 12, fontSize: 12 },
      labelStyle: { color: tc.textPrimary, fontWeight: 700, marginBottom: 4 },
    } as const,
  };
}
```

If `ThemeProvider.tsx` does not export the `ThemeColors` type, add `export type { ThemeColors }` there (the interface exists at `apps/web/src/components/ThemeProvider.tsx:24-29`).

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit -p apps/web/tsconfig.json` (no NEW errors).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useDashboardData.ts apps/web/src/components/dashboard apps/web/src/components/ThemeProvider.tsx
git commit -m "feat(dashboard): data hook, panel chrome, and shared chart theme"
```

---

### Task 9: Row-1 panels — IncomeExpenses, CashFlowTrend, CategoryDonut, CategoryRanking

**Files:**
- Create: `apps/web/src/components/dashboard/panels/IncomeExpensesPanel.tsx`
- Create: `apps/web/src/components/dashboard/panels/CashFlowTrendPanel.tsx`
- Create: `apps/web/src/components/dashboard/panels/CategoryDonutPanel.tsx`
- Create: `apps/web/src/components/dashboard/panels/CategoryRankingPanel.tsx`

**Interfaces:**
- Consumes: `Panel`, `Legend`, `PanelEmpty`, `makeChartTheme`, `fmt`, `fmtAxis`; derive types `CashFlowMonth`, `TrendPoint`, `CategorySlice`; `useThemeColors()`.
- Produces (consumed by Task 14's page):
  - `<IncomeExpensesPanel data={CashFlowMonth[]} loading={boolean} />`
  - `<CashFlowTrendPanel data={TrendPoint[]} loading={boolean} />`
  - `<CategoryDonutPanel slices={CategorySlice[]} title subtitle total={number} loading={boolean} />` (reused by Income Sources in Task 10)
  - `<CategoryRankingPanel slices={CategorySlice[]} loading={boolean} />`
- Chart identity colors are fixed per entity: income = green, project income = sky, expenses = orange, project expenses = amber, net = violet. Donut slices use each category's own stored `color`.

- [ ] **Step 1: `IncomeExpensesPanel.tsx`** — the stacked chart currently inline in `page.tsx` (working tree) plus a stat strip:

```tsx
'use client';

import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { Legend, PanelEmpty } from '../Panel';
import { makeChartTheme, fmt } from '../chartTheme';
import type { CashFlowMonth } from '@/lib/dashboard/derive';

const LABELS: Record<string, string> = {
  revPersonal: 'Income', revProject: 'Project income',
  expPersonal: 'Expenses', expProject: 'Project expenses', net: 'Net',
};

export default function IncomeExpensesPanel({ data, loading }: { data: CashFlowMonth[]; loading: boolean }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const income = data.reduce((s, m) => s + m.revPersonal + m.revProject, 0);
  const expenses = data.reduce((s, m) => s + m.expPersonal + m.expProject, 0);
  const net = +(income - expenses).toFixed(2);
  const empty = !loading && income === 0 && expenses === 0;
  return (
    <Panel title="Income vs Expenses" subtitle={`${new Date().getFullYear()} · year to date`} loading={loading}
      legend={<Legend items={[
        { label: 'Income', color: tc.green }, { label: 'Project income', color: tc.sky },
        { label: 'Expenses', color: tc.orange }, { label: 'Project expenses', color: tc.amber },
        { label: 'Net', color: tc.violet, line: true },
      ]} />}>
      {empty ? <PanelEmpty message="No cash-flow activity this year yet." /> : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={data} barCategoryGap="30%" barGap={3}>
              <CartesianGrid {...th.grid} />
              <XAxis dataKey="month" {...th.xAxis} />
              <YAxis {...th.yAxis} />
              <Tooltip {...th.tooltip}
                formatter={(v: unknown, name: unknown) => {
                  const n = Number(v);
                  return [`${n < 0 ? '-' : ''}$${fmt(Math.abs(n))}`, LABELS[String(name)] ?? String(name)];
                }} />
              <ReferenceLine y={0} stroke={tc.border} />
              <Bar dataKey="revPersonal" stackId="rev" fill={tc.green} fillOpacity={0.85} />
              <Bar dataKey="revProject" stackId="rev" fill={tc.sky} fillOpacity={0.85} radius={[4, 4, 0, 0]} />
              <Bar dataKey="expPersonal" stackId="exp" fill={tc.orange} fillOpacity={0.85} />
              <Bar dataKey="expProject" stackId="exp" fill={tc.amber} fillOpacity={0.85} radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="net" stroke={tc.violet} strokeWidth={2} dot={{ fill: tc.violet, r: 3, strokeWidth: 0 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            {[{ l: 'Total income', v: income, c: tc.green }, { l: 'Total expenses', v: expenses, c: tc.orange }, { l: 'Net', v: net, c: net >= 0 ? tc.green : tc.rose }].map((s) => (
              <div key={s.l} className="rounded-xl py-2 px-1" style={{ border: 'var(--glass-border)' }}>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{s.l}</p>
                <p className="text-sm font-bold" style={{ color: s.c }}>{s.v < 0 ? '-' : ''}${fmt(Math.abs(s.v))}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
```

- [ ] **Step 2: `CashFlowTrendPanel.tsx`**:

```tsx
'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { Legend, PanelEmpty } from '../Panel';
import { makeChartTheme, fmt } from '../chartTheme';
import type { TrendPoint } from '@/lib/dashboard/derive';

const LABELS: Record<string, string> = { income: 'Income', expenses: 'Expenses', net: 'Net cash flow' };

export default function CashFlowTrendPanel({ data, loading }: { data: TrendPoint[]; loading: boolean }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const empty = !loading && data.every((p) => p.income === 0 && p.expenses === 0);
  return (
    <Panel title="Cash-Flow Trend" subtitle={`Last ${data.length} months`} loading={loading}
      legend={<Legend items={[
        { label: 'Income', color: tc.green, line: true },
        { label: 'Expenses', color: tc.orange, line: true },
        { label: 'Net', color: tc.violet, line: true },
      ]} />}>
      {empty ? <PanelEmpty message="No activity in this window." /> : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid {...th.grid} />
            <XAxis dataKey="month" {...th.xAxis} />
            <YAxis {...th.yAxis} />
            <Tooltip {...th.tooltip}
              formatter={(v: unknown, name: unknown) => {
                const n = Number(v);
                return [`${n < 0 ? '-' : ''}$${fmt(Math.abs(n))}`, LABELS[String(name)] ?? String(name)];
              }} />
            <ReferenceLine y={0} stroke={tc.border} />
            <Line type="monotone" dataKey="income" stroke={tc.green} strokeWidth={2} dot={{ fill: tc.green, r: 3, strokeWidth: 0 }} />
            <Line type="monotone" dataKey="expenses" stroke={tc.orange} strokeWidth={2} dot={{ fill: tc.orange, r: 3, strokeWidth: 0 }} />
            <Line type="monotone" dataKey="net" stroke={tc.violet} strokeWidth={2} dot={{ fill: tc.violet, r: 3, strokeWidth: 0 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
```

- [ ] **Step 3: `CategoryDonutPanel.tsx`** (generic — used for Expenses by Category AND Income Sources):

```tsx
'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { makeChartTheme, fmt } from '../chartTheme';
import type { CategorySlice } from '@/lib/dashboard/derive';

interface Props {
  title: string; subtitle: string;
  slices: CategorySlice[]; total: number; loading: boolean;
}

export default function CategoryDonutPanel({ title, subtitle, slices, total, loading }: Props) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  return (
    <Panel title={title} subtitle={subtitle} loading={loading}>
      {slices.length === 0 ? <PanelEmpty message="Nothing categorized here yet." /> : (
        <div className="flex items-center gap-3">
          <div className="relative w-32 h-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" innerRadius={42} outerRadius={60}
                  paddingAngle={2} strokeWidth={0}>
                  {slices.map((s) => <Cell key={s.id} fill={s.color} />)}
                </Pie>
                <Tooltip {...th.tooltip} formatter={(v: unknown, name: unknown) => [`$${fmt(Number(v))}`, String(name)]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-sm font-bold">${fmt(total)}</p>
              <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>Total</p>
            </div>
          </div>
          <ul className="flex-1 flex flex-col gap-1.5 text-xs min-w-0">
            {slices.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>{s.name}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>{s.pct}%</span>
                <span className="font-semibold tabular-nums">${fmt(s.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
```

- [ ] **Step 4: `CategoryRankingPanel.tsx`**:

```tsx
'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { CategorySlice } from '@/lib/dashboard/derive';

export default function CategoryRankingPanel({ slices, loading }: { slices: CategorySlice[]; loading: boolean }) {
  const tc = useThemeColors();
  const max = slices[0]?.value || 1;
  return (
    <Panel title="Category Spending Ranking" subtitle="This month" loading={loading}>
      {slices.length === 0 ? <PanelEmpty message="No spending this month yet." /> : (
        <ul className="flex flex-col gap-2.5">
          {slices.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-xs">
              <span className="w-24 truncate shrink-0" style={{ color: 'var(--color-text-secondary)' }}>{s.name}</span>
              <div className="flex-1 h-3 rounded-md overflow-hidden" style={{ background: 'color-mix(in srgb, currentColor 6%, transparent)' }}>
                <div className="h-full rounded-md" style={{ width: `${(s.value / max) * 100}%`, background: s.color, opacity: 0.85 }} />
              </div>
              <span className="font-semibold tabular-nums w-16 text-right">${fmt(s.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
```

Note (chart rules): bar fills use each category's stored `color` — identity follows the entity in both the donut and ranking, so a category is the same hue everywhere.

- [ ] **Step 5: Typecheck** — `npx tsc --noEmit -p apps/web/tsconfig.json` (no new errors; panels aren't wired yet, that's Task 14).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/dashboard/panels
git commit -m "feat(dashboard): row-1 panels (income/expenses, trend, donut, ranking)"
```

---

### Task 10: Row-2 panels — BudgetActual, SpendingCalendar, SpendingPace, IncomeSources

**Files:**
- Create: `apps/web/src/components/dashboard/panels/BudgetActualPanel.tsx`
- Create: `apps/web/src/components/dashboard/panels/SpendingCalendarPanel.tsx`
- Create: `apps/web/src/components/dashboard/panels/SpendingPacePanel.tsx`
- (Income Sources reuses `CategoryDonutPanel` — wiring happens in Task 14; no new file.)

**Interfaces:**
- Consumes: `Budget`, `CalendarCell`, `PaceStats`; `Panel`, `PanelEmpty`, `fmt`.
- Produces:
  - `<BudgetActualPanel budgets={Budget[]} loading />` — filters to expense budgets with a category, exactly like the current page's `spendingBudgets` (read `page.tsx` current filter and replicate).
  - `<SpendingCalendarPanel cells={CalendarCell[]} monthLabel={string} loading />`
  - `<SpendingPacePanel pace={PaceStats} loading />`

- [ ] **Step 1: `BudgetActualPanel.tsx`**:

```tsx
'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { Budget } from '@/lib/dashboard/types';

export default function BudgetActualPanel({ budgets, loading }: { budgets: Budget[]; loading: boolean }) {
  const tc = useThemeColors();
  return (
    <Panel title="Budget vs Actual" subtitle="This month" loading={loading}>
      {budgets.length === 0 ? <PanelEmpty message="No budgets set. Create budgets to track spending against targets." /> : (
        <ul className="flex flex-col gap-2.5">
          {budgets.map((b) => {
            const amount = Number(b.amount), spent = Number(b.spent);
            const pct = amount > 0 ? (spent / amount) * 100 : 0;
            const tone = pct > 100 ? tc.rose : pct >= 80 ? tc.amber : tc.green;
            return (
              <li key={b.id} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
                  {b.category?.name ?? '—'}
                </span>
                <span className="w-14 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>${fmt(amount)}</span>
                <span className="w-14 text-right tabular-nums font-semibold">${fmt(spent)}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, currentColor 6%, transparent)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: tone }} />
                </div>
                <span className="w-10 text-right tabular-nums font-bold" style={{ color: tone }}>{pct.toFixed(0)}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
```

- [ ] **Step 2: `SpendingCalendarPanel.tsx`** — sequential sky ramp via opacity steps of one hue (dark → bright on the dark surface):

```tsx
'use client';

import { useState } from 'react';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { CalendarCell } from '@/lib/dashboard/derive';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const RAMP_ALPHA = [0, 0.18, 0.38, 0.62, 0.9]; // intensity 0..4 → sky opacity

export default function SpendingCalendarPanel({ cells, monthLabel, loading }: {
  cells: CalendarCell[]; monthLabel: string; loading: boolean;
}) {
  const tc = useThemeColors();
  const [hover, setHover] = useState<CalendarCell | null>(null);
  const empty = !loading && cells.every((c) => c.total === 0);
  return (
    <Panel title="Daily Spending" subtitle={monthLabel} loading={loading}>
      {empty ? <PanelEmpty message="No spending recorded this month." /> : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-7 gap-1 text-center">
            {DOW.map((d, i) => (
              <span key={i} className="text-[9px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>{d}</span>
            ))}
            {cells.map((c, i) => (
              <div key={i}
                onMouseEnter={() => c.day && setHover(c)} onMouseLeave={() => setHover(null)}
                className="aspect-square rounded-md flex items-center justify-center text-[9px] font-medium"
                style={c.day == null ? { opacity: 0 } : {
                  background: c.intensity === 0
                    ? 'color-mix(in srgb, currentColor 4%, transparent)'
                    : `color-mix(in srgb, ${tc.sky} ${RAMP_ALPHA[c.intensity] * 100}%, transparent)`,
                  color: c.intensity >= 3 ? '#0B1020' : 'var(--color-text-secondary)',
                  cursor: c.total > 0 ? 'default' : undefined,
                }}>
                {c.day ?? ''}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-center h-4" style={{ color: 'var(--color-text-muted)' }}>
            {hover && hover.day != null
              ? `${monthLabel.split(' ')[0]} ${hover.day} — $${fmt(hover.total)}`
              : 'Darker = more spent · hover a day'}
          </p>
        </div>
      )}
    </Panel>
  );
}
```

- [ ] **Step 3: `SpendingPacePanel.tsx`** — two SVG ring gauges + projection message:

```tsx
'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { PaceStats } from '@/lib/dashboard/derive';

function Ring({ pct, color, label, sub }: { pct: number; color: string; label: string; sub: string }) {
  const R = 34, C = 2 * Math.PI * R;
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90">
          <circle cx="42" cy="42" r={R} fill="none" strokeWidth="7"
            stroke="color-mix(in srgb, currentColor 8%, transparent)" />
          <circle cx="42" cy="42" r={R} fill="none" strokeWidth="7" stroke={color}
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - clamped / 100)} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold tabular-nums">{pct.toFixed(0)}%</span>
        </div>
      </div>
      <p className="text-[10px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
      <p className="text-[9px] -mt-1" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>
    </div>
  );
}

export default function SpendingPacePanel({ pace, loading }: { pace: PaceStats; loading: boolean }) {
  const tc = useThemeColors();
  if (!loading && !pace.hasBudgets) {
    return (
      <Panel title="Spending Pace" subtitle="This month" loading={loading}>
        <PanelEmpty message="Set budgets to see whether your spending pace will stay under them." />
      </Panel>
    );
  }
  const over = pace.overBy > 0;
  return (
    <Panel title="Spending Pace" subtitle="This month" loading={loading}>
      <div className="flex items-center justify-around">
        <Ring pct={pace.monthPct} color={tc.sky} label="of the month" sub="elapsed" />
        <Ring pct={pace.budgetPct} color={pace.budgetPct > pace.monthPct ? tc.amber : tc.violet} label="of the budget" sub="spent" />
      </div>
      <div className="flex items-start gap-2 rounded-xl p-3 text-xs" style={{ border: 'var(--glass-border)' }}>
        <span aria-hidden="true">{over ? '⚠️' : '✓'}</span>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          At your current pace you&apos;ll {over ? 'exceed' : 'finish under'} your monthly budget by{' '}
          <span className="font-bold" style={{ color: over ? tc.rose : tc.green }}>${fmt(Math.abs(pace.overBy))}</span>.
        </p>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 4: Typecheck; commit**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
git add apps/web/src/components/dashboard/panels
git commit -m "feat(dashboard): row-2 panels (budget table, calendar heatmap, pace gauges)"
```

---

### Task 11: Row-3 panels — FixedVariable, RecurringTimeline (empty), SavingsGrowth, NetWorth

**Files:**
- Create: `apps/web/src/components/dashboard/panels/FixedVariablePanel.tsx`
- Create: `apps/web/src/components/dashboard/panels/RecurringTimelinePanel.tsx`
- Create: `apps/web/src/components/dashboard/panels/SavingsGrowthPanel.tsx`
- Create: `apps/web/src/components/dashboard/panels/NetWorthPanel.tsx`

**Interfaces:**
- Consumes: `FixedVariableSplit`, `SavingsStats`, `NetWorthBreakdown` from derive; `useUser()` (for `savingsGoal` + `refetch`); `PATCH ${API}/auth/profile` from Task 2.
- Produces:
  - `<FixedVariablePanel split={FixedVariableSplit} loading />`
  - `<RecurringTimelinePanel />` — static empty state, no props.
  - `<SavingsGrowthPanel stats={SavingsStats} loading onGoalSaved={() => void} />` — inline goal editing; calls `PATCH /auth/profile { savingsGoal }` then `onGoalSaved()`.
  - `<NetWorthPanel data={NetWorthBreakdown} loading />`

- [ ] **Step 1: `FixedVariablePanel.tsx`**:

```tsx
'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { FixedVariableSplit } from '@/lib/dashboard/derive';

export default function FixedVariablePanel({ split, loading }: { split: FixedVariableSplit; loading: boolean }) {
  const tc = useThemeColors();
  const total = split.fixedTotal + split.variableTotal;
  return (
    <Panel title="Fixed vs Variable" subtitle="This month" loading={loading}>
      {total === 0 ? <PanelEmpty message="No expenses this month. Mark categories as fixed in Settings → Categories." /> : (
        <div className="flex flex-col gap-3">
          <div className="flex h-9 rounded-xl overflow-hidden text-[10px] font-bold">
            {split.fixedTotal > 0 && (
              <div className="flex flex-col items-center justify-center" style={{ width: `${split.fixedPct}%`, background: `color-mix(in srgb, ${tc.violet} 45%, transparent)`, minWidth: 54 }}>
                <span>Fixed {split.fixedPct.toFixed(0)}%</span>
                <span className="font-medium opacity-80">${fmt(split.fixedTotal)}</span>
              </div>
            )}
            {split.variableTotal > 0 && (
              <div className="flex flex-col items-center justify-center" style={{ flex: 1, background: `color-mix(in srgb, ${tc.sky} 30%, transparent)`, minWidth: 54 }}>
                <span>Variable {(100 - split.fixedPct).toFixed(0)}%</span>
                <span className="font-medium opacity-80">${fmt(split.variableTotal)}</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[{ label: 'Fixed', list: split.fixed }, { label: 'Variable', list: split.variable }].map((col) => (
              <ul key={col.label} className="flex flex-col gap-1.5">
                {col.list.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>{s.name}</span>
                    <span className="tabular-nums font-semibold">${fmt(s.value)}</span>
                  </li>
                ))}
                {col.list.length === 0 && <li style={{ color: 'var(--color-text-muted)' }}>None</li>}
              </ul>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
```

- [ ] **Step 2: `RecurringTimelinePanel.tsx`** — final chrome, Phase-2-ready empty state:

```tsx
'use client';

import Panel, { PanelEmpty } from '../Panel';

export default function RecurringTimelinePanel() {
  return (
    <Panel title="Recurring Expenses" subtitle="Upcoming">
      <PanelEmpty message="Recurring-payment detection is coming soon. Cofre will spot repeating charges (rent, Netflix, insurance) and preview them here." />
    </Panel>
  );
}
```

- [ ] **Step 3: `SavingsGrowthPanel.tsx`** — area+line chart with inline goal editing:

```tsx
'use client';

import { useState } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { Legend, PanelEmpty } from '../Panel';
import { makeChartTheme, fmt } from '../chartTheme';
import type { SavingsStats } from '@/lib/dashboard/derive';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export default function SavingsGrowthPanel({ stats, loading, onGoalSaved }: {
  stats: SavingsStats; loading: boolean; onGoalSaved: () => void;
}) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  async function saveGoal() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    setSaving(true);
    try {
      await fetch(`${API}/auth/profile`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ savingsGoal: n }),
      });
      setEditing(false);
      onGoalSaved();
    } finally { setSaving(false); }
  }

  const hasData = stats.points.some((p) => p.actual !== 0);
  return (
    <Panel title="Savings Growth" subtitle="This year" loading={loading}
      legend={<Legend items={[
        { label: 'Actual', color: tc.green, line: true },
        ...(stats.goal != null ? [{ label: 'Goal', color: tc.textMuted, line: true }] : []),
      ]} />}>
      {!hasData ? <PanelEmpty message="Savings build up here as your monthly income exceeds expenses." /> : (
        <>
          <ResponsiveContainer width="100%" height={150}>
            <ComposedChart data={stats.points}>
              <CartesianGrid {...th.grid} />
              <XAxis dataKey="month" {...th.xAxis} />
              <YAxis {...th.yAxis} />
              <Tooltip {...th.tooltip}
                formatter={(v: unknown, name: unknown) => {
                  const n = Number(v);
                  return [`${n < 0 ? '-' : ''}$${fmt(Math.abs(n))}`, name === 'actual' ? 'Saved' : 'Goal pace'];
                }} />
              <ReferenceLine y={0} stroke={tc.border} />
              <Area type="monotone" dataKey="actual" stroke={tc.green} strokeWidth={2}
                fill={`color-mix(in srgb, ${tc.green} 14%, transparent)`} dot={{ fill: tc.green, r: 2.5, strokeWidth: 0 }} />
              {stats.goal != null && (
                <Line type="monotone" dataKey="goal" stroke={tc.textMuted} strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Saved</p>
              <p className="font-bold" style={{ color: stats.current >= 0 ? tc.green : tc.rose }}>
                {stats.current < 0 ? '-' : ''}${fmt(Math.abs(stats.current))}
              </p>
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Goal</p>
              {editing ? (
                <span className="flex items-center gap-1 justify-center">
                  <input autoFocus value={value} onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveGoal()}
                    className="w-16 px-1 py-0.5 rounded text-xs bg-transparent text-center"
                    style={{ border: 'var(--glass-border)' }} placeholder="15000" inputMode="decimal" />
                  <button onClick={saveGoal} disabled={saving} className="font-bold" style={{ color: tc.green }}>✓</button>
                </span>
              ) : (
                <button className="font-bold underline decoration-dotted underline-offset-2"
                  onClick={() => { setValue(stats.goal != null ? String(stats.goal) : ''); setEditing(true); }}>
                  {stats.goal != null ? `$${fmt(stats.goal)}` : 'Set a goal'}
                </button>
              )}
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>On track</p>
              <p className="font-bold" style={{ color: (stats.onTrackPct ?? 0) >= 100 ? tc.green : tc.amber }}>
                {stats.onTrackPct != null ? `${stats.onTrackPct.toFixed(0)}%` : '—'}
              </p>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
```

- [ ] **Step 4: `NetWorthPanel.tsx`**:

```tsx
'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import Panel from '../Panel';
import { fmt } from '../chartTheme';
import type { NetWorthBreakdown } from '@/lib/dashboard/derive';

export default function NetWorthPanel({ data, loading }: { data: NetWorthBreakdown; loading: boolean }) {
  const tc = useThemeColors();
  const gross = data.assets + data.liabilities;
  return (
    <Panel title="Net Worth" subtitle="Current" loading={loading}>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold tabular-nums">{data.total < 0 ? '-' : ''}${fmt(Math.abs(data.total))}</p>
        {data.deltaPct != null && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
            style={{
              color: data.deltaPct >= 0 ? tc.green : tc.rose,
              background: `color-mix(in srgb, ${data.deltaPct >= 0 ? tc.green : tc.rose} 14%, transparent)`,
            }}>
            {data.deltaPct >= 0 ? '↑' : '↓'}{Math.abs(data.deltaPct).toFixed(1)}% ≈ vs last month
          </span>
        )}
      </div>
      {gross > 0 && (
        <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
          <div style={{ width: `${(data.assets / gross) * 100}%`, background: tc.green }} />
          <div style={{ width: `${(data.liabilities / gross) * 100}%`, background: tc.rose }} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {[{ label: 'Assets', total: data.assets, items: data.assetItems, color: tc.green },
          { label: 'Liabilities', total: data.liabilities, items: data.liabilityItems, color: tc.rose }].map((col) => (
          <div key={col.label} className="flex flex-col gap-1.5 min-w-0">
            <p className="text-[10px] font-semibold flex justify-between" style={{ color: 'var(--color-text-muted)' }}>
              {col.label} <span style={{ color: col.color }}>${fmt(col.total)}</span>
            </p>
            {col.items.slice(0, 4).map((it) => (
              <p key={it.label} className="flex justify-between gap-1">
                <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{it.label}</span>
                <span className="tabular-nums font-semibold shrink-0">${fmt(it.value)}</span>
              </p>
            ))}
            {col.items.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>None</p>}
          </div>
        ))}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 5: Typecheck; commit**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
git add apps/web/src/components/dashboard/panels
git commit -m "feat(dashboard): row-3 panels (fixed/variable, recurring stub, savings, net worth)"
```

---

### Task 12: Row-4 panels — ExpenseChange, TopMerchants, Subscriptions (empty)

**Files:**
- Create: `apps/web/src/components/dashboard/panels/ExpenseChangePanel.tsx`
- Create: `apps/web/src/components/dashboard/panels/TopMerchantsPanel.tsx`
- Create: `apps/web/src/components/dashboard/panels/SubscriptionsPanel.tsx`

**Interfaces:**
- Consumes: `ExpenseChange`, `MerchantSlice` from derive.
- Produces:
  - `<ExpenseChangePanel changes={ExpenseChange[]} unchanged={number} loading />`
  - `<TopMerchantsPanel merchants={MerchantSlice[]} loading />`
  - `<SubscriptionsPanel />` — static empty state, `colSpan=2` applied at the page level via a wrapper prop… **no**: `Panel` takes `colSpan`; `SubscriptionsPanel` passes `colSpan={2}` itself.

- [ ] **Step 1: `ExpenseChangePanel.tsx`** — diverging green/rose bars around a center axis:

```tsx
'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { ExpenseChange } from '@/lib/dashboard/derive';

export default function ExpenseChangePanel({ changes, unchanged, loading }: {
  changes: ExpenseChange[]; unchanged: number; loading: boolean;
}) {
  const tc = useThemeColors();
  const max = Math.max(1, ...changes.map((c) => Math.abs(c.delta)));
  return (
    <Panel title="Expense Change" subtitle="vs last month" loading={loading}>
      {changes.length === 0 ? <PanelEmpty message="Spending is steady — no meaningful category changes vs last month." /> : (
        <ul className="flex flex-col gap-2 text-xs">
          {changes.slice(0, 7).map((c) => {
            const up = c.delta > 0; // spent more = bad for expenses
            return (
              <li key={c.id} className="flex items-center gap-2">
                <span className="w-20 truncate shrink-0" style={{ color: 'var(--color-text-secondary)' }}>{c.name}</span>
                <div className="flex-1 h-2.5 flex">
                  <div className="w-1/2 flex justify-end">
                    {!up && <div className="h-full rounded-l-md" style={{ width: `${(Math.abs(c.delta) / max) * 100}%`, background: tc.green, opacity: 0.85 }} />}
                  </div>
                  <div className="w-px shrink-0" style={{ background: tc.border }} />
                  <div className="w-1/2">
                    {up && <div className="h-full rounded-r-md" style={{ width: `${(c.delta / max) * 100}%`, background: tc.rose, opacity: 0.85 }} />}
                  </div>
                </div>
                <span className="w-20 text-right tabular-nums font-semibold shrink-0" style={{ color: up ? tc.rose : tc.green }}>
                  {up ? '↑' : '↓'} ${fmt(Math.abs(c.delta))}{c.pct != null ? ` · ${Math.abs(c.pct).toFixed(0)}%` : ' · new'}
                </span>
              </li>
            );
          })}
          {unchanged > 0 && (
            <li className="text-[10px] pt-1" style={{ color: 'var(--color-text-muted)' }}>
              {unchanged} categor{unchanged === 1 ? 'y' : 'ies'} unchanged
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}
```

- [ ] **Step 2: `TopMerchantsPanel.tsx`** — one measure, one hue (violet), per mark spec:

```tsx
'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { MerchantSlice } from '@/lib/dashboard/derive';

export default function TopMerchantsPanel({ merchants, loading }: { merchants: MerchantSlice[]; loading: boolean }) {
  const tc = useThemeColors();
  const max = merchants[0]?.total || 1;
  return (
    <Panel title="Top Merchants" subtitle="This month" loading={loading}>
      {merchants.length === 0 ? <PanelEmpty message="No purchases recorded this month." /> : (
        <ul className="flex flex-col gap-2.5">
          {merchants.map((m) => (
            <li key={m.name} className="flex items-center gap-2 text-xs">
              <span className="w-24 truncate shrink-0" style={{ color: 'var(--color-text-secondary)' }}>{m.name}</span>
              <div className="flex-1 h-3 rounded-md overflow-hidden" style={{ background: 'color-mix(in srgb, currentColor 6%, transparent)' }}>
                <div className="h-full rounded-md" style={{ width: `${(m.total / max) * 100}%`, background: tc.violet, opacity: 0.85 }} />
              </div>
              <span className="font-semibold tabular-nums w-16 text-right">${fmt(m.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
```

- [ ] **Step 3: `SubscriptionsPanel.tsx`**:

```tsx
'use client';

import Panel, { PanelEmpty } from '../Panel';

export default function SubscriptionsPanel() {
  return (
    <Panel title="Subscriptions" subtitle="Overview" colSpan={2}>
      <PanelEmpty message="Subscription tracking is coming soon. Once recurring detection lands, cofre will total your subscriptions, count active services, and flag price increases here." />
    </Panel>
  );
}
```

- [ ] **Step 4: Typecheck; commit**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
git add apps/web/src/components/dashboard/panels
git commit -m "feat(dashboard): row-4 panels (expense change, merchants, subscriptions stub)"
```

---

### Task 13: Row-5 panels — extract Projects, Accounts, RecentTransactions from page.tsx

**Files:**
- Create: `apps/web/src/components/dashboard/panels/ProjectsPanel.tsx`
- Create: `apps/web/src/components/dashboard/panels/AccountsPanel.tsx`
- Create: `apps/web/src/components/dashboard/panels/RecentTransactionsPanel.tsx`
- Reference (do not modify yet): `apps/web/src/app/dashboard/page.tsx` — sections at `card-title` markers "Projects" (~line 725), "Accounts" (~line 617), "Recent Transactions" (~line 567). Line numbers will have drifted; locate by title string.

**Interfaces:**
- Consumes: `Project`, `BankAccount`, `Transaction` types; `BankLogo` (currently a local component in `page.tsx` — move it into `AccountsPanel.tsx`); existing helpers `fmt`, `formatDate` (reimplement locally or import from `chartTheme`).
- Produces:
  - `<ProjectsPanel projects={Project[]} loading />` (`colSpan={2}` internally)
  - `<AccountsPanel accounts={BankAccount[]} loading />`
  - `<RecentTransactionsPanel transactions={Transaction[]} loading />` (shows latest 8, exactly as today)

This is a **move, not a rewrite**: copy each section's JSX out of `page.tsx` verbatim into its panel file, replace the outer `<div style={glass}>` wrapper with `<Panel title=… colSpan=…>`, convert page-scope variables (`activeProjects`, `totalInvested`, `totalNetGain`, `recent`) into derivations computed inside the panel from its props, and keep all styling. The `BankLogo` component and the `BANKS` import move into `AccountsPanel.tsx`. Any `Link` imports come along.

- [ ] **Step 1: Create `ProjectsPanel.tsx`** — move the Projects section. Inside the component compute (copied from page):

```ts
const activeProjects = projects.filter((p) => p.status !== 'sold');
const totalInvested = projects.reduce((s, p) => s + Number(p.costBasis || 0), 0);
const totalNetGain = projects.filter((p) => p.netGain != null).reduce((s, p) => s + Number(p.netGain), 0);
```

Empty state: `<PanelEmpty message="No projects yet. Track flips, rentals, or side ventures from the Projects page." />`.

- [ ] **Step 2: Create `AccountsPanel.tsx`** — move the Accounts section + `BankLogo` + `BANKS` import. Empty state: `<PanelEmpty message="Connect or add a bank account to see balances here." />`.

- [ ] **Step 3: Create `RecentTransactionsPanel.tsx`** — move the Recent Transactions section; compute `const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);` from props. Empty state: `<PanelEmpty message="No transactions this month yet." />`.

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit -p apps/web/tsconfig.json`. The old sections still exist in `page.tsx` (removed next task); unused-variable warnings are acceptable this one commit, type errors are not.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/panels
git commit -m "refactor(dashboard): extract projects, accounts, and recent-transactions panels"
```

---

### Task 14: Recompose `page.tsx` as the 18-panel grid

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx` (rewrite: ~786 lines → ~200)

**Interfaces:**
- Consumes: everything above. Keep: the topbar greeting/summary block and the 4 stat cards (lines ~254-334 today) **unchanged**, including their derivations (`net`, `income`, `expenses`, `prevInc`, `prevExp`, deltas, `healthLine`, `attentionLine`). These now read from `useDashboardData()` values.
- Produces: final dashboard page.

- [ ] **Step 1: Rewrite the page**

Structure (complete skeleton — port the existing topbar + stat-card JSX into the marked slots verbatim):

```tsx
'use client';

import { useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import { useUser } from '@/components/UserProvider';
import { useDashboardData } from '@/hooks/useDashboardData';
import {
  monthlyCashFlow, trendSeries, categoryTotals, foldOther, txInMonth,
  calendarDays, spendingPace, fixedVariable, savingsSeries, netWorthBreakdown,
  expenseChanges, topMerchants,
} from '@/lib/dashboard/derive';
import IncomeExpensesPanel from '@/components/dashboard/panels/IncomeExpensesPanel';
import CashFlowTrendPanel from '@/components/dashboard/panels/CashFlowTrendPanel';
import CategoryDonutPanel from '@/components/dashboard/panels/CategoryDonutPanel';
import CategoryRankingPanel from '@/components/dashboard/panels/CategoryRankingPanel';
import BudgetActualPanel from '@/components/dashboard/panels/BudgetActualPanel';
import SpendingCalendarPanel from '@/components/dashboard/panels/SpendingCalendarPanel';
import SpendingPacePanel from '@/components/dashboard/panels/SpendingPacePanel';
import FixedVariablePanel from '@/components/dashboard/panels/FixedVariablePanel';
import RecurringTimelinePanel from '@/components/dashboard/panels/RecurringTimelinePanel';
import SavingsGrowthPanel from '@/components/dashboard/panels/SavingsGrowthPanel';
import NetWorthPanel from '@/components/dashboard/panels/NetWorthPanel';
import ExpenseChangePanel from '@/components/dashboard/panels/ExpenseChangePanel';
import TopMerchantsPanel from '@/components/dashboard/panels/TopMerchantsPanel';
import SubscriptionsPanel from '@/components/dashboard/panels/SubscriptionsPanel';
import ProjectsPanel from '@/components/dashboard/panels/ProjectsPanel';
import AccountsPanel from '@/components/dashboard/panels/AccountsPanel';
import RecentTransactionsPanel from '@/components/dashboard/panels/RecentTransactionsPanel';

export default function DashboardPage() {
  const { month, setMonth, transactions, yearTx, accounts, budgets, projects, debts, loading } = useDashboardData();
  const { user, refetch } = useUser();
  const now = new Date();

  const d = useMemo(() => {
    const monthTx = txInMonth(yearTx, month);
    const goal = user?.savingsGoal != null ? Number(user.savingsGoal) : null;
    const expenseSlices = categoryTotals(monthTx, 'expense');
    return {
      cashFlow: monthlyCashFlow(yearTx, now),
      trend: trendSeries(yearTx, now),
      expenseDonut: foldOther(expenseSlices, 7),
      expenseTotal: expenseSlices.reduce((s, x) => s + x.value, 0),
      ranking: expenseSlices.slice(0, 7),
      incomeSlices: foldOther(categoryTotals(yearTx, 'income'), 6),
      incomeTotal: categoryTotals(yearTx, 'income').reduce((s, x) => s + x.value, 0),
      calendar: calendarDays(yearTx, month),
      pace: spendingPace(budgets, yearTx, month, now),
      fixedVar: fixedVariable(yearTx, month),
      savings: savingsSeries(yearTx, now, goal),
      netWorth: netWorthBreakdown(accounts, debts, yearTx, month),
      changes: expenseChanges(yearTx, month),
      merchants: topMerchants(monthTx),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearTx, month, budgets, accounts, debts, user?.savingsGoal]);

  /* … existing stat-card derivations (net, income, expenses, deltas, healthLine, attentionLine) — ported verbatim … */

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="px-6 md:px-8 py-6 flex flex-col gap-4 max-w-[1800px]">
          {/* … existing topbar + month picker + 4 stat cards, ported verbatim … */}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <IncomeExpensesPanel data={d.cashFlow} loading={loading} />
            <CashFlowTrendPanel data={d.trend} loading={loading} />
            <CategoryDonutPanel title="Expenses by Category" subtitle="This month"
              slices={d.expenseDonut} total={d.expenseTotal} loading={loading} />
            <CategoryRankingPanel slices={d.ranking} loading={loading} />

            <BudgetActualPanel budgets={budgets} loading={loading} />
            <SpendingCalendarPanel cells={d.calendar} monthLabel={monthLabel(month)} loading={loading} />
            <SpendingPacePanel pace={d.pace} loading={loading} />
            <CategoryDonutPanel title="Income Sources" subtitle="Year to date"
              slices={d.incomeSlices} total={d.incomeTotal} loading={loading} />

            <FixedVariablePanel split={d.fixedVar} loading={loading} />
            <RecurringTimelinePanel />
            <SavingsGrowthPanel stats={d.savings} loading={loading} onGoalSaved={refetch} />
            <NetWorthPanel data={d.netWorth} loading={loading} />

            <ExpenseChangePanel changes={d.changes.changes} unchanged={d.changes.unchanged} loading={loading} />
            <TopMerchantsPanel merchants={d.merchants} loading={loading} />
            <SubscriptionsPanel />

            <ProjectsPanel projects={projects} loading={loading} />
            <AccountsPanel accounts={accounts} loading={loading} />
            <RecentTransactionsPanel transactions={transactions} loading={loading} />
          </div>
        </div>
      </main>
    </div>
  );
}
```

Keep local helpers the topbar needs (`monthLabel`, `monthShort`, `greeting`, `fmt`, `prevMonth`, `nextMonth`, `TrendBadge`, `StatIcon`, icon constants) — either in the page or moved to a small `apps/web/src/components/dashboard/topbar.tsx`; implementer's choice, but the stat-card block must render identically to today.

Delete: the old inline chart/donut/daily-spending/budget/projects/accounts/recent-transactions JSX, the local `Transaction/Category/...` interfaces (import from `@/lib/dashboard/types`), the local fetch logic (now in the hook), and now-unused recharts imports.

**Budget note:** the old page filtered `budgets` to `spendingBudgets` (excluding income-type budgets) before health calculations. `BudgetActualPanel` receives the RAW list — replicate the page's exact `spendingBudgets` filter in the page and pass THAT to the panel, so income targets don't appear as expense rows (this repo has a bug history here — see commits around `ef03716`).

- [ ] **Step 2: Full verification**

```bash
npm run test:dashboard                          # all derive tests pass
npx tsc --noEmit -p apps/web/tsconfig.json      # only the 3 pre-existing errors
npm run build:web                                # production build succeeds
```

- [ ] **Step 3: Visual check**

With `npm run dev:web` + API running, the user (or gstack with the user logged in) loads `/dashboard`: all 18 panels render; empty-data panels show their empty states; no horizontal overflow at 1440px, 1024px, 390px widths; month picker still switches months.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(dashboard): recompose page as 18-panel grid"
```

---

### Task 15: Final verification & cleanup

**Files:**
- None new. Possibly touch any file with review findings.

- [ ] **Step 1: Run everything**

```bash
npm run test:dashboard
npx tsc --noEmit -p apps/web/tsconfig.json
npm run build:web
npx nx build api
```

All pass (modulo the 3 pre-existing tsc errors).

- [ ] **Step 2: Dead-code sweep**

Confirm `page.tsx` no longer imports recharts directly; `grep -n "ComposedChart\|PieChart\|AreaChart" apps/web/src/app/dashboard/page.tsx` returns nothing. Confirm no orphaned helpers remain.

- [ ] **Step 3: Visual QA against the dataviz checklist**

Screenshot the dashboard (user-assisted login or gstack): check label collisions, legend presence on every ≥2-series chart, single axis everywhere, per-category colors stable between donut and ranking, calendar ramp readable, dark-surface contrast.

- [ ] **Step 4: Deploy note**

After the next deploy, verify on the hosted DB (Supabase — different from repo `.env`): `categories.isFixed` and `users.savingsGoal` columns exist (`synchronize: true` adds them on boot) and the dashboard loads.

- [ ] **Step 5: Final commit & push (with user's go-ahead)**

```bash
git push origin dev
```

---

## Self-Review (completed at plan-writing time)

- **Spec coverage:** All 18 panels have tasks (1↔Task 9, 2↔9, 3↔9, 4↔9, 5↔10, 6↔10, 7↔10, 8↔10+14, 9↔11, 10↔11 stub, 11↔11, 12↔11, 13↔12, 14↔12, 15↔12 stub, 16-18↔13); backend columns Tasks 1-2; vitest Task 3; deploy check Task 15. Chart rules embedded in Global Constraints + per-panel code.
- **Type consistency:** `CashFlowMonth`, `TrendPoint`, `CategorySlice`, `MerchantSlice`, `ExpenseChange`, `CalendarCell`, `PaceStats`, `FixedVariableSplit`, `SavingsStats`/`SavingsPoint`, `NetWorthBreakdown`/`NetWorthItem` defined once in derive tasks and imported by name in panel tasks. `savingsGoal` is `string | null` on the API (decimal) and normalized to `number | null` at the page boundary.
- **Known judgment points for the implementer:** (a) Task 7 net-worth math must be verified against the live page before locking the test; (b) Task 13 is a JSX move — fidelity over creativity; (c) Task 14 must pass `spendingBudgets` (filtered), not raw budgets, to `BudgetActualPanel`.
