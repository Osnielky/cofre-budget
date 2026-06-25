# Gmail Receipt Lookup — Design Spec

**Date:** 2026-06-25
**Status:** Approved

## Summary

Connect a user's Gmail account (read-only OAuth) so they can browse merchant receipt emails inside Cofre as a reference tool. When viewing a receipt's itemized breakdown, the user can assign Cofre categories to individual line items and create multiple transactions from a single order.

The receipt is **informational** — it helps the user make deliberate categorization decisions, not auto-import transactions.

---

## Architecture

Two new API modules and two new web pages slot into the existing NestJS + Next.js structure:

| Layer | What's added |
|---|---|
| API: `gmail/` module | OAuth connect/disconnect, token storage, Gmail search, AI parsing |
| API: `receipts/` module | Cached parsed receipts entity + CRUD |
| Web: `settings/connected-apps` page | Connect/disconnect Gmail UI |
| Web: `receipts/` page | Browse receipts, split items, create transactions |

Gmail tokens (access + refresh) are stored encrypted in a `connected_apps` table per user. The Receipts screen fetches receipts on demand — no background jobs. Parsed receipts are cached in a `receipts` table so Claude is called only once per email.

---

## Connected Apps (Settings)

A new "Connected Apps" card in the Settings page.

**UI states:**
- **Not connected:** Gmail row shows "Not connected" + "Connect" button
- **Connected:** Shows "Connected as john@gmail.com" + connected-on date + "Disconnect" button

**OAuth flow:**
1. User clicks Connect → API generates a Google OAuth URL (scope: `gmail.readonly`)
2. Browser redirects to Google consent screen
3. User grants permission → Google redirects to `/api/gmail/callback?code=...`
4. API exchanges code for access + refresh tokens → stored encrypted in `connected_apps`
5. User redirected back to Settings with success state

**Disconnect:** Revokes the Google token and deletes the row from `connected_apps`.

**New environment variables:**
```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI   # e.g. https://yourapp.com/api/gmail/callback
```

---

## Receipts Screen

New page at `/receipts`.

**Empty state (no Gmail connected):**
> "Connect your Gmail to find receipts" — link to Settings → Connected Apps

**Loaded state:**
- List of receipt cards ordered by date (newest first)
- Each card: merchant name, order date, order number, total amount, status badge ("Pending" / "Imported")

**Receipt detail view (on click):**
- Itemized line-item table: item name, unit price, total
- Each item has a category dropdown (existing Cofre categories)
- Items sharing the same category are visually grouped
- Bottom action: **"Create [N] transactions"** — one per distinct category assigned
- Items left uncategorized are bundled into one "Uncategorized" transaction so no amount is lost
- Once created, receipt status flips to "Imported"

---

## Receipt Parsing (AI)

When a new email is fetched from Gmail for the first time:

1. API queries Gmail using stored OAuth token, filtering by known merchant sender addresses (Amazon, Uber Eats, DoorDash, Walmart, Apple, etc.)
2. Raw HTML email body is sent to Claude with a structured extraction prompt
3. Claude returns:

```json
{
  "merchant": "Amazon",
  "orderNumber": "113-1234567-8901234",
  "orderDate": "2026-06-25",
  "currency": "USD",
  "total": 67.48,
  "items": [
    { "name": "USB cable", "quantity": 1, "unitPrice": 12.99, "total": 12.99 },
    { "name": "Shampoo", "quantity": 1, "unitPrice": 8.50, "total": 8.50 }
  ]
}
```

4. Result saved to `receipts` table — Claude is **never called again** for the same email

**Fallback:** If parsing fails, the receipt is saved with just the total and merchant; items show as a single line "Order total — $X.XX".

**Initial merchant filter (Gmail search query):**
Amazon, Uber Eats, DoorDash, Walmart, Apple — expandable without code changes by updating the search query string.

**Lookback window:** Gmail is queried for receipt emails from the last 90 days by default. Emails older than 90 days are ignored unless the user explicitly triggers a deeper search (out of scope for v1).

---

## Transaction Creation

When the user clicks "Create transactions" on a receipt:

- One transaction is created per distinct category group
- Each transaction uses the existing `POST /api/transactions` endpoint
- Merchant name + order number are used to populate the transaction description
- Order date is used as the transaction date
- A `receiptId` is stored on each created transaction for traceability

**Example — $67.48 Amazon order split into 3 categories:**

| Transaction | Amount | Category |
|---|---|---|
| Amazon – Electronics | $43.99 | Electronics |
| Amazon – Personal Care | $8.50 | Personal Care |
| Amazon – Education | $14.99 | Education |

---

## Data Model

**`connected_apps`** (new table)

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| userId | uuid | FK → users |
| provider | varchar | `'gmail'` |
| email | varchar | connected account email |
| accessToken | text | encrypted |
| refreshToken | text | encrypted |
| tokenExpiry | timestamp | |
| createdAt | timestamp | |

**`receipts`** (new table)

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| userId | uuid | FK → users |
| gmailMessageId | varchar | unique — prevents duplicate parsing |
| merchant | varchar | |
| orderNumber | varchar | nullable |
| orderDate | date | |
| total | decimal | |
| currency | varchar | default `'USD'` |
| items | jsonb | parsed line items array |
| rawSubject | varchar | email subject line |
| imported | boolean | true once transactions created from it |
| parsedAt | timestamp | |

**`transactions`** (existing table — add one column)

| Column | Type | Notes |
|---|---|---|
| receiptId | uuid | nullable FK → receipts |

---

## Out of Scope

- Non-Gmail providers (Outlook, IMAP) — future
- Background polling or real-time Gmail push notifications — on-demand only
- Auto-creating transactions without user confirmation
- Modifying or deleting Gmail emails
