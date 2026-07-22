# Receipts Page Redesign — Design Spec

**Date:** 2026-07-22
**Status:** Approved (sub-project 1 of 4)

## Summary

Redesign `/receipts` from a simple card list + modal into a stat-strip + filter bar + row list + detail panel layout, matching the visual bar already set on the Dashboard and Transactions pages. This is a **visual and structural** redesign only — it reuses the existing Gmail-only, single-source data model and the existing create-transaction flow. No new backend endpoints.

This spec was scoped down from a broader "Finwise-style" reference (stat cards, multi-source filters, match-to-transaction workflow, manual upload, Amazon integration) that the user shared for inspiration. That full scope was decomposed into four independent sub-projects; this spec covers only the first.

## Roadmap (for context — not all in scope here)

1. **Visual redesign** (this spec) — stat strip, filter bar, row list, detail panel. Frontend-only.
2. **Match-to-transaction workflow + Approve step** — new status field(s) on `Receipt`, reversing `receipt-finder.service.ts` to work receipt → transaction as well as transaction → receipt.
3. **Manual Upload** — new capability to upload a receipt image/PDF and parse it via Claude, reusing the existing parsing pattern from `gmail.service.ts`.
4. **Amazon as a source** — NOT a separate scraping/OAuth integration (Amazon has no public API for personal order history, and scraping would require storing Amazon credentials/session — fragile and against ToS). Amazon receipts are **already** pulled via the existing Gmail query (`ship-confirm@amazon.com` in `gmail.service.ts:161`). This will ship as a **merchant filter on Gmail-sourced receipts**, once there's a second real source to justify a "Source" filter at all (i.e., after sub-project 3 ships).

## Architecture

Single file change, no new API surface:

| Layer | Change |
|---|---|
| Web: `apps/web/src/app/receipts/page.tsx` | Rewritten: stat strip, filter bar, row list, responsive detail panel |
| Web: new `apps/web/src/app/receipts/StatStrip.tsx` | New component, modeled on `apps/web/src/app/transactions/StatStrip.tsx` |
| API | No changes — reuses `GET /api/receipts`, `GET /api/categories`, `POST /api/receipts/:id/import` |

## Stat Strip

Four tiles, same visual component pattern as `transactions/StatStrip.tsx` (icon chip, `color-mix` tinted background, value, label):

1. **Total Receipts** — count of all receipts in the current view
2. **Auto-imported** — count where `imported === true`
3. **Pending Review** — count where `imported === false`
4. **This Month** — sum of `total` for receipts whose `orderDate` falls in the current calendar month

No period-over-period deltas in v1 (unlike the Transactions stat strip) — deferred as a future enhancement, not essential to this redesign.

## Filter Bar

- **Search** — free text over merchant name + raw subject
- **Merchant** — dropdown of distinct merchants present in the current receipt list
- **Date Range** — receipt `orderDate` range picker
- **Status** — All / Imported / Pending Review

**Explicitly deferred:** a "Source" filter (Gmail / Amazon / Manual Upload). With only one real source (Gmail) today, a source filter with a single option adds no value — it ships in sub-project 4 once Manual Upload (sub-project 3) creates a second real source.

**Correction made during planning:** the original draft also listed a "Category" filter. `Receipt` never stores a category — categories are assigned per line-item at import time and live on the resulting `Transaction` (`receipts.service.ts:99-111`), not on the receipt itself. A category filter would have no real data for pending (not-yet-imported) receipts, and backing it properly would require a new backend endpoint — contradicting this sub-project's "no backend changes" scope. Dropped from v1; revisit once sub-project 2 (match/approve workflow) gives receipts a real category-bearing relationship.

## Row List

Div-based rows (not a literal `<table>`, matching the convention already used on the Transactions page for responsive-friendliness) — columns: merchant, date, amount, item-count chip (e.g. "3 items", from `items.length` — real data already on the `Receipt` entity, unlike a category which isn't), status pill (green "Imported" / amber "Pending Review"). Clicking a row opens the detail panel.

**Correction made during planning:** the original draft listed a "category chip" here — same data-model gap as the dropped Category filter above (`GET /api/receipts` returns raw `Receipt` rows only, no joined transaction/category — confirmed in `receipts.controller.ts`). Replaced with an item-count chip, which is real, already-available data.

**Mobile (< `md`):** collapses to a two-line stacked card — merchant + amount on the first line, date + status pill on the second — following the same responsive philosophy as the rest of the app.

## Detail Panel

- **Desktop (`md` and up):** persistent right rail, `hidden md:flex`, exact same convention as `transactions/InsightsPanel.tsx`'s rail (resizable via the same drag-handle pattern is optional — a fixed width is acceptable for v1).
- **Mobile:** full-screen overlay (evolution of today's centered modal).

**Content (same as today's modal, relocated):**
- Merchant name, order number, "Imported via Gmail" badge
- Line items list, each with a category-assignment dropdown (existing logic in `page.tsx` — `itemCategories` state, `countGroups()`)
- Summary box: "This will create N transaction(s) totaling $X"
- Primary action: **Create N Transaction(s)** button (existing `handleImport` logic, unchanged)

## Data Flow

No new endpoints. All stat/filter computation happens client-side over the already-fetched `/api/receipts` response, exactly like `StatStrip.tsx` computes its tiles client-side from the already-fetched transactions list.

## Styling Cleanup (bundled in)

The current `receipts/page.tsx` hardcodes hex/rgba colors (`#F2F1EA`, `#6b7488`, `rgba(35,35,47,0.5)`, etc.) instead of the theme CSS variables required by `CLAUDE.md` (`--color-surface`, `--glass-border`, `--glass-shadow`, `--color-text-primary/secondary/muted`, `--color-card-violet`, etc.). Since this file is being rewritten anyway, all hardcoded colors are replaced with the correct variables so the page respects theme switching like the rest of the app.

## Testing / Verification

No test runner is configured in this repo. Verification is manual: run the dev server, load `/receipts` in a browser, and check:
- Empty state (no receipts)
- Loaded state with the stat strip, filters, and row list populated
- Filter interactions (search, merchant, category, date range, status)
- Detail panel on both a desktop-width and mobile-width viewport
- Theme switching (at least the default Cobalt theme) to confirm no hardcoded colors remain

## Out of Scope (this spec)

- Source filter (Gmail/Amazon/Manual Upload) — sub-project 4
- Match-to-transaction workflow, Approve step, "Matched" stat tile — sub-project 2
- Manual receipt upload — sub-project 3
- Stat strip deltas ("vs last 30 days")
- Any backend/entity changes
