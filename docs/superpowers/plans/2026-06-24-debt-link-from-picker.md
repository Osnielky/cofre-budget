# Debt Link from Category Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users link any existing transaction to an open debt directly from the category picker dropdown, and unlink it the same way.

**Architecture:** A new `PATCH /transactions/:id/debt` API endpoint mirrors the existing `PATCH /:id/category` pattern — it records or removes a `DebtPayment` and enforces `categoryId`/`debtId` exclusivity. The frontend unblocks the picker for debt-linked transactions, adds an `assignDebt` function that calls the new endpoint, and injects a "Debt payment" section at the top of the picker dropdown (above the regular category list). `updateCategory` is also patched so that assigning a category to a debt-linked transaction clears the debt link.

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL (API), Next.js 16 / React 19 / Tailwind v4 (Web). No test runner — manual verification via dev servers.

## Global Constraints

- No test runner configured — verify all changes by running `npm run dev:api` and `npm run dev:web`, then testing in the browser.
- TypeORM `synchronize: true` is active — no manual migrations required.
- API base: `http://localhost:3333/api`. Web: `http://localhost:3000`.
- Glassmorphism surfaces: `rgba` + `backdrop-filter: blur()`. Never use solid `--color-surface` backgrounds on cards.
- Accent colors: `--color-card-violet #9B6DFF`, `--color-rose`, `--color-border`, `--color-elevated`, `--color-text-primary`, `--color-text-muted`.
- `DebtPayment` ledger always stores positive amounts — pass `Math.abs(tx.amount)` when recording.
- `categoryId` and `debtId` are mutually exclusive — setting one must clear the other.
- Endpoint follows the same ownership guard pattern as `recordPaymentFromTransaction`: `findOneByOrFail({ id, userId })` for the transaction; debt ownership validated inside `DebtsService`.

---

### Task 1: API — `PATCH /transactions/:id/debt` endpoint + `updateCategory` fix

**Files:**
- Modify: `apps/api/src/transactions/transactions.service.ts`
- Modify: `apps/api/src/transactions/transactions.controller.ts`

**Interfaces:**
- Produces: `TransactionsService.updateDebt(id, userId, debtId | null): Promise<Transaction>` — links or unlinks a debt, returns the full updated transaction with `categoryRef`, `bankAccount`, `transferAccount` relations.
- Produces: `PATCH /api/transactions/:id/debt` body `{ debtId: string | null }` — returns same shape as `PATCH /api/transactions/:id/category`.
- Modifies: `TransactionsService.updateCategory` — when `categoryId` is non-null and `tx.debtId` is set, calls `removePaymentByTransaction` and clears `tx.debtId` before saving.

- [ ] **Step 1: Add `updateDebt` method to `transactions.service.ts`**

Insert the following method after the existing `updateCategory` method (around line 328). `DebtsService` is already injected as `this.debtsService`.

```typescript
async updateDebt(id: string, userId: string, debtId: string | null): Promise<Transaction> {
  const tx = await this.repo.findOneByOrFail({ id, userId });

  if (tx.debtId) {
    await this.debtsService.removePaymentByTransaction(tx.id);
  }

  if (debtId) {
    tx.debtId    = debtId;
    tx.categoryId = undefined;
    await this.repo.save(tx);
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

- [ ] **Step 2: Fix `updateCategory` to clear debt link when a category is assigned**

In `apps/api/src/transactions/transactions.service.ts`, inside `updateCategory`, add the debt-clearing block immediately after `findOneByOrFail` and before the existing transfer-clearing logic. The method currently starts at line 309:

```typescript
async updateCategory(id: string, userId: string, categoryId: string | null): Promise<Transaction> {
  const tx = await this.repo.findOneByOrFail({ id, userId });

  // NEW: assigning a real category unlinks any existing debt
  if (categoryId && tx.debtId) {
    await this.debtsService.removePaymentByTransaction(tx.id);
    tx.debtId = undefined;
  }

  /* If clearing a transfer category, undo balance + clear counterpart link */
  if (!categoryId && tx.transferAccountId) {
    // ... (rest of method unchanged)
```

The full updated `updateCategory` method (replace the existing one from line 309–328):

```typescript
async updateCategory(id: string, userId: string, categoryId: string | null): Promise<Transaction> {
  const tx = await this.repo.findOneByOrFail({ id, userId });

  // Assigning a real category unlinks any existing debt
  if (categoryId && tx.debtId) {
    await this.debtsService.removePaymentByTransaction(tx.id);
    tx.debtId = undefined;
  }

  /* If clearing a transfer category, undo balance + clear counterpart link */
  if (!categoryId && tx.transferAccountId) {
    await this.adjustTransferBalance(tx.transferAccountId, userId, Number(tx.amount), 'undo');
    if (tx.counterpartTxId) {
      const counterpart = await this.repo.findOneBy({ id: tx.counterpartTxId, userId });
      if (counterpart) {
        counterpart.counterpartTxId   = undefined;
        counterpart.transferAccountId = undefined;
        await this.repo.save(counterpart);
      }
    }
    tx.transferAccountId = undefined;
    tx.counterpartTxId   = undefined;
  }
  tx.categoryId = categoryId ?? undefined;
  const saved = await this.repo.save(tx);
  return this.repo.findOne({ where: { id: saved.id }, relations: ['categoryRef', 'transferAccount'] });
}
```

- [ ] **Step 3: Add the controller endpoint**

In `apps/api/src/transactions/transactions.controller.ts`, insert this method after the existing `updateCategory` endpoint (after line 97):

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

- [ ] **Step 4: Start the API and verify manually**

```bash
npm run dev:api
```

With a valid JWT cookie, test the new endpoint:

```bash
# Link a transaction to a debt
curl -X PATCH http://localhost:3333/api/transactions/<TX_ID>/debt \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=<JWT>" \
  -d '{"debtId":"<DEBT_ID>"}'
# Expect 200 with tx.debtId set, tx.categoryId null

# Unlink (pass null)
curl -X PATCH http://localhost:3333/api/transactions/<TX_ID>/debt \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=<JWT>" \
  -d '{"debtId":null}'
# Expect 200 with tx.debtId null
```

Also verify `updateCategory` fix: link a transaction to a debt, then assign a category via `PATCH /:id/category`. The response should have `debtId: null`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/transactions/transactions.service.ts \
        apps/api/src/transactions/transactions.controller.ts
git commit -m "feat(api): add PATCH /transactions/:id/debt endpoint; updateCategory clears debtId"
```

---

### Task 2: Frontend — unblock picker + `assignDebt` function

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/transactions/:id/debt` from Task 1
- Produces: `assignDebt(txId: string, debtId: string | null): Promise<void>` — callable from picker buttons in Task 3
- Modifies: picker `onClick` handler — removes the `if (tx.debtId) return;` early-exit at line 1260
- Modifies: chip `style` IIFE — removes `cursor: 'default'` from the `tx.debtId` branch at line 1279

- [ ] **Step 1: Remove the `if (tx.debtId) return;` guard**

In `apps/web/src/app/transactions/page.tsx`, at line 1260, remove the early-return guard entirely. The `onClick` handler currently starts with:

```tsx
onClick={(e) => {
  if (tx.debtId) return; // debt repayments are managed from the Debts page / by deleting the tx
  if (isOpen) { setOpenPickerId(null); ...
```

Replace with:

```tsx
onClick={(e) => {
  if (isOpen) { setOpenPickerId(null); setPickerProjectDrill(null); setPickerTransferStep(false); return; }
```

- [ ] **Step 2: Remove `cursor: 'default'` from the chip style**

At line 1279 the `tx.debtId` branch returns a style with `cursor: 'default'`. Remove that property:

```tsx
// BEFORE
if (tx.debtId) return { background: 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 35%, transparent)', color: 'var(--color-card-violet)', cursor: 'default' };

// AFTER
if (tx.debtId) return { background: 'color-mix(in srgb, var(--color-card-violet) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 35%, transparent)', color: 'var(--color-card-violet)' };
```

- [ ] **Step 3: Add the `assignDebt` function**

Insert this function directly after the `assignCategory` function (after the closing `}` at line 304, before the comment `/* ── manual transaction ── */` at line 306):

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

- [ ] **Step 4: Start the web server and verify in browser**

```bash
npm run dev:web
```

Open http://localhost:3000/transactions. Find a transaction that has a debt linked (chip shows "🤝 Debt repayment · …"). Click it — the picker should now open (previously blocked). Confirm the dropdown appears.

Also confirm that a transaction with no debt and no category shows the normal picker when clicked (no regression).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/transactions/page.tsx
git commit -m "feat(web): unblock category picker on debt-linked transactions; add assignDebt function"
```

---

### Task 3: Frontend — debt section in picker dropdown

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx`

**Interfaces:**
- Consumes: `assignDebt(txId, debtId | null)` from Task 2
- Consumes: `openDebts` — already computed at line 515 as `debts.filter((d) => d.status === 'open')`
- Consumes: `pickerSearch` — the controlled search input string already in state
- Produces: visible "Debt payment" section in the picker dropdown with one row per open debt, filterable by `pickerSearch`; "Remove debt link" button when the transaction already has a debt linked

- [ ] **Step 1: Add the debt section to the picker dropdown**

The picker dropdown body starts at line 1326 (`createPortal`). Currently its structure is:

```
[Remove category button — if cat]
[divider]
[Search box — if !pickerTransferStep && !pickerProjectDrill]
[pickerTransferStep branch]
[pickerProjectDrill branch]
[regular category list]
```

After the search box closing `</div>` (currently at line 1351, closing the `!pickerTransferStep && !pickerProjectDrill` search box block), insert the debt section. The insertion point is the line after:

```tsx
                                  </div>
                                )}
```
...(end of search box block at line 1350–1351), before the line:
```tsx
                                {pickerTransferStep && openPickerId === tx.id ? (
```

Insert this JSX block between those two:

```tsx
                                {/* Remove debt link */}
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
                                {!pickerTransferStep && !pickerProjectDrill && (() => {
                                  const filteredDebts = openDebts.filter((d) =>
                                    !pickerSearch || d.borrowerName.toLowerCase().includes(pickerSearch.toLowerCase()),
                                  );
                                  if (!filteredDebts.length) return null;
                                  return (
                                    <>
                                      <p className="px-3 pt-2 pb-0.5 text-[10px] font-bold tracking-widest uppercase"
                                        style={{ color: 'var(--color-card-violet)' }}>Debt payment</p>
                                      {filteredDebts.map((d) => (
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
                                  );
                                })()}
```

- [ ] **Step 2: Verify in browser**

With `npm run dev:web` running, open http://localhost:3000/transactions and test these scenarios:

**Scenario A — Link a transaction to a debt:**
1. Find an uncategorized transaction and click its chip ("Categorize").
2. The picker opens. Confirm a "Debt payment" section appears above the category list.
3. Click a debt name. The picker closes, the chip updates to "🤝 Debt repayment · [Name]" (or "Debt payment ·" for owed debts), and the chip is violet.
4. Open the Debts page — verify the debt's remaining balance decreased by the transaction amount.

**Scenario B — Re-link to a different debt:**
1. Click the 🤝 chip on a debt-linked transaction. The picker opens.
2. A "Remove debt link" button appears at the top (in rose/red).
3. The currently linked debt row is highlighted in violet with a violet label.
4. Click a different debt — the transaction switches to the new debt; old `DebtPayment` removed, new one created.

**Scenario C — Remove debt link:**
1. Click "Remove debt link" in the picker. The transaction loses its debt link; chip reverts to "Categorize".

**Scenario D — Assign a category to a debt-linked transaction:**
1. Click the 🤝 chip, then pick any regular category.
2. The chip updates to show the category; the debt link is gone.
3. Check the Debts page — the debt's `DebtPayment` for this transaction is removed and balance restored.

**Scenario E — Search filters debts:**
1. Open picker on any transaction, type part of a debt's borrower name in the search box.
2. Only matching debts appear in the "Debt payment" section; category list also filters normally.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/transactions/page.tsx
git commit -m "feat(web): add debt section to category picker — link/unlink debts from transaction row"
```
