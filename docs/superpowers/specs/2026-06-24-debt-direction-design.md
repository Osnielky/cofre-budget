# Debt Direction (I Lent / I Owe) — Design Spec

**Date:** 2026-06-24  
**Approach:** A — minimal, single `direction` column, reuse all existing logic

---

## Problem

The debt system currently only supports one direction: the user is always the lender and the other person is the borrower. There is no way to track debts the user personally owes to someone else.

## Goal

Allow debts to be created in two directions:
- **I Lent** — someone owes me money (current behavior, unchanged)
- **I Owe** — I owe money to someone else (new)

---

## 1. Data Layer

### Entity change — `Debt`

Add one column:

```typescript
@Column({ type: 'varchar', length: 10, default: 'lent' })
direction: 'lent' | 'owed';
```

No other entity changes. The existing `borrowerName` and `borrowerEmail` columns are repurposed as generic counterparty fields — their DB column names stay as-is; only the UI labels change based on direction.

### DTO changes

`CreateDebtDto` gains an optional field:

```typescript
direction?: 'lent' | 'owed';  // defaults to 'lent' if omitted
```

`Partial<CreateDebtDto>` (used by `update()`) inherits it automatically.

### Service changes

- `create()`: save `dto.direction ?? 'lent'` to the new column.
- `update()`: accept and save `direction` if provided.
- `findAll(userId, direction?)`: add an optional filter — when `direction` is provided, add a `WHERE direction = :direction` clause. Called with no filter from the debts page (loads all); called with `direction=lent` or `direction=owed` from the transactions page as needed.

No changes to `addPayment()`, `removePayment()`, `recordPaymentFromTransaction()`, or `removePaymentByTransaction()`.

---

## 2. New Debt Modal

A direction toggle appears at the top of the modal — two pill buttons: **I Lent** | **I Owe** — defaulting to **I Lent**.

Label substitution table (only these three labels change):

| Field | I Lent | I Owe |
|---|---|---|
| Counterparty name | Borrower Name | Lender Name |
| Amount | Amount Lent | Amount Owed |
| Date | Date Lent | Date Borrowed |

All other fields (email, note, due date) are identical for both directions. The `direction` value (`'lent'` or `'owed'`) is included in the create request body.

---

## 3. Debts Page

### Tabs

Two tabs are added at the top of the page: **I Lent** | **I Owe**. Active tab is stored in local state (default: **I Lent**). Filtering is done client-side against the already-loaded debt list by comparing `debt.direction`.

### Summary cards per tab

| I Lent | I Owe |
|---|---|
| Total Lent | Total Owed |
| Total Repaid | Total Paid Back |
| Outstanding | Still Owe |
| People Owing | Creditors |

Calculation logic is identical — sums of `principal`, `paid`, `remaining`, and count of open debts — filtered to the active tab's direction.

### Debt detail (expanded)

For **I Owe** debts, copy adjustments in the payment recording form:

| I Lent | I Owe |
|---|---|
| Amount received | Amount paid back |
| Email receipt | Email confirmation |

Payment mechanic is unchanged: records a `DebtPayment`, no transaction auto-created from the Debts page.

---

## 4. Transactions Page Integration

### Debt dropdown

Currently loads open "I lent" debts only and forces sign to `+` when one is selected. New behavior:

- Load **all** open debts (both directions) in one `GET /debts` call — no direction filter needed here since the sign auto-adjusts.
- Display a directional prefix in the dropdown label:
  - **I Lent** debt: `↑ John D. — $500 remaining`
  - **I Owe** debt: `↓ Bank XYZ — $300 remaining`
- When a debt is selected, auto-set the transaction sign:
  - `direction === 'lent'` → force `+` (income, someone paying me back)
  - `direction === 'owed'` → force `−` (expense, me paying someone back)

### Service

`recordPaymentFromTransaction()` already works for both directions — no changes required. The transaction amount sign determines whether it appears as income or expense in the totals; debt direction has no effect on the payment recording logic.

---

## 5. Out of Scope

- Renaming `borrowerName` / `borrowerEmail` DB columns (deliberate — Approach A)
- Changing the email templates (statement/receipt emails still use the same templates; the lender name variable already refers to the logged-in user's name, which is correct for both directions)
- Filtering the transactions page dropdown by sign before debt selection (auto-sign-adjust on select is simpler)

---

## Acceptance Criteria

1. Creating a debt with direction "I Owe" saves correctly and appears in the "I Owe" tab.
2. The "I Lent" tab shows only lent debts; the "I Owe" tab shows only owed debts.
3. Summary cards on each tab reflect only that tab's debts.
4. The New Debt modal labels update correctly when toggling direction.
5. On the Transactions page, selecting an "I lent" debt forces `+`; selecting an "I owe" debt forces `−`.
6. A transaction linked to an "I owe" debt records a `DebtPayment` correctly and updates the debt's remaining balance.
7. Existing "I lent" debts (no `direction` column yet) are treated as `'lent'` by default.
