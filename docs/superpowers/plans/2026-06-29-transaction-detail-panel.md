# Transaction Detail & Insights Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the budget sidebar on the Transactions page with a dual-mode Insights panel — idle shows a recurring-charges digest, clicking a transaction row shows full detail + subscription tracking.

**Architecture:** Three pieces working together — a small utility module for recurring detection (pure functions), a self-contained `InsightsPanel` React component, and targeted wiring changes to `page.tsx` (new state, click handler, sidebar swap). One new API endpoint (`PATCH /transactions/:id/note`) unlocks note editing for all transaction sources.

**Tech Stack:** Next.js 16 / React 19, Tailwind v4, NestJS 11, TypeORM, localStorage for subscription store.

## Global Constraints

- Glassmorphism surfaces: `rgba(35,35,47,0.5)` + `backdropFilter: blur()` — never solid backgrounds on cards
- Accent colors from `globals.css`: `--color-card-violet`, `--color-green`, `--color-rose`, `--color-amber`
- All inline styles use CSS variables (`var(--color-*)`) — no raw hex values except where a transaction/category carries its own `color` field
- `NEXT_PUBLIC_API_URL` defaults to `http://localhost:3333/api`
- No test runner configured — use manual browser verification steps instead of automated tests
- Responsive: right panel hidden on mobile (`hidden md:flex`); mobile users get a bottom-sheet portal when a transaction is selected

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/transactions/transactions.service.ts` | Modify | Add `updateNote()` method |
| `apps/api/src/transactions/transactions.controller.ts` | Modify | Add `PATCH :id/note` endpoint |
| `apps/web/src/app/transactions/recurring.ts` | Create | `normalize()`, `RecurringInfo` type, `buildRecurringMap()` |
| `apps/web/src/app/transactions/InsightsPanel.tsx` | Create | `InsightsPanel`, `DigestView`, `TransactionDetailView`, `SubscriptionControls`, exported types |
| `apps/web/src/app/transactions/page.tsx` | Modify | New state, useMemo, click handler, sidebar swap, remove budget API calls |

---

## Task 1: Add `PATCH /transactions/:id/note` API endpoint

**Files:**
- Modify: `apps/api/src/transactions/transactions.service.ts`
- Modify: `apps/api/src/transactions/transactions.controller.ts`

**Interfaces:**
- Produces: `PATCH /api/transactions/:id/note` — accepts `{ note: string | null }`, works for any transaction source (CSV or manual), returns `{ id, note }`

---

- [ ] **Step 1: Add `updateNote` to the service**

Open `apps/api/src/transactions/transactions.service.ts`. Add this method after `updateManual` (around line 281):

```ts
async updateNote(id: string, userId: string, note: string | null): Promise<{ id: string; note: string | null }> {
  const tx = await this.repo.findOneBy({ id, userId });
  if (!tx) throw new NotFoundException();
  tx.note = note;
  await this.repo.save(tx);
  return { id, note };
}
```

- [ ] **Step 2: Add the controller endpoint**

Open `apps/api/src/transactions/transactions.controller.ts`. After the existing `@Patch(':id/debt')` block, add:

```ts
@Patch(':id/note')
updateNote(
  @Param('id') id: string,
  @Request() req: any,
  @Body() body: { note?: string | null },
) {
  return this.service.updateNote(id, req.user.id, body.note ?? null);
}
```

- [ ] **Step 3: Build and smoke-test the API**

```bash
npm run build:api
node dist/apps/api/main.js
```

Then in a new terminal:
```bash
# Replace TX_ID with any real transaction id from your DB
curl -s -X PATCH http://localhost:3333/api/transactions/TX_ID/note \
  -H "Content-Type: application/json" \
  -b "access_token=YOUR_TOKEN" \
  -d '{"note":"test note"}' | jq .
```

Expected: `{ "id": "...", "note": "test note" }`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/transactions/transactions.service.ts \
        apps/api/src/transactions/transactions.controller.ts
git commit -m "feat(api): add PATCH /transactions/:id/note for all transaction sources"
```

---

## Task 2: Recurring detection utilities

**Files:**
- Create: `apps/web/src/app/transactions/recurring.ts`

**Interfaces:**
- Produces:
  - `normalize(name: string): string`
  - `RecurringInfo` interface
  - `buildRecurringMap(transactions: TxSlice[]): Map<string, RecurringInfo>`

---

- [ ] **Step 1: Create the file**

Create `apps/web/src/app/transactions/recurring.ts` with this content:

```ts
export interface RecurringInfo {
  normalized: string;
  displayName: string;
  occurrences: { date: string; month: string; amount: number }[];
  medianAmount: number;
  frequency: 'weekly' | 'monthly' | 'irregular';
}

export interface TxSlice {
  name: string;
  amount: number | string;
  date: string;
}

export function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+conf#\S+/gi, '')           // strip confirmation codes
    .replace(/\s+\d{4,}\S*/g, '')           // strip long numeric codes
    .replace(/\s+[a-z]{2}$/i, '')           // strip trailing state abbrev
    .replace(/[^a-z0-9\s]/g, '')            // strip special characters
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildRecurringMap(transactions: TxSlice[]): Map<string, RecurringInfo> {
  const groups = new Map<string, { raw: string; amounts: number[]; dates: string[] }>();

  for (const tx of transactions) {
    const key = normalize(tx.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { raw: tx.name, amounts: [], dates: [] });
    const g = groups.get(key)!;
    g.amounts.push(Math.abs(Number(tx.amount)));
    g.dates.push(tx.date);
  }

  const result = new Map<string, RecurringInfo>();

  for (const [key, g] of groups) {
    const months = new Set(g.dates.map((d) => d.slice(0, 7)));
    if (months.size < 2) continue;

    const sorted = [...g.dates].sort();
    const intervals = sorted.slice(1).map((d, i) => {
      const diff = new Date(d).getTime() - new Date(sorted[i]).getTime();
      return diff / (1000 * 60 * 60 * 24);
    });
    const avg = intervals.length > 0 ? intervals.reduce((a, b) => a + b) / intervals.length : 30;
    const frequency: RecurringInfo['frequency'] =
      avg <= 10 ? 'weekly' : avg <= 35 ? 'monthly' : 'irregular';

    const sortedAmts = [...g.amounts].sort((a, b) => a - b);
    const medianAmount = sortedAmts[Math.floor(sortedAmts.length / 2)];

    const occurrences = g.dates
      .map((date, i) => ({ date, month: date.slice(0, 7), amount: g.amounts[i] }))
      .sort((a, b) => b.date.localeCompare(a.date));

    result.set(key, {
      normalized: key,
      displayName: g.raw,
      occurrences,
      medianAmount,
      frequency,
    });
  }

  return result;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx nx build web 2>&1 | tail -6
```

Expected: `Successfully ran target build for project web`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/transactions/recurring.ts
git commit -m "feat(web): add recurring transaction detection utilities"
```

---

## Task 3: InsightsPanel component

**Files:**
- Create: `apps/web/src/app/transactions/InsightsPanel.tsx`

**Interfaces:**
- Consumes:
  - `RecurringInfo`, `normalize` from `./recurring`
  - `NEXT_PUBLIC_API_URL` env var
- Produces (exported):
  - `SubStatus = 'active' | 'to-cancel' | 'cancelled'`
  - `SubscriptionStore = Record<string, { note: string; status: SubStatus }>`
  - `InsightsPanel` component with props below
- `InsightsPanel` props:
  ```ts
  {
    selectedTx: Transaction | null;
    onClose: () => void;
    transactions: Transaction[];
    recurringMap: Map<string, RecurringInfo>;
    subscriptions: SubscriptionStore;
    onSubscriptionChange: (next: SubscriptionStore) => void;
    onNoteUpdate: (txId: string, note: string | null) => void;
  }
  ```
- `Transaction` type used internally (must match page.tsx's Transaction interface exactly):
  ```ts
  interface Transaction {
    id: string; name: string; amount: number; date: string; source: string;
    categoryId: string | null;
    categoryRef: { id: string; name: string; icon: string; color: string; type: string } | null;
    bankAccountId: string;
    bankAccount: { id: string; bankName: string; accountName: string; accountType: string; color: string } | null;
    note: string | null;
  }
  ```

---

- [ ] **Step 1: Create the file**

Create `apps/web/src/app/transactions/InsightsPanel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { RecurringInfo, normalize } from './recurring';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Category { id: string; name: string; icon: string; color: string; type: string }
interface BankAccount { id: string; bankName: string; accountName: string; accountType: string; color: string }
interface Transaction {
  id: string; name: string; amount: number; date: string; source: string;
  categoryId: string | null; categoryRef: Category | null;
  bankAccountId: string; bankAccount: BankAccount | null;
  note: string | null;
}

export type SubStatus = 'active' | 'to-cancel' | 'cancelled';
export type SubscriptionStore = Record<string, { note: string; status: SubStatus }>;

interface InsightsPanelProps {
  selectedTx: Transaction | null;
  onClose: () => void;
  transactions: Transaction[];
  recurringMap: Map<string, RecurringInfo>;
  subscriptions: SubscriptionStore;
  onSubscriptionChange: (next: SubscriptionStore) => void;
  onNoteUpdate: (txId: string, note: string | null) => void;
}

export function InsightsPanel({
  selectedTx, onClose, transactions, recurringMap,
  subscriptions, onSubscriptionChange, onNoteUpdate,
}: InsightsPanelProps) {
  return (
    <>
      {/* Header */}
      <div className="px-4 py-4 border-b shrink-0 flex items-center justify-between gap-2"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)' }}>
        <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>
          Insights
        </p>
        {selectedTx && (
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)' }}>
            <XIcon />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {selectedTx ? (
          <TransactionDetailView
            tx={selectedTx}
            recurringMap={recurringMap}
            subscriptions={subscriptions}
            onSubscriptionChange={onSubscriptionChange}
            onNoteUpdate={onNoteUpdate}
          />
        ) : (
          <DigestView
            transactions={transactions}
            recurringMap={recurringMap}
            subscriptions={subscriptions}
            onSubscriptionChange={onSubscriptionChange}
          />
        )}
      </div>
    </>
  );
}

/* ── Digest View (idle) ─────────────────────────────────────── */

function DigestView({ transactions, recurringMap, subscriptions, onSubscriptionChange }: {
  transactions: Transaction[];
  recurringMap: Map<string, RecurringInfo>;
  subscriptions: SubscriptionStore;
  onSubscriptionChange: (next: SubscriptionStore) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const currentMonth = transactions.length > 0
    ? transactions.reduce((max, t) => (t.date > max ? t.date : max), '').slice(0, 7)
    : new Date().toISOString().slice(0, 7);

  const recurringThisMonth = [...recurringMap.values()]
    .filter((r) => r.occurrences.some((o) => o.month === currentMonth))
    .sort((a, b) => b.medianAmount - a.medianAmount);

  const visible = showAll ? recurringThisMonth : recurringThisMonth.slice(0, 8);
  const hiddenCount = recurringThisMonth.length - 8;
  const toCancelList = Object.entries(subscriptions).filter(([, v]) => v.status === 'to-cancel');
  const totalRecurring = recurringThisMonth.reduce((sum, r) => sum + r.medianAmount, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Recurring this month */}
      <div>
        <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: 'var(--color-text-muted)' }}>
          Recurring this month
        </p>
        {recurringThisMonth.length === 0 ? (
          <p className="text-xs text-center py-8 opacity-40" style={{ color: 'var(--color-text-muted)' }}>
            No recurring charges detected yet
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {visible.map((r) => {
              const sub = subscriptions[r.normalized];
              const isExpanded = expandedKey === r.normalized;
              return (
                <div key={r.normalized} className="rounded-xl overflow-hidden"
                  style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                  <button
                    onClick={() => setExpandedKey(isExpanded ? null : r.normalized)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:brightness-110 transition-all">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{r.displayName}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        {r.frequency === 'weekly' ? 'Weekly' : r.frequency === 'monthly' ? 'Monthly' : 'Irregular'}
                        {' · '}avg ${r.medianAmount.toFixed(2)}
                      </p>
                    </div>
                    {sub && sub.status !== 'cancelled' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                        style={sub.status === 'to-cancel'
                          ? { background: 'color-mix(in srgb, var(--color-rose) 15%, transparent)', color: 'var(--color-rose)' }
                          : { background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }}>
                        {sub.status === 'to-cancel' ? 'To cancel' : 'Tracked'}
                      </span>
                    )}
                  </button>
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--color-border)' }}>
                      <SubscriptionControls
                        merchantKey={r.normalized}
                        sub={sub}
                        subscriptions={subscriptions}
                        onSubscriptionChange={onSubscriptionChange}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {!showAll && hiddenCount > 0 && (
              <button onClick={() => setShowAll(true)}
                className="text-xs text-center py-2 hover:underline"
                style={{ color: 'var(--color-text-muted)' }}>
                Show {hiddenCount} more
              </button>
            )}
          </div>
        )}
      </div>

      {/* To Cancel */}
      {toCancelList.length > 0 && (
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: 'var(--color-rose)' }}>
            To Cancel
          </p>
          <div className="flex flex-col gap-1.5">
            {toCancelList.map(([key, sub]) => (
              <div key={key} className="rounded-xl px-3 py-2.5 flex items-start gap-2"
                style={{ background: 'color-mix(in srgb, var(--color-rose) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 18%, transparent)' }}>
                <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: 'var(--color-rose)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{key}</p>
                  {sub.note && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{sub.note}</p>
                  )}
                </div>
                <button
                  onClick={() => onSubscriptionChange({ ...subscriptions, [key]: { ...sub, status: 'cancelled' } })}
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0 hover:brightness-110 transition-all"
                  style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 25%, transparent)' }}>
                  Done
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly total */}
      {totalRecurring > 0 && (
        <div className="rounded-xl px-3 py-2.5 text-center"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            ↻ <span className="font-bold">${totalRecurring.toFixed(2)}</span>/mo in recurring charges
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Transaction Detail View ────────────────────────────────── */

function TransactionDetailView({ tx, recurringMap, subscriptions, onSubscriptionChange, onNoteUpdate }: {
  tx: Transaction;
  recurringMap: Map<string, RecurringInfo>;
  subscriptions: SubscriptionStore;
  onSubscriptionChange: (next: SubscriptionStore) => void;
  onNoteUpdate: (txId: string, note: string | null) => void;
}) {
  const amount = Number(tx.amount);
  const isIncome = amount >= 0;
  const key = normalize(tx.name);
  const recInfo = recurringMap.get(key);
  const sub = subscriptions[key];
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(tx.note ?? '');

  async function saveNote() {
    setEditingNote(false);
    const trimmed = noteValue.trim() || null;
    if (trimmed === (tx.note ?? null)) return;
    try {
      await fetch(`${API}/transactions/${tx.id}/note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ note: trimmed }),
      });
      onNoteUpdate(tx.id, trimmed);
    } catch {
      // silently ignore — note will revert on next refresh
    }
  }

  const last4 = recInfo?.occurrences.slice(0, 4) ?? [];

  return (
    <div className="flex flex-col gap-3">
      {/* Header card */}
      <div className="rounded-xl p-3"
        style={{ background: 'rgba(35,35,47,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid var(--color-border)' }}>
        <p className="text-sm font-semibold truncate">{tx.name}</p>
        <p className="text-2xl font-bold tabular-nums mt-1"
          style={{ color: isIncome ? 'var(--color-green)' : 'var(--color-rose)' }}>
          {isIncome ? '+' : '-'}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {new Date(tx.date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
          })}
        </p>
        {tx.categoryRef && (
          <span className="inline-flex items-center gap-1.5 mt-2 px-2 py-1 rounded-lg text-[11px] font-semibold"
            style={{ background: `${tx.categoryRef.color}18`, color: tx.categoryRef.color }}>
            <span>{tx.categoryRef.icon}</span>
            <span>{tx.categoryRef.name}</span>
          </span>
        )}
      </div>

      {/* Details pills */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[10px] px-2 py-1 rounded-lg font-medium"
          style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>
          {tx.bankAccount?.accountName ?? 'Unknown account'}
        </span>
        <span className="text-[10px] px-2 py-1 rounded-lg font-medium uppercase"
          style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)' }}>
          {tx.source}
        </span>
        {editingNote ? (
          <textarea
            autoFocus
            className="w-full text-[11px] rounded-lg px-2 py-1.5 resize-none outline-none mt-0.5"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-primary)', color: 'var(--color-text-primary)', minHeight: '60px' }}
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            onBlur={saveNote}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveNote(); } }}
            placeholder="Add note…"
          />
        ) : (
          <button onClick={() => setEditingNote(true)}
            className="text-[10px] px-2 py-1 rounded-lg font-medium transition-colors hover:brightness-125"
            style={{ background: 'var(--color-elevated)', color: tx.note ? 'var(--color-text-secondary)' : 'color-mix(in srgb, var(--color-text-muted) 60%, transparent)' }}>
            {tx.note || '+ Add note'}
          </button>
        )}
      </div>

      {/* Recurring history */}
      <div className="rounded-xl p-3"
        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
        <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: 'var(--color-text-muted)' }}>
          History
        </p>
        {recInfo ? (
          <>
            <div className="flex flex-col gap-2 mb-2">
              {last4.map((o) => {
                const isCurrent = o.date === tx.date;
                return (
                  <div key={o.date} className="flex items-center justify-between">
                    <span className="text-[11px] flex items-center gap-1.5"
                      style={{ color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                      {new Date(o.month + '-01').toLocaleString('default', { month: 'short', year: 'numeric' })}
                      {isCurrent && (
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                          style={{ background: 'var(--color-primary)', color: 'white' }}>
                          now
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] tabular-nums font-semibold"
                      style={{ color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                      ${o.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              {recInfo.frequency === 'weekly' ? 'Weekly' : recInfo.frequency === 'monthly' ? 'Monthly' : 'Irregular'}
              {' · '}avg ${recInfo.medianAmount.toFixed(2)}
            </p>
          </>
        ) : (
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            First time we&apos;ve seen this merchant.
          </p>
        )}
      </div>

      {/* Subscription controls */}
      <div className="rounded-xl overflow-hidden"
        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
        <p className="text-[10px] font-bold tracking-widest uppercase px-3 pt-3 pb-2" style={{ color: 'var(--color-text-muted)' }}>
          Subscription
        </p>
        <SubscriptionControls
          merchantKey={key}
          sub={sub}
          subscriptions={subscriptions}
          onSubscriptionChange={onSubscriptionChange}
        />
      </div>
    </div>
  );
}

/* ── Subscription Controls ──────────────────────────────────── */

function SubscriptionControls({ merchantKey, sub, subscriptions, onSubscriptionChange }: {
  merchantKey: string;
  sub: { note: string; status: SubStatus } | undefined;
  subscriptions: SubscriptionStore;
  onSubscriptionChange: (next: SubscriptionStore) => void;
}) {
  const [noteValue, setNoteValue] = useState(sub?.note ?? '');

  function update(patch: Partial<{ note: string; status: SubStatus }>) {
    onSubscriptionChange({
      ...subscriptions,
      [merchantKey]: { note: noteValue, status: 'active', ...sub, ...patch },
    });
  }

  if (!sub || sub.status === 'cancelled') {
    return (
      <div className="px-3 pb-3">
        {sub?.status === 'cancelled' && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mb-2 inline-block"
            style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
            Cancelled
          </span>
        )}
        <button
          onClick={() => update({ status: 'active', note: '' })}
          className="w-full py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
          style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)' }}>
          {sub?.status === 'cancelled' ? 'Track again' : 'Track as subscription'}
        </button>
      </div>
    );
  }

  if (sub.status === 'active') {
    return (
      <div className="px-3 pb-3 flex flex-col gap-2">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded w-fit"
          style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }}>
          Tracked
        </span>
        <textarea
          className="w-full text-[11px] rounded-lg px-2 py-1.5 resize-none outline-none"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', minHeight: '52px' }}
          placeholder="Cancel instructions (e.g. cancel at netflix.com/account)…"
          value={noteValue}
          onChange={(e) => setNoteValue(e.target.value)}
          onBlur={() => update({ note: noteValue })}
        />
        <button
          onClick={() => update({ status: 'to-cancel', note: noteValue })}
          className="w-full py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
          style={{ background: 'color-mix(in srgb, var(--color-rose) 15%, transparent)', color: 'var(--color-rose)', border: '1px solid color-mix(in srgb, var(--color-rose) 25%, transparent)' }}>
          Mark to cancel
        </button>
      </div>
    );
  }

  /* to-cancel */
  return (
    <div className="px-3 pb-3 flex flex-col gap-2">
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded w-fit"
        style={{ background: 'color-mix(in srgb, var(--color-rose) 15%, transparent)', color: 'var(--color-rose)' }}>
        Marked to cancel
      </span>
      {sub.note && (
        <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{sub.note}</p>
      )}
      <button
        onClick={() => update({ status: 'cancelled' })}
        className="w-full py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
        style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 25%, transparent)' }}>
        Done — cancelled ✓
      </button>
    </div>
  );
}

/* ── Icon ───────────────────────────────────────────────────── */

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx nx build web 2>&1 | tail -6
```

Expected: `Successfully ran target build for project web`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/transactions/InsightsPanel.tsx
git commit -m "feat(web): add InsightsPanel component with digest and detail views"
```

---

## Task 4: Wire InsightsPanel into transactions/page.tsx

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx`

**Interfaces:**
- Consumes: `InsightsPanel`, `SubscriptionStore`, `SubStatus` from `./InsightsPanel`; `buildRecurringMap` from `./recurring`

---

- [ ] **Step 1: Add imports at the top of page.tsx**

In `apps/web/src/app/transactions/page.tsx`, find the existing import block (lines 1–12) and add these two new imports after the existing ones:

```ts
import { InsightsPanel, SubscriptionStore } from './InsightsPanel';
import { buildRecurringMap } from './recurring';
```

- [ ] **Step 2: Add new state variables**

Find the block of `useState` declarations (around line 82–135). After the `const [splitTx, setSplitTx] = ...` line, add:

```ts
const [selectedTx, setSelectedTx]       = useState<Transaction | null>(null);
const [subscriptions, setSubscriptions] = useState<SubscriptionStore>({});
```

- [ ] **Step 3: Load subscriptions from localStorage and add recurringMap memo**

Find the existing `useEffect` that reads from localStorage (around line 147–151):

```ts
useEffect(() => {
  const saved = localStorage.getItem('budgetWidth');
  if (saved) setBudgetWidth(Number(saved));
  setShowNotifications(localStorage.getItem('showNotifications') !== 'false');
}, []);
```

Replace it with:

```ts
useEffect(() => {
  const saved = localStorage.getItem('budgetWidth');
  if (saved) setBudgetWidth(Number(saved));
  setShowNotifications(localStorage.getItem('showNotifications') !== 'false');
  try {
    const subs = localStorage.getItem('cofre:subscriptions');
    if (subs) setSubscriptions(JSON.parse(subs));
  } catch { /* ignore malformed data */ }
}, []);
```

Then, after the existing `useMemo` / computed values block (around line 570 where `isTransfer`, `openDebts`, etc. are defined), add:

```ts
const recurringMap = useMemo(() => buildRecurringMap(transactions), [transactions]);
```

- [ ] **Step 4: Add subscription change handler and note update handler**

After the `recurringMap` line, add these two handlers:

```ts
function handleSubscriptionChange(next: SubscriptionStore) {
  setSubscriptions(next);
  localStorage.setItem('cofre:subscriptions', JSON.stringify(next));
}

function handleNoteUpdate(txId: string, note: string | null) {
  setTransactions((ts) => ts.map((t) => t.id === txId ? { ...t, note } : t));
  setSelectedTx((prev) => prev?.id === txId ? { ...prev, note } : prev);
}
```

- [ ] **Step 5: Add click handler to transaction rows**

Find the transaction row `<div>` at around line 1186:

```tsx
<div key={tx.id} className="relative group"
  style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : {}}>
```

Add an `onClick` prop that ignores clicks on interactive child elements:

```tsx
<div key={tx.id} className="relative group"
  style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : {}}
  onClick={(e) => {
    if ((e.target as HTMLElement).closest('button,input,textarea,select,[role="button"]')) return;
    setSelectedTx((prev) => prev?.id === tx.id ? null : tx);
  }}>
```

Also add a highlight ring when the row is selected. Change the existing `style` to merge in a selection indicator:

```tsx
<div key={tx.id} className="relative group cursor-pointer"
  style={{
    ...(i > 0 ? { borderTop: '1px solid var(--color-border)' } : {}),
    ...(selectedTx?.id === tx.id ? { background: 'color-mix(in srgb, var(--color-primary) 6%, transparent)' } : {}),
  }}
  onClick={(e) => {
    if ((e.target as HTMLElement).closest('button,input,textarea,select,[role="button"]')) return;
    setSelectedTx((prev) => prev?.id === tx.id ? null : tx);
  }}>
```

- [ ] **Step 6: Remove budget-related state and API calls**

Remove the following lines (they will no longer be used):

1. Around line 200–202 — remove `budgetMonth`, `budgets`, `budgetsLoading`:
   ```ts
   // DELETE these lines:
   const budgetMonth = rangeMode === 'month' ? month : (from ? from.slice(0, 7) : currentMonth());
   const [budgets, setBudgets]             = useState<Budget[]>([]);
   const [budgetsLoading, setBudgetsLoading] = useState(true);
   ```

2. Around line 204–213 — remove `loadBudgets` function:
   ```ts
   // DELETE the entire loadBudgets function
   const loadBudgets = useCallback(async () => { ... }, [budgetMonth]);
   ```

3. Around line 234 — remove budget loading effect:
   ```ts
   // DELETE this line:
   useEffect(() => { loadBudgets(); }, [loadBudgets]);
   ```

4. Also remove the `Budget` interface if it's no longer referenced elsewhere (check with `grep -n "Budget" apps/web/src/app/transactions/page.tsx` first).

- [ ] **Step 7: Replace the budget sidebar contents**

Find the budget column block starting around line 2567:

```tsx
{/* ── Budget column ── */}
<div className="shrink-0 flex flex-col overflow-hidden border-l"
  style={{ width: budgetWidth, minWidth: 180, maxWidth: 480, ... }}>

  <div className="px-4 py-4 border-b shrink-0 ...">
    ...Budget header and content...
  </div>

  <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
    ...budget cards...
  </div>
</div>
```

Replace the ENTIRE budget column div (from the `{/* ── Budget column ── */}` comment through its closing `</div>`) with:

```tsx
{/* ── Insights column ── */}
<div className="hidden md:flex shrink-0 flex-col overflow-hidden border-l"
  style={{ width: budgetWidth, minWidth: 180, maxWidth: 480, borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
  <InsightsPanel
    selectedTx={selectedTx}
    onClose={() => setSelectedTx(null)}
    transactions={transactions}
    recurringMap={recurringMap}
    subscriptions={subscriptions}
    onSubscriptionChange={handleSubscriptionChange}
    onNoteUpdate={handleNoteUpdate}
  />
</div>
```

- [ ] **Step 8: Add mobile bottom sheet**

After the closing `</div>` of the insights column (still inside the root `<div className="flex h-dvh overflow-hidden">`), add:

```tsx
{/* ── Mobile bottom sheet (md and below only) ── */}
{selectedTx && createPortal(
  <div
    className="md:hidden fixed inset-0 z-50 flex items-end"
    style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedTx(null); }}>
    <div className="w-full rounded-t-2xl flex flex-col overflow-hidden"
      style={{ maxHeight: '80dvh', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <InsightsPanel
        selectedTx={selectedTx}
        onClose={() => setSelectedTx(null)}
        transactions={transactions}
        recurringMap={recurringMap}
        subscriptions={subscriptions}
        onSubscriptionChange={handleSubscriptionChange}
        onNoteUpdate={handleNoteUpdate}
      />
    </div>
  </div>,
  document.body
)}
```

- [ ] **Step 9: Build both apps**

```bash
npx nx build api 2>&1 | tail -5
npx nx build web 2>&1 | tail -5
```

Expected: both print `Successfully ran target build for project <name>`

- [ ] **Step 10: Manual browser verification**

Start both servers:
```bash
npm run dev:api &
npm run dev:web
```

Open http://localhost:3000/transactions and verify:

1. **Idle state** — right sidebar shows "Insights" header, "Recurring this month" section with detected recurring merchants
2. **Click a recurring transaction** — panel switches to detail view: merchant name, amount styled green/red, date, category chip, account pill, source badge
3. **Click the same row again** — panel reverts to digest view
4. **Click × in panel header** — panel reverts to digest view
5. **Add a note** — click "+ Add note", type something, press Enter or click away → note pill updates, appears in transaction row subtitle
6. **Track as subscription** — click "Track as subscription" button → "Tracked" badge appears, note textarea shows
7. **Mark to cancel** — click "Mark to cancel" → red "Marked to cancel" badge, idle digest shows it in "To Cancel" block
8. **Mark done** — click "Done — cancelled ✓" → disappears from "To Cancel"
9. **Refresh** — subscriptions persist (stored in localStorage)
10. **Monthly total** — "↻ $X/mo in recurring charges" shows at bottom of digest

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/app/transactions/page.tsx
git commit -m "feat(web): replace budget sidebar with transaction insights panel"
```
