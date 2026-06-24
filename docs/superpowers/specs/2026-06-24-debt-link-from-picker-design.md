# Debt Link from Category Picker — Design Spec

**Date:** 2026-06-24
**Scope:** Allow users to link any existing transaction to an open debt directly from the category picker dropdown, in addition to the existing manual-transaction-form path.

---

## Problem

Debts can currently only be linked to a transaction at creation time (via the manual transaction form). There is no way to link an already-existing (manual or imported) transaction to a debt after the fact. The category picker that appears on every transaction row ignores debts entirely, and debt-linked transactions have their picker click blocked.

## Goal

Show all open debts in the category picker so users can link (or unlink) any transaction to a debt payment without leaving the transactions page.

---

## 1. API — New `PATCH /transactions/:id/debt` endpoint

### Controller (`apps/api/src/transactions/transactions.controller.ts`)

```typescript
@Patch(':id/debt')
updateDebt(
  @Param('id') id: string,
  @Request() req: any,
  @Body('debtId') debtId: string | null,
) {
  return this.service.updateDebt(id, req.user.id, debtId);
}
```

### Service (`apps/api/src/transactions/transactions.service.ts`)

New `updateDebt` method:

```typescript
async updateDebt(id: string, userId: string, debtId: string | null): Promise<Transaction> {
  const tx = await this.repo.findOneByOrFail({ id, userId });

  // Remove existing DebtPayment if this tx was already linked to a debt
  if (tx.debtId) {
    await this.debtsService.removePaymentByTransaction(tx.id);
  }

  if (debtId) {
    tx.debtId    = debtId;
    tx.categoryId = undefined;   // debt payments are never categorized
    await this.repo.save(tx);
    // recordPaymentFromTransaction validates ownership and creates the DebtPayment
    await this.debtsService.recordPaymentFromTransaction(debtId, userId, {
      amount: Math.abs(Number(tx.amount)),
      date:   tx.date,
      transactionId: tx.id,
    });
  } else {
    tx.debtId = undefined;
    await this.repo.save(tx);
  }

  return this.repo.findOne({
    where: { id },
    relations: ['categoryRef', 'bankAccount', 'transferAccount'],
  });
}
```

**Behaviour notes:**
- Works for all transaction sources (manual, imported, synced) — no `source !== 'manual'` restriction.
- Ownership validation is implicit: `recordPaymentFromTransaction` calls the internal `owned()` guard on the debt and throws `NotFoundException` / `ForbiddenException` if the debt isn't the user's.
- If `debtId` is `null`, only the existing payment is removed (if any) and `debtId` is cleared. No new payment is created.
- Passing `Math.abs(tx.amount)` keeps the `DebtPayment` ledger always positive, consistent with the existing `createManual` path.

---

## 2. Frontend — Debt section in the category picker

### Files changed
- `apps/web/src/app/transactions/page.tsx`

### 2a. Unblock the picker for debt-linked transactions

Two guards currently prevent opening the picker when `tx.debtId` is set:

**Line 1260** — onClick early-return:
```tsx
if (tx.debtId) return; // remove this guard entirely
```

**Line 1279** — chip style returning `cursor: 'default'`:
```tsx
// Change to return a clickable style instead:
if (tx.debtId) return { background: 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 35%, transparent)', color: 'var(--color-card-violet)' };
// (same colours, just remove `cursor: 'default'`)
```

### 2b. New `assignDebt` function

Mirrors `assignCategory` — fetches, then patches local state:

```typescript
async function assignDebt(txId: string, debtId: string | null) {
  setUpdatingId(txId);
  setOpenPickerId(null);
  const res = await fetch(`${API}/transactions/${txId}/debt`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ debtId }),
  });
  if (!res.ok) { setUpdatingId(null); return; }
  const updated: Transaction = await res.json();
  setTransactions((prev) => prev.map((t) =>
    t.id === txId
      ? { ...t, debtId: updated.debtId, categoryId: updated.categoryId, categoryRef: updated.categoryRef }
      : t,
  ));
  setUpdatingId(null);
}
```

### 2c. Debt section in the picker dropdown

Inserted **before** the normal category list in the `!pickerTransferStep && !pickerProjectDrill` branch, immediately after the search box:

```tsx
{/* Remove debt link — only if tx already has one */}
{tx.debtId && (
  <>
    <button
      onClick={() => assignDebt(tx.id, null)}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-[var(--color-elevated)]"
      style={{ color: 'var(--color-rose)' }}>
      <span>✕</span><span>Remove debt link</span>
    </button>
    <div style={{ borderTop: '1px solid var(--color-border)' }} />
  </>
)}

{/* Debt payment section */}
{openDebts.filter(d => !pickerSearch || d.borrowerName.toLowerCase().includes(pickerSearch.toLowerCase())).length > 0 && (
  <>
    <p className="px-3 pt-2 pb-0.5 text-[10px] font-bold tracking-widest uppercase"
      style={{ color: 'var(--color-card-violet)' }}>Debt payment</p>
    {openDebts
      .filter(d => !pickerSearch || d.borrowerName.toLowerCase().includes(pickerSearch.toLowerCase()))
      .map((d) => (
        <button key={d.id}
          onClick={() => assignDebt(tx.id, d.id)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors"
          style={{
            background: tx.debtId === d.id
              ? 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)'
              : 'transparent',
            color: tx.debtId === d.id ? 'var(--color-card-violet)' : 'var(--color-text-primary)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--color-card-violet) 12%, transparent)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = tx.debtId === d.id
            ? 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)'
            : 'transparent')}>
          <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
            style={{ background: 'color-mix(in srgb, var(--color-card-violet) 20%, transparent)' }}>🤝</span>
          <span className="font-medium flex-1 text-left">{d.borrowerName}</span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            ${Number(d.remaining).toLocaleString('en-US', { minimumFractionDigits: 2 })} left
          </span>
        </button>
      ))}
    <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
  </>
)}
```

The search box (`pickerSearch`) filters both the debt list and the regular category list — debt names are matched case-insensitively against the same search string.

---

## 3. `updateCategory` — clear debt link when a category is assigned

Now that the picker is unblocked for debt-linked transactions, a user can assign a regular category to a transaction that already has a `debtId`. The existing `updateCategory` method does not clear `debtId`, so both fields would end up set simultaneously — a broken state.

**Fix in `apps/api/src/transactions/transactions.service.ts`** — inside `updateCategory`, when `categoryId` is not null:

```typescript
async updateCategory(id: string, userId: string, categoryId: string | null): Promise<Transaction> {
  const tx = await this.repo.findOneByOrFail({ id, userId });

  // Assigning a real category unlinks any existing debt
  if (categoryId && tx.debtId) {
    await this.debtsService.removePaymentByTransaction(tx.id);
    tx.debtId = undefined;
  }

  // existing transfer-clearing logic unchanged below
  if (!categoryId && tx.transferAccountId) { ... }
  tx.categoryId = categoryId ?? undefined;
  ...
}
```

No frontend change needed — `assignCategory` already replaces the displayed category/debt state from the API response.

---

## 4. Out of Scope

- Filtering debts by transaction sign (all open debts shown — user decision)
- Re-categorizing a debt-linked transaction while keeping the debt link (assigning a category clears the debt; assigning a debt clears the category — exclusive, same as today)
- Editing the transaction amount or date when linking from the picker

---

## Acceptance Criteria

1. Clicking the category chip on a debt-linked transaction opens the picker (no longer blocked).
2. The picker shows a "Debt payment" section with all open debts, filterable by the search box.
3. Selecting a debt from the picker links the transaction, removes any existing category, creates a `DebtPayment`, and updates the debt's remaining balance.
4. If the transaction already has a debt linked, a "Remove debt link" button appears at the top of the picker; clicking it unlinks the debt and removes the `DebtPayment`.
5. Selecting a regular category on a debt-linked transaction unlinks the debt: `updateCategory` is updated to call `removePaymentByTransaction` and clear `debtId` when a non-null `categoryId` is assigned.
6. Works for all transaction sources (manual, imported).
