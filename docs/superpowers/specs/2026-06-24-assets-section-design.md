# Assets Section — Design (Phase 1)

**Date:** 2026-06-24
**Status:** Approved for implementation planning

## Summary

Add an **Assets** section for things the user *owns and keeps* — a house, a car —
distinct from the existing **Projects & Assets** feature (which is oriented toward
flipping/side-hustles for profit: cost basis → sale → ROI).

An Asset tracks:

1. **Current value** — editable anytime, with lightweight dated history for an appreciation chart.
2. **Loan owed** — an outstanding balance (mortgage, car loan) → **equity = value − loan**.
3. **Linked income/expenses** — attach real transactions (maintenance, insurance, rental income).
4. Feeds **net worth** automatically.

**Recurring costs** (mortgage/insurance/HOA as scheduled expected transactions) are a
separate subsystem and are explicitly **Phase 2** — out of scope here.

## Architecture — Approach B: wrap tracking accounts

The app already has a net-worth engine. `BankAccount.accountType` supports the "tracking"
types `other_asset`, `mortgage`, `other_liability` (see
`apps/api/src/bank-accounts/account-types.ts`), and the dashboard already computes
Net Worth = asset balances − liability balances
(`apps/web/src/app/dashboard/page.tsx:169-171`). Tracking-account transactions are excluded
from cash flow; project-linked transactions are **not** excluded — `projectId` is purely a tag.

An **Asset** is a thin entity that *wraps* tracking accounts:

- Its **current value** lives in an auto-created `other_asset` tracking account (`valueAccountId`).
- Its **loan owed** lives in an auto-created liability account (`loanAccountId`, type `mortgage`
  for property / `other_liability` otherwise).
- These managed accounts feed net worth with **zero new net-worth code**.
- The asset response computes `equity = currentValue − loanOwed` for display.

### Managed accounts: hidden & automatic

On asset **create**, the API auto-creates the value account (always) and the loan account
(only if a loan balance is provided). The user never manages these directly.

- `bank_accounts` gets a new nullable column `managedByAssetId` (uuid, FK → assets, `SET NULL`).
- Accounts with `managedByAssetId` set are **hidden** from the manual Accounts list/UI
  (filter them out in the accounts list endpoint/response and on the Accounts page) but still
  count toward net worth.
- Updating an asset's value/loan updates the corresponding account balance.
- Deleting an asset deletes its managed accounts and `SET NULL`s `assetId` on linked transactions.

## Data model

### New entity: `Asset` (`apps/api/src/assets/asset.entity.ts`)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `userId` | string | owner |
| `name` | string | e.g. "Miami House" |
| `type` | string | `'property' \| 'vehicle' \| 'other'` (default `'property'`) |
| `icon` | string | default `'🏠'` |
| `color` | string nullable | |
| `imageUrl` | text nullable | |
| `description` | string nullable | |
| `purchasePrice` | decimal(12,2) nullable | what you paid (reference for appreciation) |
| `purchaseDate` | date nullable | |
| `valueAccountId` | uuid | FK → bank_accounts (the `other_asset` account; balance = current value) |
| `loanAccountId` | uuid nullable | FK → bank_accounts (the liability account; balance = owed) |
| `createdAt` / `updatedAt` | timestamps | |

### New entity: `AssetValueSnapshot` (`apps/api/src/assets/asset-value-snapshot.entity.ts`)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `assetId` | uuid | FK → assets, `ON DELETE CASCADE` |
| `value` | decimal(12,2) | the value as of `date` |
| `date` | date | when this value was recorded |
| `createdAt` | timestamp | |

One snapshot is written on asset create (the initial value) and on each value update. The
asset detail view charts these for appreciation over time.

### Modified entity: `Transaction`

- Add nullable `assetId` (uuid, FK → assets, `ON DELETE SET NULL`) — a pure tag, exactly like
  `projectId`. Linked expenses/income remain normal cash-flow transactions (not carved out of
  spending), consistent with how `projectId` behaves today.

### Modified entity: `BankAccount`

- Add nullable `managedByAssetId` (uuid, FK → assets, `ON DELETE SET NULL`).

### Config

- Register `Asset` and `AssetValueSnapshot` explicitly in
  `apps/api/src/config/database.config.ts` `entities` array (glob paths don't work in the
  webpack bundle — per CLAUDE.md).

## API — new `assets` module

`AssetsModule`, `AssetsService`, `AssetsController` under `apps/api/src/assets/`
(directory already exists with a `.gitkeep`). All endpoints scoped to the authenticated user.

| Method | Route | Behavior |
|---|---|---|
| `GET` | `/api/assets` | List assets, each with computed `currentValue`, `loanOwed`, `equity`, `income`, `expenses`, `txCount`. |
| `GET` | `/api/assets/:id` | Detail: asset + value snapshots + linked transactions. |
| `POST` | `/api/assets` | Create asset. Auto-create value account (balance = `currentValue`), optionally loan account (balance = `loanOwed`). Write initial value snapshot. Verify ownership. |
| `PATCH` | `/api/assets/:id` | Update metadata and/or `currentValue` (→ update value account balance + write snapshot) and/or `loanOwed` (→ update/create/remove loan account). |
| `DELETE` | `/api/assets/:id` | Delete asset + managed accounts; `SET NULL` `assetId` on linked transactions. |

- `income` / `expenses` aggregate linked transactions: sum of positive amounts and absolute
  value of negative amounts where `tx.assetId = asset.id`.
- **Transaction linking:** extend the existing transaction update path to accept `assetId`
  (mirror the existing `projectId` handling in `transactions.service.ts`). Setting `assetId`
  may coexist with a normal category; it does not exclude the txn from spending.
- Ownership checks follow the pattern used in budgets (verify the asset/account belongs to the
  user before mutation).

## Web

### New page: `/assets`

Modeled on `apps/web/src/app/projects/page.tsx` structure (cards + detail panel) but framed
around **ownership/equity**, not flip/ROI:

- **List cards:** icon, name, type badge, current value, owed, **equity** (green/red), and a
  small income/expense summary.
- **Detail panel:** value / owed / equity stat row; **appreciation chart** from value snapshots;
  linked income-vs-expense totals; a list of linked transactions; **"Update value"** and
  **"Update loan"** actions (write through to managed accounts).
- **Create/edit modal:** name, type, icon, color, optional image, purchase price/date, current
  value, optional loan balance.

### Sidebar

Add an **Assets** entry in `apps/web/src/components/Sidebar.tsx` (own icon), separate from
**Projects**.

### Transaction picker

Add a **"Link to asset"** path in the transaction category-picker on
`apps/web/src/app/transactions/page.tsx`, mirroring the existing project-link drill. Respect
the suggestion-chip guard fixed in commit `427595f` (chips hide once a txn is assigned —
extend the same guard to treat `assetId` as "assigned").

### Accounts page

Filter out accounts with `managedByAssetId` from the manual Accounts list so auto-created
value/loan accounts don't appear there.

### `accountTypes.ts` mirrors

`apps/web/src/lib/accountTypes.ts` mirrors the API classification — no new types needed
(`other_asset`, `mortgage`, `other_liability` already exist).

## Non-goals (Phase 1)

- **Recurring costs** — scheduled/expected recurring expenses. Separate Phase-2 spec.
- **Tying to person-to-person `Debt`s** — a mortgage/car loan is modeled as a tracking
  liability account, not a `Debt` (which is borrower/lender oriented).
- **Multi-currency per asset** — assets use the user's existing default currency.

## Risks / edge cases

- **Double counting:** value & loan accounts feed net worth; the asset only *displays* equity
  (no separate net-worth contribution) — no double count. Linked expense transactions are
  normal spending already; tagging them to an asset does not change net worth.
- **Orphaned managed accounts:** asset delete must remove its managed accounts; guard against
  leaving hidden accounts behind.
- **Loan removal:** clearing an asset's loan should delete the managed loan account and null
  `loanAccountId`.
- **Value account excluded from imports:** `other_asset`/liability types are not in
  `IMPORTABLE_TYPES`, so managed accounts won't be offered as CSV import targets — correct.
