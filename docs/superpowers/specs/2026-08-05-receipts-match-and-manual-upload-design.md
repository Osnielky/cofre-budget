# Receipts: Match-to-Transaction + Manual Upload — Design Spec

**Date:** 2026-08-05
**Status:** Approved
**Continues:** `2026-07-22-receipts-redesign-design.md` (sub-project 1, shipped) — this spec covers sub-projects 2 and 3 from that roadmap, plus a small follow-up to sub-project 1's row list.

## Summary

The 2026-07-22 spec shipped the stat-strip/filter-bar/row-list/detail-panel redesign of `/receipts` and explicitly deferred three things for lack of real backing data: a Source filter, a Category column, and a match-to-transaction workflow. This spec builds the two capabilities that unlock those:

1. **Match-to-transaction** — link a receipt to an existing (e.g. Plaid-synced) transaction instead of only being able to create a new one from it. Reuses the linking primitive that already exists in the other direction (`ReceiptFinderService`, used today from the Transactions page's "Find Receipt" modal).
2. **Manual receipt upload** — add a receipt Cofre didn't get from Gmail (e.g. a cash purchase), with an optional photo/PDF attachment. **Entered by hand, not AI-parsed** — see "Decision: no AI parsing" below.

A small follow-up to the row list is bundled in: once receipts can have a second source (manual) and a real category (via a matched transaction), the item-count chip is replaced with real Source/Category/Match-Status columns, and the filter bar gains a Source filter.

**Explicitly still deferred:** "Connect Amazon" as a real integration (no public API for personal order history; Amazon receipts already arrive via the existing Gmail query — this would only ever be a merchant filter on Gmail-sourced receipts, not a new source, and isn't needed until there's demand for it).

## Decision: no AI parsing for manual uploads

Considered sending uploaded images to Claude's vision API to auto-extract merchant/total/items, mirroring how Gmail receipts used to be parsed. Rejected: on 2026-07-25 the app deliberately moved Gmail receipt parsing off Anthropic entirely (removed `@anthropic-ai/sdk` and its deploy secret, and updated the public privacy policy to state receipt extraction "happens entirely on Cofre's own server — the [content] is never sent to any third-party AI or analysis service"). Reintroducing Anthropic for a different data path (uploaded images vs. email body) wouldn't make that sentence literally false, but it reverses a deliberate simplification for one feature. Manual upload therefore stores the attachment for reference only; the user types in merchant/total/date/items directly.

**Consequence:** a manually-entered receipt is correct by construction (the user typed it) — there's no "AI parse, needs your review" intermediate state. So the match-status model below is two states, not three.

## Data Model

`Receipt` entity (`apps/api/src/receipts/receipt.entity.ts`) gains three columns:

| Column | Type | Notes |
|---|---|---|
| `source` | `varchar`, default `'gmail'` | `'gmail' \| 'manual'`. Existing rows backfill to `'gmail'` via the column default. |
| `imageData` | `bytea`, nullable | Raw file bytes. Only set for manual uploads. Stored in Postgres (not GCS) — no new GCP provisioning, works identically local/prod, fine at this app's personal-use volume. |
| `imageMimeType` | `varchar`, nullable | e.g. `image/jpeg`, `application/pdf`. Used to render/download correctly. |

No `confirmed` column (see decision above — not needed without an AI-parse step).

`Transaction.receiptId` (already exists) is the only link between a transaction and a receipt — unchanged.

## Match-to-Transaction

**Status derivation** (computed at read time, not stored):
- **Matched** — some `Transaction` has `receiptId` equal to this receipt's id.
- **Pending** — otherwise.

Computed in `ReceiptsService.syncAndFind` by fetching the user's transactions' `receiptId`s once and checking membership, alongside the existing sync — no N+1 queries.

**Finding candidates (new, receipt → transaction direction):**

New method on `ReceiptFinderService`, symmetric to the existing `findCandidates` (transaction → receipt):

```
findTransactionCandidates(userId, receiptId, windowDays = 4): Promise<TransactionCandidate[]>
```

- Loads the receipt, computes a date window (`orderDate ± windowDays`) and amount, queries the user's transactions in that window ordered by `|amount - receipt.total|` then date distance — same ranking approach as the existing method, just the two sides swapped.
- Excludes transactions already linked to a *different* receipt; includes the transaction currently linked to *this* receipt (if any) pinned first, matching the existing method's convention.

New endpoint: `GET /receipts/:id/transaction-candidates?window=N`.

**Linking/unlinking:** reuses the existing `PATCH /transactions/:id/receipt { receiptId }` endpoint unchanged (pass the receipt's id to link, `null` to unlink) — no new write path needed.

**UI:** in `ReceiptDetailPanel`, a new "Match to Transaction" section (visible when the receipt isn't already matched) lists candidates from the new endpoint with amount/date and a one-click "Match" button; if matched, shows the linked transaction with an "Unmatch" button. Follows the same list-and-pick interaction `FindReceiptModal.tsx` already uses on the Transactions page, so no new interaction pattern for the app.

## Manual Upload

**Flow:** "Upload Receipt" button (next to the existing page header, alongside the Gmail-connect affordance) opens a form: file picker (image or PDF, ≤8MB) + fields — merchant (required), total (required), currency (default USD), order date (optional), order number (optional), line items (optional, progressive "+ Add item" — defaults to a single implied item of `{name: "<merchant> purchase", quantity: 1, unitPrice: total, total}` if none added, matching the existing Gmail-parser fallback in `receipt-parser.ts:190`).

**Endpoint:** `POST /receipts/manual` — multipart form (`@nestjs/platform-express`'s `FileInterceptor`, already available as a transitive dependency, no new package). Validates mimetype (`image/jpeg`, `image/png`, `image/heic`, `application/pdf`) and size server-side. Creates a `Receipt` row: `source: 'manual'`, `imported: false`, the parsed form fields, and the file bytes/mimetype.

**Display:** the detail panel shows the stored image (or a PDF icon + download link for PDFs) above the line items when `imageData` is present, regardless of source — this also benefits any future source that attaches images.

## Row List Follow-Up (extends the 2026-07-22 spec, doesn't replace it)

- **Source column** — small icon (envelope for Gmail, upload-arrow for manual) before the merchant name. Two small inline-SVG icon paths added to `ReceiptRow.tsx`'s icon set, same convention as `StatStrip.tsx`'s `MiniIcon`/path-constant pattern — no icon library.
- **Category column** — shown only for Matched receipts, pulled from the linked transaction's `category`/`categoryRef`. Unmatched receipts show "Uncategorized" (muted). Requires `GET /api/receipts` to include the linked transaction's category alongside each matched receipt (small join, added to `ReceiptsService.syncAndFind`).
- **Match-status pill** — replaces today's Imported/Pending Review pill with three states: existing Imported (unchanged meaning — already turned into a manual transaction via "Create Transaction"), plus the new Matched/Pending distinction for receipts not yet imported. Concretely: **Imported** (existing meaning, highest priority) → else **Matched** → else **Pending**.
- **Filter bar** — new Source filter (All / Gmail / Manual Upload), alongside existing Search/Merchant/Date/Status filters.

**Stat strip:** "This Month $" tile is replaced with **Matched to Transactions** (count + match rate, e.g. "24 · 68%"), matching the reference. ("This Month $" was the only tile with no equivalent in the reference; dropping it keeps the strip at four tiles rather than growing it to five.) The count includes **both** Imported and Matched receipts — `importToTransactions` already sets `receiptId` on the transaction it creates, so an Imported receipt is a linked receipt too; the stat counts "has any linked transaction," the row-list pill just shows the more specific Imported label when that's the case.

## API Surface Summary

| Method | Path | Change |
|---|---|---|
| `GET` | `/receipts` | Response gains matched-category join; status derivation updated |
| `GET` | `/receipts/:id/transaction-candidates` | **New** |
| `POST` | `/receipts/manual` | **New**, multipart |
| `PATCH` | `/transactions/:id/receipt` | Unchanged, reused for match/unmatch from the receipt side too |

## Responsiveness

Per the standing project requirement: the new Source/Category columns collapse into the existing mobile card-row pattern (small icon + muted category text beneath merchant, same line as the existing date/status). The manual-upload form and match-candidate list are full-width stacked forms on narrow viewports, consistent with other modals/panels in the app (e.g. `CsvImportModal`).

## Testing / Verification

No test runner configured in this repo (per `CLAUDE.md`). Manual verification:
- Match: link a receipt to a transaction from the receipt side, confirm it shows Matched and the transaction shows the reverse link (already-existing `FindReceiptModal` on that transaction); unmatch and confirm it reverts to Pending.
- Manual upload: upload a photo + a PDF, confirm both render correctly in the detail panel, confirm size/mimetype validation rejects an oversized or wrong-type file.
- Row list: confirm Source icons, Category (Uncategorized vs. real category once matched), and the three-state status pill render correctly; confirm the Source filter narrows results.
- Responsive check at ~360px, ~768px, and desktop widths for the new form, candidate list, and row-list columns.
- Theme check (Cobalt default) — no hardcoded colors introduced.

## Out of Scope (this spec)

- AI-assisted parsing of manually uploaded receipts (see decision above)
- "Connect Amazon" as a real integration
- Editing a manually-entered receipt after creation (delete-and-recreate is the v1 workaround if a typo needs fixing)
- Bulk actions (e.g. matching multiple receipts at once)
