# Split Transactions — Design Spec

**Date:** 2026-06-22  
**Status:** Approved  

---

## Overview

Allow a single transaction to be split into multiple pieces, each with its own category and partial amount. The original transaction is replaced in the list by its split children (YNAB-style). All existing budget aggregations, category hints, and reports work automatically because children are real transaction rows.

---

## Data Model

### New columns on `transactions`

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `parentId` | `uuid`, nullable FK → `transactions.id`, `onDelete: CASCADE` | `null` | Set on children when split. |
| `isSplitParent` | `boolean` | `false` | Set on the original (parent) row when split. |

**Split state:** When a transaction is split, the original row becomes a hidden container (`isSplitParent = true`, `categoryId = null`). N child rows are created with `parentId = originalId`, inheriting `date`, `name`, `bankAccountId`, `userId` from the parent. Each child has its own `categoryId` and partial `amount`. `debtId`, `projectId`, `transferAccountId` are `null` on children.

**Invariant:** `SUM(children.amount) ≈ parent.amount` (within $0.01 rounding tolerance).

---

## API

### `POST /api/transactions/:id/split`

**Body:**
```json
{
  "splits": [
    { "categoryId": "uuid-or-null", "amount": 60.00 },
    { "categoryId": "uuid-or-null", "amount": 40.00 }
  ]
}
```

**Behavior:**
1. Verify `tx.userId === requestUser.id` and `tx.isSplitParent === false` and `tx.parentId === null`.
2. Validate: `splits.length >= 2`, each `amount > 0`, `SUM(amounts)` within $0.01 of `tx.amount`.
3. Create child Transaction rows with `parentId = tx.id`, same `date`/`name`/`bankAccountId`/`userId`, individual `categoryId` + `amount`.
4. Set parent: `isSplitParent = true`, `categoryId = null`.
5. Return the created children (array of Transaction with `categoryRef` relation loaded).

**Errors:** `400` if already a parent or is a child; `400` if amounts don't balance; `403` if wrong user.

---

### `DELETE /api/transactions/:id/unsplit`

**Behavior:**
1. Accepts either the parent id or any child id (resolve parent via `parentId` if needed).
2. Delete all child rows (cascade from parent handles DB side; explicit delete for clarity).
3. Reset parent: `isSplitParent = false`, restore `categoryId = null` (user must re-categorize).
4. Return the restored parent transaction.

---

### Modified: `findByUser`

Add filter: `WHERE tx.isSplitParent = false`. Parents are never returned to the frontend. Children (with `parentId` set) appear naturally in the list under their shared date. No double-counting.

No changes needed to budget aggregation, category hints, or any other queries — children carry standard `categoryId` + `amount` fields.

---

## Frontend

### Transaction interface additions

```ts
interface Transaction {
  // ... existing fields ...
  parentId: string | null;
  isSplitParent: boolean;
}
```

### Split button (hover action)

On each transaction row, a **"Split ✂"** button appears on hover alongside the existing edit/delete actions. Styled as a small ghost button (rounded-lg, same size as delete). Only shown when `tx.parentId === null` (non-children). Children show **"Unsplit"** instead.

### SplitTransactionModal component

New component: `apps/web/src/components/SplitTransactionModal.tsx`

**Layout:**
- Glassmorphism modal centered on screen
- **Header:** Transaction name (read-only) + total amount chip
- **Split lines:** each line contains:
  - Category picker (reuses existing category dropdown logic)
  - Amount `<input type="number">` 
  - Remove button (only visible when >2 lines)
- **Remaining indicator:** below the lines, shows `Remaining: $X.XX`; green at $0.00, red if negative
- **"+ Add piece"** button — appends a new line pre-filled with the remaining amount
- **Footer:** "Split transaction" (primary, disabled until remaining ≈ $0.00) + "Cancel"

**Pre-population:** If the transaction has an existing `categoryId`, the first line starts with that category and the full amount. A second empty line is added automatically.

### Split children in the transaction list

Split children render as normal rows with two visual differences:
1. A `✂ Split` badge replaces the `source` badge on the name line
2. A shared thin colored left accent bar groups siblings visually (same color per date group)

### Unsplit flow

Clicking "Unsplit" on any split child calls `DELETE /api/transactions/:parentId/unsplit`. The children are removed from local state and the restored parent is inserted in their place. The parent appears uncategorized (prompting the user to re-categorize or re-split).

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Splitting a split child | Blocked — "Unsplit first to re-allocate." tooltip. Button not shown on children. |
| Plaid sync updates a split parent's amount | Parent updates; children are left as-is. A warning badge appears on split children if `SUM(children) ≠ parent.amount`. User must unsplit and re-split. |
| Deleting a split parent | `onDelete: CASCADE` on `parentId` FK removes all children automatically. |
| CSV import | Imported transactions are always new root rows (`parentId = null`). No conflict. |
| Budget tracking | Children have individual `categoryId + amount`. Budget `spent` sums work with zero query changes. |
| Uncategorized count | A split child with `categoryId = null` counts as uncategorized (same logic as today). |
| Split with only 1 piece | Blocked — minimum 2 pieces required. |

---

## Files Changed

### API
- `apps/api/src/transactions/transaction.entity.ts` — add `parentId`, `isSplitParent` columns
- `apps/api/src/transactions/transactions.service.ts` — add `split()`, `unsplit()` methods; filter parents in `findByUser`
- `apps/api/src/transactions/transactions.controller.ts` — add `POST /:id/split`, `DELETE /:id/unsplit` routes
- `apps/api/src/config/database.config.ts` — no change needed (entity already registered)

### Web
- `apps/web/src/app/transactions/page.tsx` — add Split/Unsplit hover buttons, split children visual treatment, wire modal
- `apps/web/src/components/SplitTransactionModal.tsx` — new component
