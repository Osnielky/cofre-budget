# Transfer kinds — design

Date: 2026-10-21
Status: built (same day)

## Problem

Money moved to the user's own investment account (Charles Schwab) had to be encoded
in two places: a category on the checking side (Internal Transfer vs Investments decided
whether it counted as "invested") and a link between the two legs. Linking copied the
category of whichever side the user started from, so starting from the Schwab side
silently turned the checking leg into a plain transfer. Dividends and trades inside the
investment account also showed up as "uncategorized" although they never count.

## Decision

At link time the dialog asks **what the movement is**, offers only the options that
make sense for the two account types, and shows in plain words how each side will be
recorded. The server resolves the categories for both sides from that choice.

| Kind | Offered when | Sending side | Receiving side |
|---|---|---|---|
| `savings` (default) | receiving account is savings or investment | Investments (savings type) | Internal Transfer |
| `capital_return` (default) | sending account is investment/savings, receiving is a budget account | Internal Transfer | Investments (a withdrawal of savings) |
| `investment_income` | sending account is investment | Internal Transfer | Investment income (new default income category) |
| `card_payment` (only) | receiving account is credit / line of credit | Credit Card Payment | Credit Card Payment |
| `internal` | everything else, and always as an alternative | Internal Transfer | Internal Transfer |

Why `capital_return` is the default out of an investment account: money you take back
was already yours; counting it as income would inflate the month. The user picks
"Gains from investing" when it is profit.

## Pieces

- API: `transactions/transfer-kind.ts` (pure, tested), `updateTransferAccount(..., kind)`
  validates the kind against the pair, creates missing categories from
  `TRANSFER_CATEGORY_DEFAULTS`, writes both sides, returns `counterpart`. Linking to a
  bare account (cash) keeps the row's category. `Investment income` joins the seeded
  defaults. Ask Cofre's `uncategorizedOnly` skips tracking accounts.
- Web: `lib/transactions/transferKind.ts` mirrors the options and builds the
  explanation; `LinkTransferModal` shows a "What is this movement?" choice (when more
  than one option) and a "This is how it will be recorded" block with the category and
  effect of each side; the transactions page passes the kind, only pre-assigns a
  category for bare-account links, and treats tracking-account rows as not needing a
  category (count, filter, per-group badges, row label).

## Not done

Automatic detection of transfer pairs on import/sync (still manual via the picker's
transfer step and the dialog's suggestions). Existing links are untouched; re-linking
applies the new rule.
