# Transaction Detail & Insights Panel

**Date:** 2026-06-29
**Status:** Approved — ready for implementation

## Summary

Replace the budget sidebar on the Transactions page with a dual-mode **Insights panel**. When idle it shows a recurring-charges digest. When a transaction row is clicked it shows full transaction detail plus subscription tracking controls.

---

## 1. Scope

- **In scope:** `apps/web/src/app/transactions/page.tsx` only. No new API endpoints or DB migrations required for phase 1.
- **Out of scope (future upgrade — C):** A server-side subscriptions entity with status, next-charge date, and history. The localStorage design is intentionally shaped to make this migration straightforward.

---

## 2. Layout & State

### Removed
The budget column contents (lines ~2567–2634) are replaced entirely. The outer container (`budgetWidth`, drag handle, notifications toggle) is kept unchanged.

### New state
```ts
const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
const [subscriptions, setSubscriptions] = useState<SubscriptionStore>({});
```

`SubscriptionStore`:
```ts
type SubStatus = 'active' | 'to-cancel' | 'cancelled';
type SubscriptionStore = Record<string, {   // key = normalized merchant name
  note: string;
  status: SubStatus;
}>;
```

Loaded from `localStorage.getItem('cofre:subscriptions')` on mount, written back on every mutation.

### Panel header
- Left: label **"Insights"** (replaces "Budget · Month")
- Right: `×` close button — only visible when `selectedTx !== null`; clears selection on click. Bell toggle stays.

### Transaction row interaction
Clicking a transaction row sets `selectedTx` to that transaction. Clicking the same row again clears it. This is additive to the existing row-expand behavior (split / category picker) — the row expand still works; the panel just updates independently.

### Mobile
The sidebar is hidden on small screens. When `selectedTx` is set on mobile, show a bottom-sheet modal with the detail view. Close on backdrop tap or `×` button.

---

## 3. Recurring Detection (pure frontend)

Runs once when the transactions array changes. No API call.

```
normalize(name: string): string
  → lowercase
  → strip trailing location noise: /\s+\d{4,}.*$/ and /\s+[A-Z]{2}$/ etc.
  → trim

Group all transactions by normalize(tx.name)
For each group:
  uniqueMonths = Set of tx.date.slice(0,7)   // "2026-06"
  if uniqueMonths.size >= 2 → recurring = true
  frequency = most common interval between occurrences (monthly / weekly / irregular)
  medianAmount = median of Math.abs(tx.amount) across all occurrences
```

Result: `recurringMap: Record<string, RecurringInfo>` — memoized, recomputed only when `transactions` changes.

```ts
type RecurringInfo = {
  normalized: string;
  displayName: string;        // most common raw name
  occurrences: { month: string; amount: number; date: string }[];
  medianAmount: number;
  frequency: 'weekly' | 'monthly' | 'irregular';
};
```

---

## 4. Idle Digest View (`selectedTx === null`)

Three blocks, no API calls — all data comes from `recurringMap` and `subscriptions`.

### 4a. Recurring this month
- List of merchants from `recurringMap` where at least one occurrence falls in the current filter month
- Each row: merchant name · amount · frequency label · "subscription" badge if `subscriptions[key]` exists
- Sorted by `medianAmount` descending, capped at 8 rows + "Show X more" toggle
- Clicking a row does **not** select a transaction — it opens the subscription controls for that merchant inline (mini-expand)

### 4b. To Cancel
- Only rendered when at least one `subscriptions[key].status === 'to-cancel'`
- Each entry: red dot · merchant name · note text · "Done" button → sets status to `'cancelled'`

### 4c. Monthly recurring total
Single footer line: `↻ $X/mo in recurring charges`
Sum of `medianAmount` for all recurring merchants that appear in the current filter month.

---

## 5. Transaction Detail View (`selectedTx !== null`)

Four blocks:

### 5a. Header
- Merchant name (large, semibold, truncated)
- Amount: green for positive, rose for negative, tabular-nums
- Date: formatted "Sat, Jun 20"
- Category chip: icon + name, colored background from `category.color`

### 5b. Details row
Three small pills in a row:
- **Account** — bank account name
- **Source** — "CSV" badge or "Manual"
- **Note** — if present, shown as text; if absent, a faint "+ Add note" tap target. Tapping opens an inline textarea; on blur/enter → `PATCH /api/transactions/:id { note }` and updates local state.

### 5c. Recurring history
- If `recurringMap[normalize(tx.name)]` exists:
  - Mini timeline of last 4 occurrences: month · amount (current month highlighted)
  - Label: `Monthly · avg $X.XX`
- If not recurring:
  - Faint text: "First time we've seen this merchant."

### 5d. Subscription controls
Three states driven by `subscriptions[normalize(tx.name)]?.status`:

| State | UI |
|---|---|
| Not tracked | Single button "Track as subscription" → sets status `'active'` |
| `active` | Green chip "Tracked" · note textarea · "Mark to cancel" button → sets status `'to-cancel'` |
| `to-cancel` | Red chip "Marked to cancel" · note shown · "Done — cancelled" button → sets status `'cancelled'` |

`cancelled` subscriptions are hidden from the "To Cancel" digest block but remain in localStorage.

---

## 6. localStorage Schema

Key: `cofre:subscriptions`

```json
{
  "netflix": { "note": "cancel at netflix.com/account", "status": "to-cancel" },
  "chevron": { "note": "", "status": "active" }
}
```

Keyed by normalized merchant name. On conflict (same merchant, different transactions) the key is shared — the subscription tracks the merchant, not a specific transaction.

---

## 7. Future Upgrade (C) — Pending

When the user is ready to upgrade to server-side subscription tracking:

- New `subscriptions` table: `id, userId, merchantKey, displayName, note, status, monthlyAmount, nextChargeDate, createdAt`
- New API module: `GET/POST/PATCH /api/subscriptions`
- Migration: on first load after upgrade, seed the DB from `cofre:subscriptions` localStorage and clear the key
- The `SubscriptionStore` type and `normalize()` function are reused as-is; only the persistence layer changes

---

## 8. Files Changed

| File | Change |
|---|---|
| `apps/web/src/app/transactions/page.tsx` | Replace budget sidebar contents; add `selectedTx`, `subscriptions` state; add `recurringMap` computation; add `InsightsPanel`, `DigestView`, `TransactionDetailView` components (inline or extracted) |

No backend changes required for phase 1.
