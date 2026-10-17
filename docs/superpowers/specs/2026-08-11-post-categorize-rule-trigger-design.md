# Post-Categorize Rule Trigger & Provenance Indicator

**Date:** 2026-08-11
**Status:** Approved for planning

## Problem

The shipped "permanent categorization rules" feature (see [2026-08-07-permanent-categorization-rules-design.md](./2026-08-07-permanent-categorization-rules-design.md)) triggers rule creation from a checkbox inside the category picker, checked *before* picking a category. In practice this is backwards: the natural moment to think "always do this" is *after* you've just categorized a transaction, not while you're still choosing. There's also no way to tell, at a glance, which transactions got their category from a rule versus a deliberate manual pick, and no quick way to undo a single rule-applied categorization without going to Settings.

## Goal

Replace the checkbox-in-picker trigger with a post-categorize nudge, and add a visual indicator + inline revert for rule-applied transactions:

1. After a transaction is categorized (manually, as today), a small "Make permanent" button appears on that row.
2. Clicking it creates the rule (same backend call as before) and applies it retroactively, same as today.
3. Any transaction whose category was actually *set by a rule* (not a manual pick that happens to match) shows a small pin indicator.
4. Clicking the pin offers to uncategorize just that transaction, or delete the rule entirely.

## Non-goals

- No change to the rule matching logic, the Settings Rules tab, or the CRUD API's request/response shapes.
- No backfill migration — this feature has no real-world usage yet (shipped to `dev`, not deployed), so no existing transaction needs retroactive provenance data.
- No support for rules on transfer/project categories (unchanged from the original design).

## Data model change

Add `categorizedByRuleId` to `Transaction`: nullable, `ManyToOne` → `CategorizationRule`, `onDelete: 'SET NULL'`.

This is the only reliable way to distinguish "a rule set this" from "a human happened to pick the same category a rule would have." Matching on merchant text alone isn't enough — a manual pick can coincidentally match an existing rule's match value.

- **Set** whenever a rule categorizes a transaction: the retroactive bulk-apply that runs at rule create/edit time, and the auto-apply that runs on new transactions arriving via Plaid sync, CSV import, or manual entry.
- **Not set** on the transaction a user manually categorized right before clicking "Make permanent" — that categorization was a deliberate choice, not the rule acting on its own, so it shouldn't carry the "ruled" indicator.
- **Cleared to null** whenever a transaction's category changes for any reason — a new manual pick, or explicit "uncategorize this one" — since the current category is no longer rule-derived once a human changes it.
- **Cleared automatically when the rule is deleted**, via the FK's `onDelete: 'SET NULL'`. This is a plain null-out on one column, not a dependent-row cleanup, so — unlike the `Budget`/`CategorizationRule` cleanup on category delete, which this codebase deliberately does not trust to a declarative cascade — relying on the DB here is fine and consistent with how `Transaction.categoryRef` already behaves.

## Backend changes

- `CategorizationRulesService.applyToUncategorized` (used by both rule `create()` and `update()`): also sets `categorizedByRuleId = rule.id` on every row the bulk `UPDATE` touches.
- `PlaidService.syncTransactions`, `TransactionsService.importCsv`, `TransactionsService.createManual`: wherever `matchRule()` finds a match and sets `categoryId`, also set `categorizedByRuleId` to that rule's id.
- `TransactionsService.updateCategory`: whenever `categoryId` changes (to a new category, or cleared to `null`), also set `categorizedByRuleId = null`. This single change covers both "user manually re-picks a category" and the new "uncategorize this one" action — both call this same method.
- `TransactionsService.findByUser` (backing `GET /transactions`): join and expose `categorizedByRuleId` plus enough of the rule for the frontend to act on it without a second fetch — a `categorizedByRule: { id: string; matchValue: string } | null` shape is sufficient (id to delete, matchValue for a confirmation message).
- No change to `POST /categorization-rules`, `PATCH/DELETE /categorization-rules/:id`, or their response shapes. The only behavioral difference is *when* the frontend calls `POST /categorization-rules` — after the category is already assigned, not bundled with the assignment.

## Frontend changes

### Remove

The checkbox-in-picker mechanism added by the original build: `pickerMakePermanent` state, its reset `useEffect`, the `chooseCategory` wrapper function, and the checkbox JSX inside the category picker's "Normal categories" block. The picker's category buttons go back to calling `assignCategory` directly.

### Add: post-categorize nudge

- New state `justCategorizedId: string | null`. Set to the transaction's id immediately after `assignCategory` succeeds with a real, non-transfer category (not on assigning `null`, not on a transfer-category pick, which routes through the separate transfer modal instead of `assignCategory`).
- While `justCategorizedId === tx.id`, that row renders a small inline button next to its category chip: **"Make permanent"**, plus a small dismiss (×). Clicking "Make permanent" calls `POST /categorization-rules` (the existing `createRule` logic — created/duplicate/error toast outcomes unchanged) and clears `justCategorizedId`. Dismissing, or doing anything else with that row (re-picking its category, etc.), also clears it.
- This is a one-time, per-action nudge — it does not persist across a page reload or apply to rows the user didn't just touch.

### Add: rule-provenance pin

- Any row where `tx.categorizedByRuleId` is non-null renders a small pin icon (📌) next to the category chip — independent of `justCategorizedId`, this is a durable indicator driven by the API response, present every time the row renders (including after reload).
- Clicking the pin opens a small dropdown with two actions:
  - **"Uncategorize this one"** — calls the existing `assignCategory(tx.id, null)`. The backend's `updateCategory` change above already clears `categorizedByRuleId` as a side effect of clearing `categoryId`.
  - **"Delete the rule"** — calls `DELETE /categorization-rules/${tx.categorizedByRuleId}` (same endpoint Settings uses), then refreshes the transaction list. Other transactions that rule had categorized keep their `categoryId` (rules never retroactively undo on delete, per the original design) but lose their pin, since their `categorizedByRuleId` is nulled by the FK.

## Edge cases

- **Re-picking a category on an already-pinned row**: the backend clears `categorizedByRuleId` (pin disappears) as part of the normal `updateCategory` flow. Since it's now a fresh manual pick, `justCategorizedId` gets set for it too, so the "Make permanent" nudge appears — consistent with any other manual categorization.
- **Transfer/project category picks**: never set `justCategorizedId`, so no nudge appears — matches the original design's decision that rules don't apply to transfer categories.
- **No backfill**: no real-world data exists yet for this feature (see Non-goals), so no migration is needed to populate `categorizedByRuleId` for previously-created rules.

## Testing plan

No automated test runner exists for either app. Verify manually against the running app:
1. Manually categorize an uncategorized transaction → confirm the "Make permanent" button appears on that row and only that row.
2. Click it → confirm the rule is created, sibling uncategorized transactions with the same merchant get auto-categorized, and — critically — the *originating* row does NOT show the pin (it was a manual pick), while the *sibling* rows now DO show the pin.
3. Dismiss the nudge on a different row without clicking it → confirm it disappears and no rule is created.
4. Reload the page → confirm pins persist on rule-categorized rows, and the (already-dismissed-or-acted-on) nudge does not reappear anywhere.
5. Click a pin → "Uncategorize this one" → confirm that transaction goes back to uncategorized and its pin disappears, while other rule-categorized transactions are unaffected.
6. Click a pin → "Delete the rule" → confirm the Settings Rules tab no longer lists it, all transactions it had categorized keep their category, and all of their pins disappear.
7. Manually re-categorize a pinned row to a different category → confirm its pin disappears and a fresh "Make permanent" nudge appears for the new category.
8. Confirm no nudge appears when assigning a transfer category.
