# Transaction Note Field & Cross-Type Category Picker

**Date:** 2026-06-25
**Status:** Approved

## Overview

Two UX improvements to the manual transaction form:
1. An optional `note` field for free-text annotations on any transaction.
2. Expense categories visible in the income category picker (grouped below a divider), so users can properly categorize reimbursements against the original expense category.

---

## Feature 1 — Transaction Note Field

### Data Layer

**Entity:** Add `note` column to the `Transaction` entity.

```typescript
@Column({ type: 'varchar', length: 500, nullable: true, default: null })
note: string | null;
```

**Migration:** Non-breaking addition.

```sql
ALTER TABLE transactions ADD COLUMN note VARCHAR(500) NULL;
```

**DTO:** Add optional field to `CreateTransactionDto` (and update DTO if one exists).

```typescript
note?: string; // max 500 chars, optional
```

**Service:** `createManual()` passes `note` through to the insert. Included in the serialized response.

### UI — Manual Transaction Form

- A `NOTE (optional)` field renders below the category picker in both income and expense forms.
- Label style matches existing labels: small-caps, muted, consistent spacing.
- Single-line text input, same visual style as the `name` field.
- Max 500 characters enforced via `maxLength={500}` on the input element. No explicit error message needed.

### UI — Transaction List

- When `note` is non-null/non-empty, render it as a second line under the transaction name.
- Styling: smaller font, muted color (`text-white/50` or equivalent), truncated with ellipsis if overflowing.
- No element rendered when `note` is null or empty.

---

## Feature 2 — Cross-Type Categories in Income Picker

### Problem

When a user receives cash reimbursing them for an expense (e.g., a friend pays their share of a restaurant bill), the income category picker only shows income-type categories. The user cannot categorize the income against "Food & Dining" to properly offset the original expense.

### Solution

Group the income category picker into two sections:

1. **Primary section** (unlabeled): income + both categories — same as current behavior.
2. **Secondary section** (labeled divider): all expense categories, accessible when the user needs to offset a specific expense.

Selecting an expense category for an income transaction works identically to selecting an income category — no special behavior, just stored as `categoryId`.

### UI — Income Category Dropdown

```
  🎁 Reimbursement
  🎟 Cash-reward
  💼 Salary
  🖥 Freelance
  📈 Investments
  ...

──── Expense categories ────

  🍔 Food & Dining
  🏠 Housing
  🚗 Transport
  ...
```

- The divider is a full-width separator with centered label "Expense categories" in muted small text.
- Visually consistent with the existing debt repayment separator in the picker.
- **Expense category picker (negative transactions) is unchanged** — continues to show only expense + both categories.

### Data Layer

No changes. Category entities and API are untouched. The grouping is purely a frontend filter/render concern.

The existing filter:
```typescript
const catOptions = categories.filter(
  (c) => c.type === (isExpense ? 'expense' : 'income') || c.type === 'both'
);
```

Becomes two lists for the income case:
```typescript
const primaryOptions = categories.filter(c => c.type === 'income' || c.type === 'both');
const secondaryOptions = categories.filter(c => c.type === 'expense');
```

Rendered as a grouped dropdown with a divider between them.

---

## Out of Scope

- Note field on Plaid/CSV-imported transactions (manual only for now).
- Showing income categories inside the expense picker (not a known use case).
- Budget impact logic changes — using an expense category for income is stored as-is; budget calculations can handle this in a future pass if needed.
- Note display in a transaction detail/edit view (not yet built).
