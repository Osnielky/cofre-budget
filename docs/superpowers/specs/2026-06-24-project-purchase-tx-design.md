# Project Purchase Transaction — Design Spec

**Date:** 2026-06-24
**Scope:** Eliminate double-counting between a project's manual `purchasePrice` estimate and a real bank transaction representing the same acquisition.

---

## Problem

When a user creates a project and types in an initial cost (e.g. Car — $2,830), that number is stored as `Project.purchasePrice`. If the user later finds the real bank transaction for the same amount and links it to the project, `costBasis` is computed as:

```
costBasis = purchasePrice + sum(linked expense transactions)
          = 2,830 + 2,830 = 5,660   ← wrong
```

The $2,830 is counted twice: once as the estimate and once as the linked transaction.

## Goal

Let the user designate one linked transaction as the **initial purchase**. Once designated, the typed estimate (`purchasePrice`) is suppressed so the cost is counted exactly once. The designation is reversible — removing it restores the estimate automatically.

---

## 1. Data Layer

### Entity change — `Project`

Add one nullable column:

```typescript
@Column({ type: 'uuid', nullable: true })
purchaseTxId: string | null;
```

No cascade. `purchasePrice` is retained — it is not deleted or zeroed. TypeORM `synchronize: true` auto-migrates on API restart.

### `costBasis` formula change

In `apps/api/src/projects/projects.service.ts`, the `withStats()` method currently computes:

```typescript
const costBasis = Number(p.purchasePrice) + expenses;
```

Replace with:

```typescript
const costBasis = (p.purchaseTxId ? 0 : Number(p.purchasePrice)) + expenses;
```

When `purchaseTxId` is set, the estimate is suppressed (contributes 0). The purchase transaction itself is already counted in `expenses` because it is a linked transaction with a negative amount — no extra math needed.

When `purchaseTxId` is null, behavior is identical to today.

---

## 2. API — `PATCH /projects/:id/purchase-tx`

New endpoint in `apps/api/src/projects/projects.controller.ts`:

```typescript
@Patch(':id/purchase-tx')
setPurchaseTx(
  @Param('id') id: string,
  @Request() req: any,
  @Body('transactionId') transactionId: string | null,
) {
  return this.service.setPurchaseTx(id, req.user.id, transactionId);
}
```

New service method in `apps/api/src/projects/projects.service.ts`:

```typescript
async setPurchaseTx(projectId: string, userId: string, transactionId: string | null): Promise<ProjectWithStats> {
  const project = await this.repo.findOneByOrFail({ id: projectId, userId });

  if (transactionId) {
    // Verify the transaction belongs to this user and is linked to this project
    const tx = await this.txRepo.findOneBy({ id: transactionId, userId, projectId });
    if (!tx) throw new NotFoundException('Transaction not found or not linked to this project');
  }

  project.purchaseTxId = transactionId ?? null;
  await this.repo.save(project);
  return this.withStats(project);
}
```

**Behaviour notes:**
- `transactionId` provided: sets `purchaseTxId`, suppresses estimate in `costBasis`.
- `transactionId: null`: clears `purchaseTxId`, estimate is automatically restored (no DB change to `purchasePrice`).
- Validates that the transaction is already linked to the project — you cannot designate an unlinked transaction as the purchase.
- Returns the full updated project with recomputed `costBasis` so the frontend re-renders immediately.

**`withStats` must also return `purchaseTxId`** so the frontend knows which transaction is designated.

---

## 3. Frontend — Transaction Picker (Transactions Page)

File: `apps/web/src/app/transactions/page.tsx`

### When to show the purchase prompt

After a user selects a project in the picker drill-down, and **before** calling `linkProject`, check:

```
tx.amount < 0                    // only expenses can be purchases
&& project.purchaseTxId == null  // project has no purchase tx yet
```

If both conditions are true, show a two-option prompt inside the picker drill-down:

```
Link to: [Project Name]
  ● Project expense    (default)
  ○ Initial purchase
       [Cancel]  [Link]
```

### "Project expense" flow (default)
Calls the existing `linkProject(projectId, categoryId)` function — no change.

### "Initial purchase" flow
1. Calls `linkProject(projectId, null)` — links the transaction to the project (no category).
2. Then calls `PATCH /projects/:id/purchase-tx` with `{ transactionId: tx.id }`.
3. Updates local `projects` state so `project.purchaseTxId = tx.id` and `project.costBasis` reflects the new value from the API response.
4. Closes the picker.

### When to skip the prompt
- `tx.amount >= 0` (income transactions cannot be the purchase)
- `project.purchaseTxId` is already set (project already has a designated purchase)
- In both cases, the existing `linkProject` call fires directly with no prompt.

### State needed
A new local state `pickerIsPurchase: boolean` (default `false`) controls which radio option is selected in the prompt. Reset to `false` on picker close.

The `projects` state array (already loaded in the page) must include `purchaseTxId` in its type so the picker can read it. The `ProjectLite` interface gains:

```typescript
purchaseTxId: string | null;
```

---

## 4. Frontend — Project Page Display

File: `apps/web/src/app/projects/page.tsx`

### Purchase badge on the linked transaction

In the project detail / expanded view where linked transactions are listed, the transaction whose `id === project.purchaseTxId` gets a small "🏷 Purchase" badge next to its name.

### Remove designation action

Clicking the "🏷 Purchase" badge shows a single inline action button: **"Remove purchase designation"**. Clicking it calls:

```
PATCH /projects/:id/purchase-tx  { transactionId: null }
```

On success, update local state: `project.purchaseTxId = null`, `project.costBasis` updates from API response. The transaction stays linked as a regular expense.

### Cost breakdown label

In the project summary / cost display, the label changes based on whether a purchase tx is set:

| State | Label |
|---|---|
| `purchaseTxId` set | "Initial cost from transaction" |
| `purchaseTxId` null | "Estimated initial cost: $X" |

This makes it immediately clear to the user which source is driving the cost basis.

---

## 5. Out of Scope

- Designating a purchase transaction from the project page directly (done via tx picker only).
- Enforcing that `purchasePrice` matches the designated transaction's amount (user may have estimated differently — both values are kept, only one is used).
- Multiple "purchase" transactions (one project = one acquisition transaction).
- Changing which transaction is the purchase (must clear the current one first, then designate the new one).

---

## Acceptance Criteria

1. When `purchaseTxId` is null, `costBasis = purchasePrice + linked expenses` (unchanged behavior).
2. When `purchaseTxId` is set, `costBasis = 0 + linked expenses` (estimate suppressed; purchase tx counted once via the expense sum).
3. Linking a negative-amount transaction to a project with no `purchaseTxId` shows the "expense / initial purchase" prompt.
4. Choosing "Initial purchase" links the transaction AND sets `purchaseTxId`; `costBasis` updates immediately.
5. Clicking "Remove purchase designation" clears `purchaseTxId`; `purchasePrice` is restored in `costBasis`.
6. The "🏷 Purchase" badge appears on the designated transaction in the project detail view.
7. Income transactions and projects that already have a `purchaseTxId` skip the prompt entirely.
