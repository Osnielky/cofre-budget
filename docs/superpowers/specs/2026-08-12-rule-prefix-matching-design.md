# Rule Prefix Matching

**Date:** 2026-08-12
**Status:** Approved for planning

## Problem

Categorization rules match on the exact, full text of a transaction's `merchantName` or `name`. That works well for merchants whose name is stable across visits (e.g. "STARBUCKS"), but fails for ACH/payroll-style transactions whose description embeds a unique per-transaction identifier (e.g. `ALPHA STAFFING & DES:PAYROLL ID:9356403449937TK INDN:ROQUE PAZ,OSNIELKY CO ID:9111111102 PPD`). Every occurrence of this kind of transaction has a different id, so an exact-match rule created from one instance will never match the next one — "always categorize my paycheck as Salary" is currently impossible to express for these transactions.

## Goal

Add an optional "starts with" match strategy alongside the existing exact match, so a rule can be edited (in Settings) to match on a stable prefix instead of the full string.

## Non-goals

- No change to the one-click "Make permanent" creation flow — it keeps creating exact-match rules by default, since that's already correct for the common case (stable merchant names). Switching a rule to prefix matching is a deliberate, secondary edit made in Settings, not a choice presented at creation time.
- No fuzzy/substring/regex matching — "starts with" is the only new strategy, chosen for being predictable and easy to reason about (a rule's match text is always a literal prefix of what it will match, never an arbitrary substring).
- No categorization-source indicator changes. The existing pin (📌) already shows exactly what was asked for: it appears whenever `categorizedByRuleId` is set, regardless of which match strategy produced the match. Nothing about the indicator needs to change for this feature.
- No AI-categorization work. Per the decision made when scoping this, that's explicitly out of scope until it's a real feature — this plan does not add any schema or hooks for it. `categorizedByRuleId` continues to unambiguously mean "a rule did this"; a future AI-categorization feature would add its own sibling column when it's actually built, not something reserved here.

## Data model change

Add `matchStrategy: 'exact' | 'prefix'` to `CategorizationRule`, defaulting to `'exact'` for all newly-created rules (including every rule the one-click flow creates — no behavior change there).

The existing DB unique constraint `@Unique(['userId', 'matchType', 'matchValue'])` extends to `@Unique(['userId', 'matchType', 'matchValue', 'matchStrategy'])`, so an exact rule and a prefix rule can coexist for the same `matchType`/`matchValue` pair without being treated as duplicates of each other — they're genuinely different rules with different effects.

## Matching logic

`CategorizationRulesService.matchRule()` and the retroactive bulk-apply (`applyToUncategorized`) both need to branch on `matchStrategy`:

- `exact` (existing behavior): case-insensitive, trimmed equality.
- `prefix` (new): case-insensitive, trimmed "starts with" — the candidate's `merchantName`/`name`, once trimmed and lowercased, must start with the rule's `matchValue`, itself trimmed and lowercased. (The rule's `matchValue` is not itself required to be trimmed-and-lowercased in storage — comparison does that at match time, matching how exact-match already works today.)

**Precedence when a transaction could match more than one active rule:** merchant-type still wins over name-type (unchanged from today), and *within* each type, an exact match wins over a prefix match (exact is the more specific claim). So the checked order is: merchant+exact → merchant+prefix → name+exact → name+prefix, stopping at the first hit.

## Duplicate detection

The existing 409-on-duplicate check (at both create and update time, plus the DB-level race-condition backstop already in place from the original build) extends its comparison to include `matchStrategy` — two rules are only "the same rule" if they share `userId`, `matchType`, `matchValue` (case-insensitively), *and* `matchStrategy`. An exact rule and a prefix rule with identical match text are allowed to coexist.

## Frontend changes

- **Settings → Categorization Rules (`RulesManager.tsx`) edit form**: add a small "Exact / Starts with" toggle alongside the existing match-text field and category dropdown. Editing a rule's `matchValue` and/or `matchStrategy` together is a single save, using the existing `PATCH /categorization-rules/:id` endpoint (extended to accept `matchStrategy` in its body).
- **List view**: each rule row shows its strategy (e.g. a small "Starts with" badge next to the existing "Merchant"/"Description" match-type badge) so a user can tell at a glance which rules are prefix-based.
- **No change to the transaction view.** The "Make permanent" button and the pin indicator are untouched — they already work correctly regardless of which strategy a rule uses, since both read/write through the same `categoryId`/`categorizedByRuleId` fields.

## Edge cases

- **Editing an exact rule to "starts with" without shortening the match text**: harmless — a prefix rule whose `matchValue` happens to equal the full original string will only match transactions whose name is exactly that string or longer with that exact text at the start, which is a strict superset of what the exact rule matched before (in practice, usually behaves identically until the user actually shortens the text to a real prefix).
- **A prefix rule that's too short/broad** (e.g. matching a two-letter prefix that hits many unrelated merchants): this is a user-authored risk, same category as picking a bad match value today — no additional validation is added, consistent with this repo's existing "trust the user" posture for rule text.
- **Retroactive apply on edit**: unchanged behavior — editing a rule's `matchValue`/`matchStrategy` re-runs the bulk apply against the user's currently-uncategorized transactions using the new values, exactly as it already does for `matchValue`-only edits today.

## Testing plan

No automated test runner exists for either app. Verify manually against the running app:
1. Create a rule the normal way (one-click, exact) from a payroll-style transaction, confirm it does NOT retroactively or prospectively match a differently-numbered payroll deposit (confirms exact stays exact, no regression).
2. In Settings, edit that rule: shorten the match text to a stable prefix and toggle to "Starts with." Confirm the retroactive apply now picks up the user's other, differently-numbered payroll deposits.
3. Import a new CSV transaction / sync a new Plaid transaction whose name starts with that same prefix (different unique id) → confirm it auto-categorizes and shows the pin.
4. Attempt to create a second rule with identical match text but the other strategy (one exact, one prefix) → confirm both are allowed to exist, no 409.
5. Attempt to create a genuine duplicate (same match text, same strategy) → confirm the existing 409 flow still fires.
6. Confirm the rule list in Settings shows the correct strategy badge for both kinds of rules.
