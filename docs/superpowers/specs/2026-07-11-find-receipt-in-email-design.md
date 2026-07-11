# Find Receipt in Email (per-transaction) — Design

**Status: APPROVED — Approach A (on-demand targeted search via existing Gmail pipeline).**

## Problem

Looking at a transaction (e.g. `AMAZON MKTPL*XV11W3NZ3 -$42.38`), the user often
doesn't remember what was bought or whether the charge needs splitting. They need
the receipt email, reachable directly from the transaction row.

## Scope (user-approved)

View + link + prefill split: see parsed receipt items in a modal, persist the
link on the transaction (badge on the row), and one click pre-fills the Split
modal with the receipt's line items.

## Existing foundation (reuse, don't rebuild)

- `GmailService` (apps/api/src/gmail/gmail.service.ts): OAuth readonly scope,
  encrypted token storage + refresh, `getAuthorizedClient`, `extractHeader`,
  `extractBody`, `parseWithClaude` (claude-haiku-4-5, returns merchant /
  orderNumber / orderDate / total / items).
- `Receipt` entity (apps/api/src/receipts/receipt.entity.ts): jsonb items,
  unique index on (userId, gmailMessageId) → upserts are idempotent.
- `Transaction.receiptId` column already exists (transaction.entity.ts ~L111),
  currently unused.
- `SplitTransactionModal` (apps/web/src/components/SplitTransactionModal.tsx):
  lines are local state `{ categoryId, amount }[]` — needs only an optional
  `initialLines` prop for prefill.

## API

### `GET /api/transactions/:id/receipt-candidates`

Auth + ownership check on the transaction. Flow:

1. **Local first:** query `receipts` for this user with
   `orderDate BETWEEN tx.date − 4d AND tx.date + 4d` (also include
   `orderDate IS NULL` fallbacks parsed from the same window's sync), rank by
   `abs(total − abs(tx.amount))` then date proximity. If any rows, return them
   (source: 'cache') without touching Gmail.
2. **Gmail fallback:** build query
   `<merchant-term> after:<tx.date − 4d> before:<tx.date + 5d>`.
   Merchant term from an alias map on the normalized tx name:
   - `AMZN`, `AMAZON` → `amazon.com`
   - `WALMART`, `WAL-MART` → `walmart.com`
   - `APPLE.COM`, `APPLE` → `apple.com`
   - `DOORDASH`, `DD *` → `doordash.com`
   - `UBER EATS`, `UBEREATS` → `ubereats.com`
   - fallback: first token of tx.name ≥ 4 chars, stripped of `*`-suffixes and
     store numbers.
   `maxResults: 10`, fetch full messages, parse with `parseWithClaude`, upsert
   each into `receipts` (ON CONFLICT (userId, gmailMessageId) DO UPDATE), return
   ranked candidates (source: 'gmail').
3. **Ranking:** primary `abs(total − abs(tx.amount))` (exact match first),
   secondary `abs(orderDate − tx.date)`. Never auto-link — Amazon splits
   shipments so charge ≠ order total is common; the user picks.
4. **Query param** `window=10` widens the date window for the retry case.
5. If Gmail is not connected → 409 with `{ error: 'gmail_not_connected' }` so
   the UI shows the connect CTA (existing check: `GmailService.getConnection`).

### `PATCH /api/transactions/:id/receipt`

Body `{ receiptId: string | null }`. Ownership check on BOTH the transaction and
the receipt (ForbiddenException otherwise — same IDOR pattern as the June 2026
hardening). Null clears the link.

### Response shape (candidate)

```json
{
  "id": "receipt uuid",
  "gmailMessageId": "...",
  "merchant": "Amazon",
  "orderNumber": "112-...",
  "orderDate": "2026-07-01",
  "total": 42.38,
  "currency": "USD",
  "items": [{ "name": "...", "quantity": 1, "unitPrice": 42.38, "total": 42.38 }],
  "rawSubject": "Your Amazon.com order...",
  "amountDelta": 0.00,
  "source": "cache" | "gmail"
}
```

## Web UI

- **Row button:** receipt icon next to the Categorize control on each
  transaction row (transactions page). Hidden for split children/parents'
  children as appropriate; shown for normal rows.
- **FindReceiptModal** (new component, follows CategoryFormModal/glass style):
  - Loading state ("Searching your email…").
  - Ranked candidate cards: merchant + orderDate + total (highlight green when
    `amountDelta === 0`) + subject; expandable item list.
  - Per candidate: **Link receipt** · **Open in Gmail**
    (`https://mail.google.com/mail/u/0/#all/<gmailMessageId>`) ·
    **Split from items** (links the receipt, then opens SplitTransactionModal
    prefilled).
  - No matches: "Widen search to ±10 days" retry + Gmail web-search fallback
    link (`https://mail.google.com/mail/u/0/#search/<term>+$<amount>`).
  - `gmail_not_connected`: CTA linking to Settings → Integrations.
- **Linked badge:** rows with `receiptId` show a small receipt chip; clicking
  opens a receipt viewer (same modal, single receipt, no search) with an
  "Unlink" action.
- **Split prefill:** add optional `initialLines?: SplitLine[]` prop to
  SplitTransactionModal; seed from receipt items
  (`{ categoryId: '', amount: item.total.toFixed(2) }`), first line keeps
  tx.categoryId. Item names shown as placeholders/hints where the design
  allows; category assignment stays manual.
- Transactions list fetch must include `receiptId` (verify the serializer
  returns it; add to the web `Transaction` type).

## Edge cases

- Refunds (positive amounts): same search, match on `abs(amount)`.
- Multiple orders same day: ranked list handles it; user picks.
- Parse failure: existing fallback receipt shape ("check email for details")
  still appears as a candidate with total 0 (ranked last).
- Gmail token revoked: surfaces as `gmail_not_connected` CTA.

## Module wiring

- `TransactionsModule` imports `GmailModule` (exports GmailService) and
  registers `Receipt` in its TypeOrmModule (remember: also add nothing new to
  database.config.ts — Receipt and all entities are already registered).
- New service method(s) live in a dedicated
  `apps/api/src/transactions/receipt-finder.service.ts` to keep
  TransactionsService focused.

## Verification

1. `npm run build:api` clean.
2. Playwright vs dev server, API routes mocked: modal states (candidates,
   no-match retry, not-connected CTA), link badge appears, split modal opens
   prefilled with mocked items.
3. Real end-to-end (user-assisted): connect Gmail in Settings → Integrations,
   click Find receipt on a real Amazon transaction, confirm candidates, link,
   split.
