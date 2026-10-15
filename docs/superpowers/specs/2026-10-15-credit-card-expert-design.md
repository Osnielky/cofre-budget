# Credit card expert — design

Date: 2026-10-15 · Status: approved in chat, pending spec review

## Goal

Make Ask Cofre a credit card expert. It knows every card the user holds (balances,
limits, APRs, due dates, rewards, fees), says which card to use for which purchase,
plans debt payoff — including moving balances to 0% balance-transfer cards when that
beats paying down in place — recommends new cards that fit the user's goals with
commission-earning apply links, and judges a card offer the user pastes or uploads.

Success:
- A user who links a supported issuer sees each card's APR, limit, utilization,
  statement balance, minimum payment and due date on `/cards` without typing anything.
- Asking "which card for groceries?", "how do I pay off my cards fastest?", or
  "should I take this offer?" (with an attached mailer) returns an answer whose every
  number comes from tested math over the user's real data, not from the model.
- Recommendations are ranked only by the user's net benefit; an affiliate apply link
  appears, with disclosure, only on a card that wins on those terms.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Card terms source | Self-curated catalog (~50–100 popular US cards) + AI extraction for anything else, user-confirmed; affiliate network feed becomes source of truth for affiliate cards once approved |
| Plan gating | Card data (Liabilities, `/cards`) for every plan; advice runs through Ask Cofre and its existing daily limits (Pro 25, Elite 50) |
| Offer input | Pasted text, or an image / PDF attached in Ask Cofre |
| User objectives | Stored card profile (goal, annual-fee tolerance, credit score band, monthly debt budget, planned purchase) |
| Storage | New tables beside `bank_accounts` (approach A); `bank_accounts` and `debts` unchanged in meaning |
| Affiliate | Neutral ranking (commission never enters the math) + disclosed links on winning cards only |
| Debt planning | Avalanche baseline vs. balance-transfer plans; transfer recommended only when it saves money and the required payment fits the budget |

## Build order

Each phase ships independently and gets its own implementation plan.

1. **Card data** — Liabilities sync, `credit_card_details`, manual entry, `/cards`, card profile.
2. **Catalog** — `card_products`, seed, admin editing, account↔product linking, category mapping.
3. **Advisor** — math modules, Ask Cofre tools, payoff planner, new-card recommendations.
4. **Offer analysis** — chat attachments, AI term extraction, confirm flow, `analyze_card_offer`.
5. **Affiliate** — apply links, disclosure, click tracking, network feed import. Schema
   fields land in phase 2 so links can go live as soon as a network approves Cofre.

## 1. Card data

### Plaid

- `linkTokenCreate` (`plaid/plaid.service.ts`) keeps `products: [Transactions]` and adds
  `optional_products: [Products.Liabilities]`, so new links get Liabilities where the
  institution supports it without failing where it doesn't.
- Existing Items: `/cards` shows **"Enable card details"** on credit accounts with no
  Liabilities data. It opens Link in update mode with Liabilities as an additional
  consented product (`POST /api/plaid/liabilities-token/:itemId` returns an update-mode token with `additional_consented_products: [liabilities]`; `POST /api/plaid/liabilities/:itemId/complete` runs the sync after Link succeeds).
- Account sync already reads Plaid accounts; it additionally stores `balances.limit`
  and `official_name` into `credit_card_details` for credit-type accounts.
- `syncLiabilities(item)` calls `liabilitiesGet` wrapped in
  `timed('plaid', 'liabilitiesGet', …)`. It runs after the initial sync in `confirmExchange`, after a manual sync, after a reconnect or consent, and on the `LIABILITIES/DEFAULT_UPDATE` webhook.
- `PRODUCTS_NOT_SUPPORTED` / `PRODUCT_NOT_READY` / not-consented errors are expected
  states, not failures: set `liabilitiesStatus` on the detail row (`unsupported` |
  `not_consented` | `pending`) and log at info level with the error code only.

### `credit_card_details` (one per credit account)

| Column | Notes |
|---|---|
| `id` uuid, `userId`, `bankAccountId` (unique, FK cascade) | |
| `creditLimit` decimal | Plaid `balances.limit` or manual |
| `officialName` | Plaid `official_name`, used for catalog matching |
| `aprs` jsonb | `[{type: purchase\|balance_transfer\|cash_advance\|special, percentage, balanceSubjectTo, interestCharged}]` |
| `lastStatementBalance`, `lastStatementDate` | |
| `minimumPayment`, `nextPaymentDueDate` | |
| `lastPaymentAmount`, `lastPaymentDate`, `isOverdue` | |
| `promoAprEndsOn` date | manual only — Plaid does not provide it |
| `rewardsBalance` decimal, nullable | manual only |
| `productId` FK → `card_products`, nullable | phase 2 |
| `liabilitiesStatus` | `synced` \| `unsupported` \| `not_consented` \| `pending` \| `manual` |
| `manualFields` text[] | names of fields the user edited by hand |
| `manualEditedAt` timestamp | |
| `plaidData` jsonb | last Plaid report, used by "Use bank data" |
| `liabilitiesSyncedAt` timestamp | |

`aprs` and `plaidData` are `simple-json`; `manualFields` is `simple-array`.

**Manual-override rule:** a field listed in `manualFields` is not overwritten by sync,
except that a Plaid statement with a `lastStatementDate` later than the manual edit
replaces statement-derived fields (statement balance, minimum payment, due date) and
removes them from `manualFields`. APRs and limit edited by hand stay until the user
clicks "Use bank data". A null from Plaid never erases a stored value.

Detail rows are created lazily the first time a credit account is listed or synced (no backfill).

### `/cards` page (web, responsive)

- Header: total utilization (sum balances ÷ sum limits) with a 30% marker.
- One tile per credit card: name + linked product, balance / limit with utilization
  bar, purchase APR (and promo APR + end date when set), next due date + minimum
  payment, overdue badge. Tiles with missing data show the reason and the fix
  ("Enable card details", "Add APR").
- Tile → detail drawer with the manual-edit form.
- Card profile form (below the tiles, collapsible once filled).
- Colors from theme variables only; utilization bar uses status colors, not chart
  series colors.
- Nav entry "Cards" after Debts (accounts live in Settings, there is no Accounts nav item).

### `card_profiles` (one per user)

`goal` (`pay_off_debt` \| `cashback` \| `travel` \| `build_credit`),
`annualFeeOk` boolean, `creditScoreBand` (`<580` \| `580-669` \| `670-739` \| `740-799` \| `800+`),
`monthlyDebtBudget` decimal nullable, `plannedPurchaseAmount` decimal nullable,
`plannedPurchaseNote` varchar(120) nullable. Saved via `pickFields`.

## 2. Catalog

### `card_products`

| Column | Notes |
|---|---|
| `id`, `issuer`, `name`, `network` | |
| `aliases` text[] | lowercase strings matched against `officialName` |
| `annualFee`, `annualFeeWaivedFirstYear` | |
| `rewards` jsonb | `{base: {rate, unit}, categories: [{category, rate, unit, capAmount?, capPeriod?}]}`; `unit` = `cashback` \| `points` \| `miles` |
| `pointValueCents` decimal | default valuation per point/mile (cashback = 1.0) |
| `purchaseAprMin`, `purchaseAprMax` | regular (go-to) APR range |
| `cashAdvanceApr` | |
| `introPurchaseApr`, `introPurchaseMonths` | nullable |
| `introTransferApr`, `introTransferMonths`, `transferFeePct`, `transferFeeMin` | nullable |
| `foreignTxFeePct` | |
| `signupBonusValue`, `signupBonusUnit`, `signupBonusSpend`, `signupBonusMonths` | nullable |
| `targetScoreBand` | same values as profile |
| `applyUrl`, `isAffiliate`, `affiliateNetwork`, `disclosureText` | phase 5 uses |
| `source` | `curated` \| `network_feed` \| `ai_extracted` |
| `ownerUserId` nullable | set ⇒ private to that user; null ⇒ shared catalog |
| `termsVerifiedAt`, `active`, timestamps | |

Every read of `card_products` filters `ownerUserId IS NULL OR ownerUserId = :userId`
through one repository helper; no other query path exists.

### Sources

1. **Seed** — a data migration inserting the curated US cards (`source = curated`).
2. **Admin** — `/admin/cards`: list, edit, deactivate, promote a private
   `ai_extracted` product to shared (copies it with `ownerUserId = null`, `source =
   curated`, fresh `termsVerifiedAt`). Feed-sourced rows are read-only.
3. **AI extraction** (phase 4) — creates private products.
4. **Network feed** (phase 5) — import job upserts by network product ID and overwrites
   terms with the network's approved copy.

Rows with `termsVerifiedAt` older than 12 months are flagged in admin.

### Linking accounts to products

- After sync, `matchProduct(officialName, accountName, bankName)` scores catalog rows
  by issuer + alias/name token overlap. Score ≥ threshold ⇒ suggestion shown on the tile
  ("Is this your Chase Sapphire Preferred?" — Confirm / Not this card). Never
  auto-linked without a tap.
- No suggestion ⇒ "Which card is this?" with catalog search and "Add from terms"
  (opens Ask Cofre extraction, phase 4).

### Reward category mapping

`reward_category_map`: reward category key (`dining`, `groceries`, `gas`, `travel`,
`streaming`, `drugstore`, `transit`, `online_retail`, `other`) ↔ the user's
transaction category IDs. Seeded per user by matching default category names; editable
in the card profile section. Unmapped categories earn the base rate.

## 3. Advisor

### Math (`apps/api/src/cards/math/`, pure functions, no I/O)

Commission and affiliate fields are **not part of any math input type**. Ranking takes
`CardTerms` (a type without `applyUrl`, `isAffiliate`, `affiliateNetwork`); the service
maps products to `CardTerms` before calling it.

- **`rewards.math.ts`**
  - `annualRewardsValue(spendByRewardCategory, terms)` → dollars/year, applying caps
    and `pointValueCents`.
  - `bestCardPerCategory(spend, userCards)` → for each category, the user's card that
    earns most.
  - `netAnnualValue(spend, terms, {year: 1 | 2})` = rewards − annual fee (first-year
    waiver honored) + signup bonus in year 1 only when the user's average spend reaches
    `signupBonusSpend` within `signupBonusMonths`.
- **`payoff.math.ts`**
  - `simulateAvalanche(debts, monthlyBudget)` — month-by-month: interest accrues at
    APR/12 on each balance, minimums paid on all, remainder to the highest APR.
    Returns schedule, total interest, payoff month. Budget below the sum of minimums ⇒
    `{feasible: false}`.
- **`transfer.math.ts`**
  - `evaluateTransfer(debts, monthlyBudget, transferTerms, assumedLimit)` — moves the
    highest-APR balances first up to `assumedLimit` minus fee, adds the fee
    (`max(pct × amount, min)`), runs the promo period at the intro APR then go-to APR
    (upper bound of range) on what remains; other debts follow avalanche.
  - Returns net savings vs. the avalanche baseline, monthly payment needed to clear the
    transferred balance inside the promo, and whether that fits the budget.
  - `assumedLimit` by score band: `<580` 0 (no transfer), `580-669` $1,000,
    `670-739` $3,000, `740-799` $6,000, `800+` $10,000 — stated as an assumption in
    the answer.
  - Recommend only when savings ≥ max($100, 5% of baseline interest) **and** the
    required payment fits the budget; otherwise return the avalanche plan with the reason.
- **`offer.math.ts`**
  - `scoreOffer(terms, userData)` → year-1 and ongoing net value, intro APR savings
    on the user's actual balances, fees; verdict `take` \| `skip` \| `conditional`
    with the condition (e.g. "only if you pay the transferred $4,200 within 15 months").

### Ask Cofre tools (`ai-read-tools.service.ts`, declared in `ai-chat.service.ts`)

| Tool | Returns |
|---|---|
| `get_credit_cards` | per card: balance, limit, utilization, APRs, due date, minimum, linked product summary, data status |
| `get_best_card_for` `{category? , merchant?}` | ranked user cards for that spend with reward value per $100 |
| `get_card_strategy` | category → card table, utilization warnings (card > 30%, total > 30%), upcoming due dates, cards whose annual fee exceeds their rewards |
| `get_debt_payoff_plan` `{monthlyBudget?}` | avalanche baseline + best transfer option (or why none) |
| `recommend_new_cards` `{goal?, limit?=3}` | top catalog cards by `netAnnualValue` (or transfer savings when goal is `pay_off_debt`), filtered by score band and annual-fee preference; each with `applyUrl` + `disclosureText` when affiliate |
| `analyze_card_offer` `{extractedProductId}` | `scoreOffer` result |

Tools default `monthlyBudget` from the profile, then from safe-to-spend. Missing
profile ⇒ tool returns `{needsProfile: [fields]}`; Claude asks, then uses a new
`propose_save_card_profile` pending action.

### System prompt additions

- Quote card terms only from tool results, with "terms last verified <date>".
- Approval is never guaranteed; applying causes a hard inquiry; a transfer can raise
  utilization temporarily.
- Never advise closing the oldest card without explaining the credit-history and
  utilization effect.
- When an apply link is shown, show its disclosure.

## 4. Offer analysis

- Ask Cofre composer gets a 📎: image (jpeg/png/heic) or PDF, size cap and MIME check
  copied from `receipts.controller.ts`; pasted text works without an attachment.
- The file goes to Claude as an image/document block in that turn; it is not stored.
- Extraction is a dedicated, non-chat call with a JSON schema matching the
  `card_products` term fields plus a `confidence` per field. Output becomes a
  `ai-pending-action` "Confirm these terms" card showing the extracted values;
  low-confidence fields are highlighted and editable.
- Confirm ⇒ private `card_products` row (`source = ai_extracted`, `ownerUserId`),
  then `analyze_card_offer` runs. The same flow powers "Add from terms" for linking
  an existing card.
- Extraction counts as one Ask Cofre message toward the daily limit.

## 5. Affiliate

- `GET /api/cards/apply/:productId` (auth required) → checks the product is visible to
  the user and has `applyUrl`, inserts `card_apply_clicks {userId, productId, source:
  chat|cards_page, createdAt}`, 302 to `applyUrl`. Unknown/invisible ⇒ 404.
- The web never links to `applyUrl` directly.
- Apply buttons always render `disclosureText` beside them, plus a link to a static
  "How Cofre makes money" page.
- Non-affiliate winners render with no button and the line "Apply on the issuer's site".
- Admin: clicks per product per month.
- Network feed import: scheduled job per approved network; specifics (network, feed
  format) are decided when an application is approved and get their own plan.

## Errors

| Situation | Behavior |
|---|---|
| Institution doesn't support Liabilities | Tile shows manual-entry form; advisor uses manual data |
| Liabilities not consented on an old Item | "Enable card details" CTA |
| Card has no APR (no data, no manual) | Excluded from payoff/transfer math; answer names it |
| Card not linked to a product | Excluded from rewards advice; answer names it |
| Extraction fails / low confidence everywhere | Confirm card opens as an empty form |
| Monthly budget < sum of minimums | Plan says so; no transfer recommendation |

## Logging and privacy

Log product IDs, counts, status codes and durations only — no balances, limits, APRs,
amounts, card names typed by users, or offer text. Attachments are never persisted.

## Testing (Vitest)

- Math: table-driven cases with hand-checked answers — avalanche ordering and total
  interest, budget below minimums, promo shorter than payoff, fee larger than savings,
  limit smaller than balance, reward caps, first-year fee waiver, unreachable signup
  bonus.
- Neutral ranking: identical terms with `isAffiliate` true/false rank identically; a
  compile-time check that `CardTerms` has no affiliate keys.
- Liabilities mapping from a fixture `liabilitiesGet` response (sqlite service test);
  unsupported/not-consented errors set status, don't throw.
- Manual-override rule, including the newer-statement exception.
- Private products: user B cannot read, link, analyze or click through user A's
  extracted product.
- Apply redirect: logs a click, 302s, 404s for invisible products.
- `pickFields` on profile and detail edits (a client-sent `id`/`userId` is ignored).
- Migrations for every new entity so `migrations.test.ts` passes.

## Out of scope

- Credit score retrieval (user-entered band only).
- Applying for cards inside Cofre; pre-qualification APIs.
- Automatic payments or moving money.
- Non-US cards.
- Rewards balances from issuers (manual only).
