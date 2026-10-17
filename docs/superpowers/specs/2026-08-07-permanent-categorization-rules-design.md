# Permanent Categorization Rules

**Date:** 2026-08-07
**Status:** Approved for planning

## Problem

Users currently categorize transactions one at a time. When a merchant (e.g. "STARBUCKS") appears repeatedly, there's no way to say "always categorize this merchant as Coffee & Snacks" — the closest existing mechanism (`TransactionsService.getCategoryHints`) is a passive, recomputed-on-load suggestion, not something the user creates, sees, or manages.

## Goal

Let a user mark a transaction's category as "permanent" from the transaction view. Doing so:
1. Creates a persisted rule tied to the transaction's merchant/name text and the chosen category.
2. Immediately applies that category to the user's other *uncategorized* transactions that strongly match.
3. Continues applying to new uncategorized transactions as they arrive (Plaid sync, CSV import, manual entry).
4. Is visible, editable, and deletable from a new Settings tab.

## Non-goals

- Fuzzy/substring matching — matching is exact (case-insensitive, trimmed) on a single field.
- Retroactively un-categorizing transactions when a rule is edited or deleted.
- Cross-user or global rules — every rule is scoped to its owning user, following the existing `Category`/`Transaction` pattern.

## Data model

New entity `CategorizationRule` (`apps/api/src/categorization-rules/categorization-rule.entity.ts`), modeled on `Category`:

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `userId` | string + `ManyToOne User` | `onDelete: 'CASCADE'` |
| `matchType` | `'merchant' \| 'name'` | which field it matched on when created |
| `matchValue` | string | exact text to match, case-insensitive/trimmed |
| `categoryId` | uuid + `ManyToOne Category` | `onDelete: 'CASCADE'` — deleting the category deletes the rule too, no orphaned rules |
| `createdAt` | timestamp | |

A DB unique constraint on `(userId, matchType, matchValue)` prevents duplicate rules at the data layer.

## Match logic

A transaction matches a rule when:
- The transaction has a non-empty `merchantName` → compared (case-insensitive, trimmed, exact) against rules where `matchType = 'merchant'`.
- Otherwise, its `name` → compared against rules where `matchType = 'name'`.

If a transaction happens to satisfy both a `merchant`-type and a `name`-type rule (possible only via coincidence, since the unique constraint is per `matchType`), the `merchant`-type match takes precedence, since `merchantName` is the more normalized field.

Transactions with no usable match text (empty/whitespace `name` and no `merchantName`) cannot have a rule created from them — the "make permanent" checkbox is disabled for those rows.

## API

New module `apps/api/src/categorization-rules/` (entity, service, controller), guarded by `JwtAuthGuard`, all operations scoped to `req.user.id`:

- **`GET /categorization-rules`** — list the user's rules, each joined with its category's name/color/icon, for the Settings tab.
- **`POST /categorization-rules`** — body `{ transactionId, categoryId }`.
  - Loads the transaction (ownership-checked), derives `matchType`/`matchValue` from its `merchantName`/`name`.
  - Creates the rule.
  - Bulk-updates the user's uncategorized transactions matching that value to `categoryId`.
  - Returns the created rule plus `appliedCount` (number of other transactions updated).
  - On a match-value collision with an existing rule → `409` with the existing rule's id, so the client can offer "edit existing rule" instead of silently failing.
- **`PATCH /categorization-rules/:id`** — body `{ matchValue?, categoryId? }`.
  - Re-applies against the user's uncategorized transactions using the (possibly updated) match value/category.
  - Does not touch transactions already categorized under the old value — no retroactive un-categorization.
- **`DELETE /categorization-rules/:id`** — deletes the rule. Transactions already categorized by it keep their category.

**Applying to new transactions:** a shared `CategorizationRulesService.applyToNew(userId, transactions)` method is invoked from each transaction-creation path that currently exists — Plaid sync (`apps/api/src/plaid/plaid.service.ts`), CSV import and manual create (`apps/api/src/transactions/transactions.service.ts`) — for any transaction landing without a category, right before/after it's saved. This method loads the user's active rules once and checks each incoming transaction against them. Exact call-site wiring is left to the implementation plan.

## Frontend

### Transaction view (`apps/web/src/app/transactions/page.tsx`)

Inside the existing inline category picker popover (currently ~lines 1696-1758):
- Add a checkbox below the category list: *"Always categorize [merchant/name text] as this"*, disabled when the row has no usable match text.
- Checking it and picking a category: calls `assignCategory` as today, then `POST /categorization-rules`.
- On success: toast *"Rule created — applied to N other transactions"* (count omitted or "no other matches" when 0); refresh/optimistically update rows that were auto-categorized.
- On `409`: toast *"A rule for [merchant] already exists"* with a link into the Settings rules tab.

### Settings (`apps/web/src/app/settings/page.tsx`)

- Add `'rules'` to the `Tab` union and a `TABS` entry (icon: tag/pin-style).
- New `RulesManager.tsx` component, mirroring `CategoryManager.tsx`'s fetch/list/edit/delete pattern.
- Each row: match text, matched field type badge (merchant/name), target category (with its color/icon), edit and delete actions.
- Edit: inline form with match-text field + category dropdown, same interaction pattern as `CategoryManager`.
- Delete: confirmation dialog, reusing whatever confirm pattern `CategoryManager` uses today.

## Edge cases

- **No match text available:** rule creation disabled for that row.
- **Category deleted:** its rules cascade-delete; they simply disappear from the Settings list.
- **Coincidental cross-type match:** `merchant`-type match wins over `name`-type (see Match logic).
- **Concurrent duplicate creation:** the DB unique constraint is the source of truth; the `409` response handles the race, not just a pre-check in application code.

## Testing plan

No automated test runner is configured in this repo. Verify manually against the running app:
1. Create a rule from a transaction with several uncategorized siblings sharing its merchant → confirm all update and the reported count matches.
2. Edit a rule's category → confirm newly-arriving uncategorized transactions matching it pick up the new category; confirm previously-categorized ones are untouched.
3. Edit a rule's match text → confirm it now applies to the new text going forward.
4. Delete a category that has an active rule → confirm the rule disappears from Settings without error. (Deleting the category also nulls out `categoryId` on any transaction that used it, per `Transaction.categoryRef`'s existing `onDelete: 'SET NULL'` — pre-existing behavior, unrelated to this feature.)
5. Attempt to create a duplicate rule → confirm the `409`/toast/link-to-existing flow.
6. Import a CSV and sync Plaid with an active rule in place → confirm new uncategorized transactions from both paths get auto-categorized.
