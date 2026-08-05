# Receipts Row List: Table Layout — Design Spec

**Date:** 2026-08-05
**Status:** Approved
**Continues:** `2026-08-05-receipts-match-and-manual-upload-design.md` — that spec's "Row List Follow-Up" section added Source/Category/Match-Status *data* to the existing card-style row without changing its structure. After seeing it live, the user compared it directly against the Finwise reference and wants the actual table structure, not just the added data on cards.

## Summary

Rewrite `ReceiptRow.tsx` (and add a matching header row in `page.tsx`) to use this codebase's existing CSS-Grid "table" convention — the same pattern already used by `BudgetTable`/`BudgetRow` (`apps/web/src/components/budgets/`) — instead of the current flex-based card row. No new data is needed; every field this needs (`source`, `merchant`, `orderDate`, `total`, `matchedTransaction.category`, `statusLabel(r)`) already exists on the `Receipt` type.

## Pattern (matching `BudgetRow`'s established convention)

- A shared grid-column-width string, e.g. `grid-cols-1 md:grid-cols-[28px_minmax(140px,1fr)_100px_90px_130px_130px]` (Source icon · Merchant · Date · Amount · Category · Match Status). `grid-cols-1` on mobile stacks every cell into one column (a card); `md:grid-cols-[...]` lays them out side by side on desktop and up. One component, no separate mobile/desktop markup.
- A `hidden md:grid` header row in `page.tsx`, using the same grid-column string, with uppercase muted-color labels — matching `BudgetTable`'s column-header row exactly in style (font size, letter-spacing, `--color-text-muted`, `--color-elevated` background).
- Rows keep the existing click-to-open-detail-panel behavior, hover state, and the existing `STATUS_COLOR`/`SourceIcon` logic from the current `ReceiptRow.tsx` — only the layout container changes, not the data logic.

## Columns

1. **Source** — icon only (envelope/upload-arrow, existing `SourceIcon`), narrow fixed width.
2. **Merchant** — flexible width, truncates.
3. **Date** — `orderDate`, existing format.
4. **Amount** — `money(r.total)`.
5. **Category** — `r.matchedTransaction?.category?.name ?? 'Uncategorized'`, as a colored pill when a real category exists (using the category's own `color`/`icon` if present, matching how category pills render elsewhere in the app, e.g. `ReceiptDetailPanel`'s category dropdown options) — plain muted text for "Uncategorized".
6. **Match Status** — the existing three-state pill (Imported/Matched/Pending Review), unchanged.

**Dropped:** the item-count chip ("4 items"). It no longer appears in the row list — matching the Finwise reference, which only shows item count inside the detail panel's line-item list (already the case in `ReceiptDetailPanel.tsx`, unchanged).

**Order number**, previously shown as `· Order 12345` next to the date on the card, is dropped from the row list (no column for it) — it remains visible in the detail panel header, unchanged.

## Mobile (`< md`)

`grid-cols-1` stacks Source+Merchant, Date, Amount, Category, and Match Status each on their own line inside the row's rounded card container — same visual weight/spacing as the rest of the app's card rows (`BudgetRow` does the same). No separate mobile-specific JSX.

## Out of Scope

- No changes to `ReceiptDetailPanel.tsx`, `StatStrip.tsx`, or `FilterBar.tsx` — those already shipped correctly in the prior spec.
- No changes to the underlying data/API — this is presentation-only.
- Colored category pill styling reuses whatever pattern already exists in the codebase for category colors; if none fits cleanly, fall back to a neutral pill (background `var(--color-elevated)`, text `var(--color-text-secondary)`) rather than inventing a new color system.

## Testing / Verification

No test runner covers this component (matches existing convention — `ReceiptRow.tsx`/`BudgetRow.tsx` have no test files). Manual verification: load `/receipts`, confirm the header row appears at `md`+ and columns align with the rows beneath it; resize to mobile width and confirm rows stack cleanly; confirm clicking a row still opens the detail panel; confirm category pills render for matched receipts and "Uncategorized" renders plainly for unmatched ones.
