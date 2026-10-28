# Plaid Investments — design

Date: 2026-10-28
Status: built (same day); waits on Plaid approving Investments for the client before `PLAID_INVESTMENTS_ENABLED=true`

## Problem

Plaid's Transactions feed (`/transactions/sync`) covers depository, credit and some loan
accounts. Investment accounts (brokerage, IRA, 401k) are served only by the separate
Investments product through `/investments/transactions/get`. Cofre requested only
Transactions, so a linked Charles Schwab brokerage account showed a balance and no
activity. The owner's Schwab history, which an institution migration had retracted,
also had no way back in (see the tombstone and re-download work from the same day).

Plaid cannot be told an account is "regular": the institution reports the type.

## Decision

Add Investments the way Liabilities was added: an optional product on new links behind
a flag, a one-tap consent flow for banks linked before, a separate sync path that never
fails the main sync, and a webhook. Investment activity lands on the existing
investment account as ordinary transaction rows, so budgets, cash flow and Ask Cofre
need no change: tracking-account rows are already net-worth only.

### Data

- `plaid_items.investmentsStatus`: null (never tried) | `synced` | `not_consented` |
  `pending` | `unsupported`. Migration `PlaidItemInvestments`.
- `plaid_items.investmentsSyncedThrough`: last requested end date. Null = full pull.
- Rows: `transactions` with `source = 'plaid'`, `externalId = investment_transaction_id`,
  `plaidCategory = [type, subtype]`, `note` = "Buy · 10 × VTI @ $240.12 · fee $0.65"
  (written on insert only; a user's note is never overwritten).
- Sign: Plaid debits cash for buys and fees (positive) and credits it for sells,
  dividends, interest and deposits (negative); Cofre stores the negation so money into
  the account is positive, the same rule as the Transactions feed.

### Sync (`PlaidService.syncInvestments`, `plaid/investments.mapper.ts`)

1. Skip unless `PLAID_INVESTMENTS_ENABLED=true`, the item has at least one
   `investment` account, and the status is not `unsupported`. A bank without an
   investment account never triggers an Investments call, so it never bills one.
2. Window: first pull asks for 730 days (Plaid's maximum); later pulls start 14 days
   before `investmentsSyncedThrough` because institutions post late and Plaid revises.
3. Page with `count: 500` / `offset` until `total_investment_transactions`.
4. Upsert by `externalId` within the user. A `cancel` entry deletes the row it cancels
   (tombstoned as `plaid_cancelled`) and is not stored.
5. On success set `synced` and the end date. On a known Plaid error set the mapped
   status and stop; any other error is logged and leaves the item untouched.
6. Called after every Transactions sync: user Sync, webhook, reconnect, first link,
   re-download (which also resets the window), and the nightly stale-item sweep.

### Consent for existing banks

`POST /plaid/investments-token/:itemId` builds an update-mode link token with
`additional_consented_products: [investments]`; `POST /plaid/investments/:itemId/complete`
clears the status and window, runs the first pull and returns `{ status }`. Settings
shows "Enable investment activity →" on an investment row whose status is
`not_consented`, a muted line for `pending` and `unsupported`, and nothing while it
works. The OAuth redirect page handles `plaidLinkMode = 'investments'` like
`liabilities` and returns to Settings.

### Webhook

`INVESTMENTS_TRANSACTIONS / DEFAULT_UPDATE` → `syncInvestmentsByExternalItemId`.
`HOLDINGS` webhooks are acknowledged without action (holdings are not stored).

### Cost

Plaid's Add Products page (2026-10-28, pay-as-you-go): **$0.35 per Item per month for
Investments Transactions** and $0.18 per Item per month for Holdings. Cofre calls only
the transactions endpoint, so a linked brokerage Item costs $0.35 a month on top of
Transactions, per bank login rather than per account. The 2026-10-28 pricing model had
assumed a per-account fee; at $0.35 per Item it fits inside Pro's $2 margin for one or
two brokerages, so Investments is not plan-gated in code. Approval requested the same
day under "Personal budgeting and financial advice"; status in the dashboard:
Requested.

## Rollout

1. Request Investments in the Plaid dashboard (Products). Until approved, a link token
   naming it fails, which is why the flag defaults off.
2. Set `PLAID_INVESTMENTS_ENABLED=true` in `deploy/ci-deploy.sh` beside
   `PLAID_LIABILITIES_ENABLED`.
3. For Schwab: Settings → Bank Accounts → "Enable investment activity →" on the
   Individual row. The first pull brings back up to two years.

## Not done

- Holdings and cost basis (`/investments/holdings/get`): the Goals page and Ask Cofre
  would use them for allocation and performance; separate spec.
- Plan gating of Investments to Elite.
- Matching a brokerage deposit to the checking-side transfer automatically (the
  transfer-kind dialog still links them by hand).
