# Personal Debts (Money Lent Out) — Design

**Date:** 2026-06-16
**Status:** Approved
**Context:** Cofre tracks budgets, transactions, and projects. Add tracking for
money the user lends to people, repaid in installments, with email notifications
to the borrower. Reuses the Projects module shape and the Resend `MailService`.

## Goal

Let the user record a loan they gave to someone, log partial repayments over
time, see the remaining balance and payment history, and email the borrower a
payment receipt (automatically on each payment) or a full statement (on demand).

## Decisions (settled during brainstorming)

- **Direction:** money lent out only (people owe the user). No "money you owe."
- **Notifications:** manual "Send statement" button + automatic receipt email on
  each recorded payment. No scheduled reminders (no cron/Cloud Scheduler).
- **Budget link:** none — debts are a separate ledger. Repayments do NOT count as
  income; lending is NOT an expense.
- **Borrower:** an external contact (name + optional email). Not a Cofre user;
  never logs in. Email is optional — a debt can be tracked without notifying.
- **No interest** — simple principal and repayments.

## Data model (two entities, registered in `database.config.ts`)

**`Debt`** (`debts` table):
- `id` uuid, `userId`
- `borrowerName` (string), `borrowerEmail` (string, nullable)
- `principal` (decimal 12,2) — amount lent
- `description` (string, nullable), `dueDate` (date, nullable)
- `status` (`open` | `paid`, default `open`)
- `createdAt`, `updatedAt`

**`DebtPayment`** (`debt_payments` table):
- `id` uuid, `debtId` (FK, onDelete CASCADE)
- `amount` (decimal 12,2), `date` (date), `note` (string, nullable)
- `createdAt`

**Computed (in service, not stored):** `paid` = sum of payments; `remaining` =
`principal − paid`; `percentage` = `paid / principal`. `status` is set to `paid`
when `remaining <= 0`, else `open` (recomputed on every payment add/remove).

## API — `debts` module (mirrors `projects`)

| Method & path | Behaviour |
|---|---|
| `GET /debts` | List the user's debts, each with `paid`/`remaining`/`percentage`. |
| `POST /debts` | Create `{ borrowerName, borrowerEmail?, principal, description?, dueDate? }`. |
| `GET /debts/:id` | One debt + its payments (history). |
| `PATCH /debts/:id` | Edit borrower/principal/description/dueDate. |
| `DELETE /debts/:id` | Delete debt (cascades payments). |
| `POST /debts/:id/payments` | `{ amount, date, note?, emailReceipt? }` → create payment, recompute status; if `emailReceipt` and `borrowerEmail` present, send receipt. |
| `DELETE /debts/:id/payments/:pid` | Remove a payment (correction); recompute status. |
| `POST /debts/:id/send-statement` | Email the current statement to `borrowerEmail` (400 if no email on file). |

All endpoints are `JwtAuthGuard`-protected and scoped to `req.user.id`; every
`:id` operation verifies the debt belongs to the user (NotFound/Forbidden like
`BudgetsService`/`ProjectsService`).

## Email — extend `MailService`

Two methods, branded with the existing dark + champagne template, from
`MAIL_FROM` (`no-reply@notify.osmioservices.com`). Both take the lender's display
name so the borrower knows the sender.

- `sendDebtReceipt(to, borrowerName, { lenderName, amountPaid, remaining })`
  — auto after a payment.
- `sendDebtStatement(to, borrowerName, { lenderName, principal, paid, remaining, payments })`
  — manual; lists payment history.

Send failures are logged but must NOT fail the payment write (unlike signup,
where the email is essential) — recording the payment is the source of truth;
the email is a courtesy. So the controller records the payment first, then
attempts the email and reports whether it was sent.

## Web — `/debts` page + sidebar "Debts" item

Follows the budgets/projects styling (Gilded Noir, glass cards, `--popover-bg`
dropdowns, responsive per the standing requirement).

- **Summary cards:** Total Lent, Total Repaid, Outstanding, People Owing.
- **Debt list:** each card shows borrower name, prominent **remaining balance**,
  a progress bar (repaid vs principal), Open/Paid badge, and a due date if set.
- **Add Debt modal:** borrower name, email (optional), amount, optional
  description + due date.
- **Debt detail (expand):** payment history list; **Record payment** form
  (amount, date default today, note) with an **"Email receipt"** checkbox
  (checked by default, disabled if no borrower email); **Send statement** button
  (disabled if no email); edit/delete.
- Recording a payment optimistically updates the remaining balance and shows a
  small "receipt emailed" confirmation when applicable.

`NEXT_PUBLIC_API_URL` base + `credentials: 'include'` like the other pages.

## Integrations

- Register `Debt` + `DebtPayment` in `apps/api/src/config/database.config.ts`
  (entities array — glob paths don't work in the webpack bundle).
- Add `DebtsModule` to `app.module.ts`.
- Add a **Debts** nav item to `Sidebar.tsx`.
- Include both tables in the **data-reset** flow so "clear my data" wipes debts.
- No new deploy env/secrets (reuses Resend already in `ci-deploy.sh`).

## Security / edge cases

- Ownership checks on every debt + nested payment operation.
- `send-statement` / receipt: no-op or 400 when `borrowerEmail` is empty (UI
  disables the buttons in that case).
- Over-payment allowed (remaining can go negative → clamps display at paid/“Paid”);
  recompute keeps status correct if a payment is later deleted.
- Amounts validated as positive numbers server-side.

## Out of scope (future)

Interest/fees, scheduled reminders, borrower login/self-service, multi-currency,
linking repayments to bank transactions, "money you owe" direction.

## Testing

No test runner. Verify manually on the live dev deploy: create a debt → record a
payment (receipt email arrives, balance drops) → send a statement → pay it off
(status flips to Paid) → delete a payment (status reverts) → confirm debts are
isolated from the dashboard/budget numbers and cleared by data-reset.
