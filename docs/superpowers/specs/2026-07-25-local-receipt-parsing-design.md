# Local Receipt Parsing (No Third-Party AI) — Design Spec

**Date:** 2026-07-25
**Status:** Approved

## Summary

Replace the Anthropic Claude call in Gmail receipt parsing with a self-contained, heuristic HTML parser. No email content leaves the server. Parsing also generalizes from a hardcoded 5-merchant sender whitelist to any sender, using a broader keyword-based Gmail search plus a "no total found → skip" rule to control false positives.

## Motivation

Sending user email content to a third-party AI API (Anthropic) is a privacy cost the app doesn't need to carry. Parsing merchant receipt emails — extracting a total, order number, date, and line items from fairly structured HTML — is solvable with a local, deterministic parser.

## Architecture

**New file:** `apps/api/src/gmail/receipt-parser.ts` — pure functions, no NestJS DI, isolated from `GmailService`'s OAuth/API orchestration.

**New dependency:** `cheerio` (pure JS HTML parser, no native bindings, no network access) added to `apps/api`.

### Pipeline (replaces `parseWithClaude`)

1. **`extractPlainStructure(html)`** — parse with cheerio; produce (a) block-separated plain text for regex scanning, (b) any `<table>` elements as rows-of-cells, since tables are the most common line-item layout.
2. **`extractTotal(text)`** — regex over the text, prioritizing "Grand Total" / "Order Total" / "Amount Charged" phrasing over "Subtotal" (excludes tax/shipping-only lines). Returns `null` if nothing matches.
3. **`extractMerchantName(fromHeader, subject)`** — sender's display name (e.g. "Amazon.com" from `Amazon.com <auto-confirm@amazon.com>`), falling back to the domain, falling back to the subject.
4. **`extractOrderNumber(text)`** — regex for common phrasings ("Order #", "Order Number:", "Confirmation #", etc.).
5. **`extractOrderDate(text, emailDateHeader)`** — regex for an explicit "Order Date:" style phrase; falls back to the email's own Date header, formatted `YYYY-MM-DD`.
6. **`extractLineItems(tables)`** — scan table rows for ones containing a price-like cell plus a description cell; exclude rows themselves labeled subtotal/tax/shipping/total. Best-effort — may return zero items.
7. **`parseReceiptEmail({ html, subject, from, dateHeader })`** — orchestrates the above:
   - If step 2 finds no total → return `null` (caller skips the message).
   - Otherwise build the existing `RawReceipt` shape.
   - If step 6 found nothing, fall back to a single line item = the total (same shape as today's Claude-parse-failure fallback).

### Search query change

`GmailService.fetchAndParseReceipts`'s hardcoded `QUERY` (a whitelist of 5 merchant sender addresses) is replaced with a subject-keyword search:

```
subject:(receipt OR invoice OR "order confirmation" OR "your order" OR "payment received") newer_than:90d
```

This removes the sender whitelist entirely — any sender's email can match if the subject looks receipt-like.

### Error handling

- Cheerio parse failure (malformed HTML) → catch, `Logger.warn`, skip the message — same pattern as the existing "no body extracted" path.
- No network calls in the parser itself, so no retry/timeout logic needed there.
- Messages matching the broader keyword search that aren't real receipts (no total found) are silently skipped, not saved — expected and common now that the search net is wider.

## Removed

- `@anthropic-ai/sdk` import and the `Anthropic` client instantiation in `gmail.service.ts`.
- `ANTHROPIC_API_KEY` read via `ConfigService` in `gmail.service.ts`.
- `@anthropic-ai/sdk` from `package.json` (confirmed unused elsewhere in the repo).
- `ANTHROPIC_API_KEY` entry in `deploy/ci-deploy.sh`'s `--set-secrets` list (added earlier this session, now reverted — the Secret Manager secret itself can be left in place unused or deleted later).

## Also updated

- `apps/web/src/app/privacy/page.tsx` — the Gmail data section currently states email content is sent to Anthropic's API for parsing. That's removed; the section is updated to state parsing happens locally on Cofre's own server, with no third-party AI processor involved. The "Third parties we work with" list drops the Anthropic row.

## Verification

No test runner is configured in this repo. Verification is manual:
1. Build the API (`npx nx build api`) to confirm the new module compiles.
2. Reconnect Gmail (locally or in production) and confirm the real Amazon order-confirmation email already seen in this session parses correctly: merchant "Amazon.com", order number `113-5177507-4387418`, total `$76.87`.
3. Spot-check a couple of other emails in the connected inbox to sanity-check that the heuristics generalize reasonably and that non-receipt keyword matches (if any) are skipped rather than saved as junk.
