# Receipt Detail Panel Redesign — Design Spec

**Date:** 2026-08-06
**Status:** Approved
**Continues:** `2026-08-05-receipts-table-layout-design.md` (row list) and `2026-08-06-receipt-split-discoverability-design.md` (split affordance) — this spec covers the panel itself, which the user flagged as "totally wrong" against a reference mock.

## Summary

Redesign `ReceiptDetailPanel.tsx`'s editable (unmatched/not-yet-imported) state to match a reference mock: avatar-style header with source/email links, a merchant-history category suggestion banner with bulk-apply, pill-style per-item category controls, item-list collapsing/grouping, and a subtotal/tax/total + per-category "this will create" breakdown. The read-only (matched/imported) branch, footer actions, and `MatchTransactionSection` are unchanged.

Explicitly **not** building: per-item AI classification, confidence percentages, or outlier detection ("not a grocery — pick a category" styling in the mock). The category suggestion is merchant-level (one suggestion for the whole receipt, from the user's own transaction history), not per-item AI — this was a deliberate scope decision to avoid inventing signal the app doesn't have.

## Backend changes

### 1. Expose `gmailMessageId`

`Receipt.gmailMessageId` already exists on the entity (`apps/api/src/receipts/receipt.entity.ts`) but isn't in the API response shape built in `receipts.service.ts`. Add it to the serialized receipt object and to the frontend `Receipt` interface in `apps/web/src/lib/receipts/derive.ts` as `gmailMessageId: string | null`.

### 2. Merchant category suggestion endpoint

New endpoint: `GET /receipts/:id/suggestion`.

Logic (new method on `receipts.service.ts`, e.g. `getMerchantSuggestion(userId, receiptId)`):
1. Load the receipt, get its `merchant` and `userId`.
2. Query: `transactions` joined to `receipts` on `transaction.receiptId = receipt.id`, filtered to `receipt.userId = :userId AND receipt.merchant = :merchant AND receipt.id != :excludeId AND transaction.categoryId IS NOT NULL`.
3. Group by `categoryId`, order by count of distinct contributing receipts descending, take the top result.
4. Return `{ categoryId, categoryName, icon, color, receiptsConsidered } | null` — `null` when there's no history for this merchant (new merchant, or no past receipt from it was ever imported with a category).

This reuses `Transaction.receiptId` + `Receipt.merchant` (both already persisted) — no new columns, no new tables. Analogous in spirit to the existing `getCategoryHints` on `transactions.service.ts:26-49` but merchant-scoped instead of name-string-scoped, since receipt-derived transaction names include item-list suffixes that don't match cleanly.

Frontend: `page.tsx` fetches this when a receipt is opened and is neither matched nor imported, stores it in state (`suggestion: MerchantSuggestion | null`), passes it to the panel.

## Frontend — shared avatar helper

Extract the `avatarColor(name)` / `initials(name)` pair currently duplicated inline in `apps/web/src/app/debts/page.tsx:26-37` into `apps/web/src/lib/avatar.ts`, and use it from both `debts/page.tsx` and the new receipt panel header. Same hash-to-palette logic, same `AVATAR_COLORS` array (the six existing card-accent CSS vars) — just de-duplicated, not redesigned.

## Frontend — `ReceiptDetailPanel.tsx`

### Header (both branches)

Replace the image/PDF thumbnail with:
- Colored square avatar (`avatarColor`/`initials` on `receipt.merchant`).
- Merchant name (unchanged, `<h2>`).
- Subtitle line: `Order {orderNumber} · {parsedAt formatted as "MMM D, YYYY"}` (falls back to just the date if no order number — don't render a dangling "Order · date").
- Pill row: source pill ("From Gmail" / "Manual Upload", reusing `SourceIcon`), and — gmail-sourced receipts only, when `gmailMessageId` is present — a "View email ↗" link to `https://mail.google.com/mail/u/0/#inbox/${gmailMessageId}` opened in a new tab.
- Drop the raw "Email subject: …" line and the separate receipt-image thumbnail from the header; the receipt image (if any) remains reachable — keep the existing PDF/image link but move it to a small inline "View receipt" link near the pills rather than a thumbnail, so the source-of-truth image isn't lost, just de-emphasized.
- Close (✕) button, unchanged position/behavior.

### Matched-transaction block

Unchanged (`FieldRow`s for Category/Match Status/Matched To) — only rendered when `receipt.matchedTransaction` is set, same as today.

### Read-only item list (matched or imported)

Unchanged — simple name + total rows plus bold Total row.

### Editable item list (unmatched, not imported)

1. **Suggestion banner** — rendered above "Line Items" when `suggestion !== null`: `"All {items.length} items look like {suggestion.categoryName}"` / `"Based on your last {suggestion.receiptsConsidered} {receipt.merchant} receipts"` + an **Apply** button. Apply calls a new `applyAll(categoryId)` handler (extends `page.tsx`'s existing `setCategory` setter to fill every item index at once) and dismisses the banner. Styled as a violet-tinted card, consistent with the app's existing suggestion/hint treatment (e.g. `transactions/page.tsx` category hint chips).
2. **Item rows** — each row: item name + `{qty}× {unitPrice}` (small, muted, only shown when qty > 1, matching current behavior) on the left; `money(item.total)` right-aligned before the category control; a category control styled as a colored pill (category's `color` when `itemCategories[idx]` is set, a neutral/muted "Choose category" pill when empty) — implemented as a native `<select>` visually restyled to look like a pill (background/text driven by the selected category's color via inline style, same `color-mix` pattern used elsewhere in this file), not a custom dropdown component. No per-item warning/outlier styling.
3. **Collapse** — when `items.length > 6`: show the first 6 rows, then a summary line for the rest. If every remaining item shares the same assigned category, show `"{n} more items · all {categoryName}"`; otherwise `"{n} more items"`. A "Show all" link expands to the full list.
4. **Group by category** — a link (visible whenever there's more than one distinct assigned category among the items) that toggles the list between flat/original order and grouped-by-category (category subheader + subtotal, items nested underneath, same pill control per item). Pure client-side state in the panel (`useState`), no new derive.ts state needed beyond a new `groupItemsByCategory()` helper (see below).
5. **Summary block**, replacing the current single violet "this will create N transactions" box:
   - Subtotal / Tax / Receipt total rows: `subtotal = sum(items.total)`, `tax = receipt.total - subtotal`. Only render the Tax row when `tax > 0.01` (avoids a nonsense negative/zero "Tax" line when the receipt total doesn't include tax data or items already sum to the total).
   - "This will create" list: one row per distinct assigned category (icon, name, item count, subtotal) plus one "Uncategorized" row if any items are unassigned, using a new `groupItemsByCategory(items, itemCategories, categories)` helper added to `derive.ts` (returns `{ categoryId, categoryName, icon, color, itemCount, total }[]`, order by total descending, uncategorized last). This supersedes `countGroups()` for display purposes; `countGroups()` itself stays as-is since the footer "Create N Transactions" button label still needs just the count.

### Footer

Unchanged — Approve / Create N Transactions buttons and `MatchTransactionSection`, same conditions as today.

## Out of scope

- No per-item AI classification, no confidence percentages, no outlier/anomaly detection on individual line items.
- No changes to the read-only (matched/imported) rendering branch beyond the shared header restyle.
- No changes to `ReceiptRow.tsx`, `StatStrip.tsx`, `FilterBar.tsx`, or the import/approve API contracts (`POST /receipts/:id/import`, `PATCH /receipts/:id/approve`).
- Mobile behavior: the panel already renders full-screen on mobile via the existing `md:hidden` overlay in `page.tsx`; no new mobile-specific layout is needed beyond what naturally falls out of the same component (per `responsive-design-requirement` — verify at mobile width during manual testing, don't skip it).

## Testing / Verification

No test runner configured for this repo. Manual verification: open an unmatched receipt with prior imported history from the same merchant (confirm suggestion banner + Apply works and pre-fills every item); open one with no history (confirm banner doesn't render, no error); open a receipt with >6 items (confirm collapse + "Show all" + "Group by category" all work); confirm subtotal/tax/total math renders sensibly (and Tax hides when it would be ~0 or negative); confirm the read-only branch (already matched/imported receipt) still renders correctly with the new header; confirm "View email" link only appears for gmail receipts with a `gmailMessageId` and opens the right Gmail URL; check at mobile width.
