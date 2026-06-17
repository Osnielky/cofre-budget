# Debt-Payment Transactions — Design

**Date:** 2026-06-17
**Status:** Approved
**Context:** Cofre tracks debts (money lent out, repaid in installments) as a
separate ledger. Net worth counts a debt's outstanding balance as a receivable
asset, and repayments are deliberately NOT income. The user wants to log a
repayment from the manual "+ New" transaction flow (where they record received
cash) and have it tagged as a debt payment.

## Goal

In the manual income transaction flow, let the user categorize the money as a
repayment of a specific open debt. Doing so records a payment against that debt
(reducing its remaining and the net-worth receivable) and excludes the
transaction from income totals — keeping the books consistent (no double count,
no inflated income).

## Decisions (settled during brainstorming)

- **Linked, not just tagged:** selecting a debt records a real `DebtPayment`
  against it (single source of truth for the debt balance) and the transaction
  is excluded from income/expense.
- **Manual income flow only** (the `+`/income manual transaction). Not imported/
  Plaid transactions; not the "money I owe" direction (we only lend out).
- **The transaction owns the linked payment.** The payment is created/deleted by
  the transaction. On the Debts page it shows read-only ("via transaction"),
  with no delete ✕ — managed from Transactions, so the two never drift.

## Data model

- `Transaction.debtId` (nullable, FK → `Debt`, `onDelete: SET NULL`). When set,
  the transaction is a debt repayment.
- `DebtPayment.transactionId` (nullable). Links a payment to the transaction
  that created it (null for payments added manually on the Debts page).

The debt's `paid`/`remaining`/`status` keep computing from `DebtPayment` rows —
the transaction is just the linked cash record.

## API

- **`createManual`** (transactions service) accepts optional `debtId`. When set:
  - Require `amount > 0` and that the debt exists, belongs to the user, and is
    `open` (else `BadRequest`/`Forbidden`).
  - Save the transaction (with `debtId`), then create a linked `DebtPayment`
    `{ debtId, amount, date, transactionId: tx.id }`, then recompute the debt's
    status. Email receipt is NOT auto-sent here (the Debts page is where the
    user opts into receipts); this is a self-bookkeeping entry.
- **Transaction delete** (`remove`): if the transaction has a linked
  `DebtPayment` (by `transactionId`), delete it and recompute the debt status,
  so deleting the transaction restores the debt's remaining.
- **Debts `findOne`** payment history already returns `DebtPayment` rows;
  include `transactionId` so the UI can mark transaction-sourced payments.
- Inject `DebtsService` into `TransactionsService` (`DebtsModule` exports
  `DebtsService`; `TransactionsModule` imports `DebtsModule` — one-way, no
  cycle). Add two public methods on `DebtsService`:
  `recordPaymentFromTransaction(debtId, userId, { amount, date, transactionId })`
  and `removePaymentByTransaction(transactionId)`, both recomputing status —
  so the balance/status math lives only in `DebtsService`.

## Frontend

- **Manual transaction modal** (only when sign is `+`/income): the category
  dropdown gains a **"Debt repayment"** group, listed only when the user has
  open debts, each item `"<borrower> — $<remaining> left"`. Selecting one sets
  `debtId` and clears the normal `categoryId`; submit sends `debtId`.
- **Transactions list/filters**: a transaction with `debtId` renders its
  category as **"Debt repayment · <borrower>"** with a distinct style, and is
  excluded from the income/expense filters and counts (same treatment as
  `transfer`). The frontend `Transaction` type gains `debtId`.
- **Dashboard**: income and expense sums exclude `debtId` transactions (extend
  the existing `isTransfer` exclusion). Net worth already reflects the
  receivable, which now correctly drops when the linked payment reduces the
  debt's remaining.
- **Debts page**: payment rows where `transactionId` is set show a small "via
  transaction" tag and hide the ✕ delete (deleted by removing the transaction).

## Edge cases / consistency

- Over-repayment allowed (debt flips to `paid`); deleting the transaction
  reverts the status — consistent with existing `addPayment`/`removePayment`.
- Only `open` debts are offered in the picker; once paid, a debt drops out.
- A repayment transaction excluded from income must also be excluded from the
  expense side and any income-target progress (it's neither).

## Out of scope (future)

Tagging imported/Plaid transactions as repayments; expense-side "debt I owe";
auto-emailing a receipt from the transaction flow.

## Testing

No test runner. Verify via `npm run build:*`, a local API smoke (create a manual
income tx with `debtId` → debt remaining drops + a linked DebtPayment exists +
the tx is excluded from income; delete the tx → remaining restored), and a
manual pass on the live deploy.
