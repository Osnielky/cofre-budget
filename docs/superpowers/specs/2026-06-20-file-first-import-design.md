# File-First Import with Account Reconciliation — Design

**Date:** 2026-06-20
**Status:** Approved (design), pending implementation plan

## Problem

Today, importing a CSV is **account-first**: the user picks an account, then imports a
file into it. `validate()` in `apps/web/src/components/CsvImportModal.tsx` then tries to
catch when the file does not belong to the chosen account, hard-blocking on signals like a
last-4 mismatch. This ordering creates friction:

- The user must know/choose the account before seeing the file's contents.
- Validation produces false-positive "these transactions do not belong to this account"
  hard-blocks (the source of recent validation rework).

## Goal

Let the user **import the file first**, then have the system find the right account.
When the system is confident it pre-selects the match; the user always confirms before the
import commits. When no account fits, the user picks an existing account or creates one
prefilled from the file's data.

## Scope & Constraints

- **Whole file → one account.** A bank export is treated as a single account's statement
  (matches how bank CSVs actually export). No per-row account assignment.
- **Always confirm.** Even a high-confidence match shows the review screen with the
  suggested account pre-selected; the user confirms (or changes it) before import.
- **Both entry points kept** (see below).
- **Front-end only.** No DB schema or API endpoint changes. Reuses existing
  `transactions/import`, `transactions/check-duplicates`, and bank-account create endpoints.

## Entry Points (both retained)

1. **Per-account import (existing, unchanged).** From an account's card/menu, opens
   `CsvImportModal` with the account already known — exactly as today.
2. **File-first import (new).** The main "Import" button drops the user straight into a
   file picker with no account chosen. After parsing, the system suggests an account; the
   user always confirms before import.

## Architecture

### Shared CSV library

Lift the parsing and detection helpers out of `CsvImportModal.tsx` into a shared module
(`apps/web/src/lib/csvImport.ts`) so both the existing modal and the new one share one
source of truth:

- `parseCsv(text)` → `{ rows, finalBalance }`
- `detectCsvFingerprint(rawText)` → `{ bank, type }`
- last-4 extraction (filename + content)
- supporting helpers (`normalizeDate`, `parseAmt`, `parseRow`, `bankNamesMatch`, etc.)

`CsvImportModal` is refactored to import from this module (behavior unchanged). The new
`ImportReconcileModal` imports the same helpers.

### New component: `ImportReconcileModal`

A separate modal (not a fork of the account-locked `CsvImportModal`) so the account-known
flow stays clean. Responsibilities:

1. Accept a dropped/selected file with **no account** preset.
2. Parse it via the shared lib.
3. Rank the user's accounts (passed in as a prop) against the file (see Matching).
4. Render the reconcile screen with the best match pre-selected.
5. On confirm: optionally create an account, then import via existing endpoints.

## Matching / Ranking

After parsing, score every existing account against three file signals and sort best-first:

| Signal | Source | Weight |
|---|---|---|
| **last-4** | filename + file content | strongest |
| **bank** | `detectCsvFingerprint().bank` vs `account.bankName` (`bankNamesMatch`) | medium |
| **type** | bank-vs-credit detection vs `account.accountType` | weak |

Type mapping: detected `'credit'` ↔ account `accountType === 'credit'`; detected `'bank'`
↔ account `accountType ∈ {checking, savings, debit, cash}`.

### Confidence tiers (drive the UI)

- **Exact** — file last-4 matches an account's `last4` → pre-select it; green label
  "Matched account ending in NNNN".
- **Strong** — bank + type agree, no last-4 conflict → pre-select; label
  "Looks like your {Bank} {Type}".
- **Weak** — only type agrees → pre-select top candidate but flag it as a guess.
- **None / conflict** — no candidate, or the only candidates have a *conflicting* last-4 →
  default the selector to **Create new account**.

**Softer than today's `validate()`:** a last-4 mismatch no longer hard-blocks the import.
It simply removes that account from the suggestions (and never pre-selects it). This is the
deliberate fix for the false-positive friction.

## Reconcile Screen

One screen containing:

- **Transactions table + stats** — reused from the current modal (total / new / skipped /
  income).
- **Account selector** — pre-set to the best match, showing the confidence label. The
  dropdown lists all accounts (best-match sorted) plus a "➕ Create new account" option.
- **Create-new inline form** (shown when "Create new account" is selected) — prefilled from
  the file, all fields editable:
  - bank name — detected (`detectCsvFingerprint().bank`), may be empty if unknown
  - account type — detected (bank → checking, credit → credit)
  - last-4 — detected from filename/content
  - color — auto-assigned
  - account name — default `"{Bank} {Type} ••{last4}"` (e.g. "Chase Checking ••1234"),
    editable
- **Duplicate check** — runs once an account is selected (existing
  `transactions/check-duplicates` call). For a to-be-created account there are no existing
  transactions, so all rows are new.

### Confirm action

- If an existing account is selected → `POST transactions/import` with that
  `bankAccountId`, `rows`, `finalBalance`.
- If "Create new account" → first create the account (existing bank-account create
  endpoint), then `POST transactions/import` into the new account's id.
- Success → existing import toast.

## Error Handling

- **Unparseable file** — same errors as today's parser (no date column, empty, etc.),
  shown inline; no account step reached.
- **Account create fails** — surface the error inline, do not attempt the import, keep the
  user's form input.
- **Import fails after create** — the account exists but is empty; show a retryable error.
  (Acceptable: re-running the import into that now-existing account just works.)
- **Network/CORS on duplicate check** — silently skip, same as today.

## Out of Scope (YAGNI)

- Per-transaction / split-across-accounts assignment.
- Auto-import without confirmation.
- Backend changes to import/dedup logic.
- Multi-file batch import.

## Testing

No test runner is configured in the repo. Manual verification checklist:

1. Exact match (file last-4 == account last-4) pre-selects that account.
2. Strong match (bank+type, no last-4) pre-selects the right account.
3. No matching account → selector defaults to "Create new account", prefilled correctly.
4. Conflicting last-4 → that account is not suggested; create-new is offered.
5. Create + import in one confirm produces the account and its transactions.
6. Per-account import (existing flow) still works unchanged.
7. Duplicate detection still skips already-imported rows.
