# Receipt-Assisted Split: Discoverability + Handoff Fix — Design Spec

**Date:** 2026-08-06
**Status:** Approved

## Summary

The core value of a receipt (per the user, after reviewing the Receipts page's own detail panel) is helping split an *existing* transaction into its real line items — not manufacturing a brand-new transaction. That flow already exists end-to-end on the Transactions page (`FindReceiptModal` → "Split from items" → `SplitTransactionModal`, pre-filled), but it's buried behind a click with no row-level signal, and the two-modal handoff relies on a fragile stale-closure pattern in `apps/web/src/app/transactions/page.tsx`.

This spec: (1) surfaces a "receipt available" signal directly on transaction rows using only the local receipt cache (no live Gmail calls), (2) replaces the page-level two-modal handoff with one wrapper component that owns its own step transition, and (3) fixes split children losing their `receiptId` link.

## 1. Row-level indicator

**Backend:** `ReceiptFinderService.findCachedMatchIds(userId, windowDays = 4): Promise<string[]>` — for every one of the user's transactions that is `!isSplitParent && !receiptId`, checks the local `Receipt` cache (already-synced rows only, same date-window rule `findCandidates` already uses for its cache path — no Gmail search) for at least one receipt whose `orderDate` falls in `date ± windowDays` (or is null). Returns the matching transaction ids. One query for all receipts, one pass in memory — same batching shape as `ReceiptsService.withMatchStatus`, no N+1.

New endpoint: `GET /transactions/receipt-matches` → `string[]`.

**Frontend:** the transactions page fetches this once (alongside the existing transaction list load) into a `Set<string>`. The existing "✉ Receipt" row button gains a third visual state:
- Linked (`tx.receiptId` set) — unchanged: always visible, "Receipt ✓", green.
- Candidate known (`receiptMatchIds.has(tx.id)`) — **new**: always visible (not hover-gated), "Receipt found", violet, slightly stronger tint than today's hover state.
- Nothing known — unchanged: hover-only, "Receipt", violet.

## 2. Unified find→split flow

New component `apps/web/src/components/ReceiptSplitFlow.tsx` wraps the existing `FindReceiptModal` and `SplitTransactionModal` (both reused as-is, no internal duplication) behind one `step: 'find' | 'split'` state local to the wrapper:

- Starts in `'find'`, rendering `FindReceiptModal`.
- `onSplitFromItems` (already built into `FindReceiptModal`) sets the wrapper's `initialLines` and flips to `'split'`, rendering `SplitTransactionModal` pre-filled — same component tree, no unmount/remount, no page-level closure capturing a possibly-stale transaction object.
- `onLinked` (a plain link/unlink with no split) no longer closes the flow — it just triggers a background transaction-list refresh via a passed-in callback, and the user closes explicitly. This removes the current race where linking mid-"split from items" click also fired the page's close handler before the split step could open.
- `onClose` (either sub-modal's ✕) closes the whole wrapper.
- A successful split save closes the wrapper and refreshes the list (existing `SplitTransactionModal.onSave` contract, unchanged).

`page.tsx` collapses its `receiptTx` / `splitTx` / `splitInitialLines` triple-state into a single `receiptSplitTx: Transaction | null`, rendering one `ReceiptSplitFlow` instead of two independently-gated modals. The plain "✂ Split" button (manual split, no receipt involved) is untouched — it still opens `SplitTransactionModal` directly with no initial lines.

## 3. Split children keep their receipt link

`TransactionsService.split()` (`apps/api/src/transactions/transactions.service.ts`) currently copies `name`/`date`/`bankAccountId`/`source`/`pending`/`categoryId` to each child but not `receiptId`. Add `receiptId: tx.receiptId ?? undefined` to the child-creation object — multiple children sharing one receipt id is already a supported shape (`ReceiptsService.withMatchStatus` already handles a receipt linked to more than one transaction). The parent's own `receiptId` is left as-is (unchanged existing behavior, not part of this fix).

## Out of Scope

- Per-item category guessing (only the first split line gets a category prefilled from the receipt today; the rest stay manual) — flagged as a known rough edge, not fixed here.
- A dedicated transaction detail panel — user explicitly chose the lighter row-indicator + flow-merge option over this.
- Any change to the Receipts page's own detail panel or its "categorize items → create transactions" flow — still there for the case where no matching transaction exists yet (e.g. cash purchases), just no longer the primary story.

## Testing / Verification

No test runner covers these components/services in this repo (matches existing convention). Manual verification: confirm the row button shows "Receipt found" for a transaction with a same-window cached receipt and no link; open it, use "Split from items," confirm the split modal opens pre-filled without any flicker/double-close; confirm linking-only (no split) leaves the flow open until explicitly closed; split a transaction via this flow and confirm each child's `receiptId` is set (`psql`); confirm the plain "✂ Split" button still works unaffected.
