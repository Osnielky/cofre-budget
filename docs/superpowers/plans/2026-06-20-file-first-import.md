# File-First Import with Account Reconciliation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user import a transaction CSV first, then have the system auto-detect and pre-select the matching account (always confirmed by the user), falling back to choosing an existing account or creating one prefilled from the file.

**Architecture:** Front-end only. Extract the existing CSV parser + bank-detection helpers out of `CsvImportModal.tsx` into a shared `lib/csvImport.ts`. Add a pure `lib/accountMatch.ts` that ranks the user's accounts against a parsed file. Add a new `ImportReconcileModal.tsx` (file-first, no account preset) that uses both. Wire a new entry point into the transactions page; the existing per-account import stays.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Tailwind v4 (design tokens in `globals.css`). Existing API endpoints reused unchanged: `POST /transactions/import`, `POST /transactions/check-duplicates`, `POST /bank-accounts`.

## Global Constraints

- **No backend changes.** Reuse existing endpoints only.
- **No test runner exists** (per CLAUDE.md). Verification per task = TypeScript compile gate + manual browser check with explicit expected results. The compile gate is: `npx tsc -p apps/web/tsconfig.json --noEmit` → expect no errors.
- **Glassmorphism styling rule:** never a solid `--color-surface` on cards; use `rgba(35,35,47,0.5x)` + matching `backdropFilter`. Reuse existing CSS variables (`--color-*`, `--glass-*`) — no new hardcoded colors.
- **Whole file → one account.** No per-row account assignment.
- **Always confirm** before import commits, even on an exact match.
- **Last-4 mismatch is soft:** it removes an account from suggestions; it never hard-blocks.
- API base: `const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';`
- All `fetch` calls use `credentials: 'include'`.

---

## File Structure

- `apps/web/src/lib/csvImport.ts` — **new.** Parsing + bank/type/last-4 detection (moved from `CsvImportModal.tsx`). Single source of truth for both modals.
- `apps/web/src/lib/accountMatch.ts` — **new.** Pure ranking of accounts against a parsed file.
- `apps/web/src/components/CsvImportModal.tsx` — **modify.** Import helpers from `lib/csvImport.ts` instead of defining them locally. No behavior change.
- `apps/web/src/components/ImportReconcileModal.tsx` — **new.** File-first reconcile modal.
- `apps/web/src/app/transactions/page.tsx` — **modify.** Add file-first entry point + render the new modal.

---

## Task 1: Extract shared CSV library (pure refactor, no behavior change)

**Files:**
- Create: `apps/web/src/lib/csvImport.ts`
- Modify: `apps/web/src/components/CsvImportModal.tsx`

**Interfaces:**
- Produces (exported from `lib/csvImport.ts`):
  - `interface CsvRow { date: string; referenceNumber?: string; name: string; amount: number; }`
  - `type CsvType = 'bank' | 'credit' | 'unknown';`
  - `interface CsvFingerprint { bank: string | null; type: CsvType; }`
  - `function parseCsv(text: string): { rows: CsvRow[]; finalBalance: number | undefined }`
  - `function detectCsvFingerprint(rawText: string): CsvFingerprint`
  - `function bankNamesMatch(csvBank: string, accountBank: string): boolean`
  - `function extractFileLast4(fileName: string, rawText?: string): string | null`

- [ ] **Step 1: Create `lib/csvImport.ts` and move the helpers verbatim**

Move these from `CsvImportModal.tsx` into the new file and add `export` to the four public functions plus the three types/interfaces above:
`BankFingerprint`, `BANK_FINGERPRINTS`, `DATE_COL_HINTS`, `detectCsvFingerprint`, `bankNamesMatch`, `DATE_COL_NAMES`, `parseCsv`, `normalizeDate`, `parseAmt`, `parseRow`.
Keep `normalizeDate`, `parseAmt`, `parseRow`, `BankFingerprint`, `BANK_FINGERPRINTS`, `DATE_COL_*` as module-private (no `export`). Export `CsvRow`, `CsvType`, `CsvFingerprint`, `parseCsv`, `detectCsvFingerprint`, `bankNamesMatch`, and the new `extractFileLast4`.

`detectCsvFingerprint`'s return type becomes `CsvFingerprint` (was an inline object — behavior identical).

- [ ] **Step 2: Add `extractFileLast4`, factoring out the existing filename logic**

This centralizes the last-4 extraction currently inlined in `validate()` (`CsvImportModal.tsx:432-434`) and adds a conservative content scan. Add to `lib/csvImport.ts`:

```ts
/* Last 4 of the account/card number. Filename first (e.g. "Chase1234.csv"),
   then an explicit "ending in 1234" mention in the file body. Years (1900-2099)
   are excluded so a date like 2026 is never mistaken for a card number. */
export function extractFileLast4(fileName: string, rawText = ''): string | null {
  const baseName = fileName.replace(/\.(?:csv|txt)$/i, '');
  const fromName = [...baseName.matchAll(/(?<!\d)(\d{4})(?!\d)/g)]
    .map((m) => m[1])
    .filter((n) => { const v = parseInt(n, 10); return v < 1900 || v > 2099; })
    .at(-1) ?? null;
  if (fromName) return fromName;

  const m = rawText.match(/ending\s+in\s+(\d{4})\b/i)
    ?? rawText.match(/(?:account|acct|card)\D{0,12}(\d{4})\b/i);
  return m ? m[1] : null;
}
```

- [ ] **Step 3: Rewire `CsvImportModal.tsx` to consume the library**

At the top of `CsvImportModal.tsx`:

```ts
import { parseCsv, detectCsvFingerprint, bankNamesMatch, extractFileLast4 } from '@/lib/csvImport';
import type { CsvRow } from '@/lib/csvImport';
```

Delete the now-moved local definitions (`CsvRow` interface, `BANK_FINGERPRINTS`, `detectCsvFingerprint`, `bankNamesMatch`, `detectCsvType` wrapper if unused, `parseCsv`, `normalizeDate`, `parseAmt`, `parseRow`, `DATE_COL_*`). Leave `validate()`, the React component, and `hexToRgb` in place.

In `validate()`, replace the inline last-4 block (`CsvImportModal.tsx:432-434`) with:

```ts
const fileLast4 = extractFileLast4(fileName, rawText);
```

Remove `detectCsvType` if no remaining caller references it (it is only a wrapper).

- [ ] **Step 4: Compile gate**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual regression check (existing flow unchanged)**

Run `npm run dev:web`. Open Transactions → Import → pick an existing account → drop a CSV.
Expected: same parsing, same warnings, same duplicate counts, same successful import as before this task. (Pure refactor — no visible change.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/csvImport.ts apps/web/src/components/CsvImportModal.tsx
git commit -m "refactor: extract CSV parser and bank detection into lib/csvImport"
```

---

## Task 2: Account ranking module

**Files:**
- Create: `apps/web/src/lib/accountMatch.ts`

**Interfaces:**
- Consumes: `CsvFingerprint` from `@/lib/csvImport`.
- Produces (exported from `lib/accountMatch.ts`):
  - `interface MatchAccount { id: string; bankName: string; accountName: string; accountType: string; color: string; last4?: string | null; }`
  - `type MatchTier = 'exact' | 'strong' | 'weak' | 'none';`
  - `interface RankedAccount { account: MatchAccount; tier: MatchTier; reason: string; }`
  - `interface RankResult { ranked: RankedAccount[]; best: RankedAccount | null; suggestCreate: boolean; }`
  - `function rankAccounts(accounts: MatchAccount[], fingerprint: CsvFingerprint, fileLast4: string | null): RankResult`

- [ ] **Step 1: Write the module**

Create `apps/web/src/lib/accountMatch.ts`:

```ts
import { bankNamesMatch } from '@/lib/csvImport';
import type { CsvFingerprint, CsvType } from '@/lib/csvImport';

export interface MatchAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountType: string;
  color: string;
  last4?: string | null;
}

export type MatchTier = 'exact' | 'strong' | 'weak' | 'none';

export interface RankedAccount {
  account: MatchAccount;
  tier: MatchTier;
  reason: string;
}

export interface RankResult {
  ranked: RankedAccount[];
  best: RankedAccount | null;
  suggestCreate: boolean;
}

/* Does the detected CSV type agree with an account's type? */
function typeMatches(csvType: CsvType, accountType: string): boolean {
  if (csvType === 'credit') return accountType === 'credit';
  if (csvType === 'bank') return ['checking', 'savings', 'debit', 'cash'].includes(accountType);
  return false; // 'unknown' agrees with nothing
}

const SCORE = { exact: 'exact', strong: 'strong', weak: 'weak', none: 'none' } as const;

/* Rank accounts best-first against a parsed file.
   - last-4 equality  → exact
   - bank + type both agree, no last-4 conflict → strong
   - type agrees only  → weak
   A last-4 that is present on BOTH sides but differs disqualifies the account
   (tier 'none') — it is dropped from suggestions, never pre-selected. */
export function rankAccounts(
  accounts: MatchAccount[],
  fingerprint: CsvFingerprint,
  fileLast4: string | null,
): RankResult {
  const scored = accounts.map((account): RankedAccount => {
    const last4Conflict =
      !!fileLast4 && !!account.last4 && fileLast4 !== account.last4;
    const last4Hit = !!fileLast4 && account.last4 === fileLast4;
    const bankHit =
      !!fingerprint.bank && !!account.bankName &&
      bankNamesMatch(fingerprint.bank, account.bankName);
    const typeHit = typeMatches(fingerprint.type, account.accountType);

    if (last4Conflict) {
      return { account, tier: 'none', reason: `Different card (ends in ${account.last4})` };
    }
    if (last4Hit) {
      return { account, tier: 'exact', reason: `Matched account ending in ${fileLast4}` };
    }
    if (bankHit && typeHit) {
      return { account, tier: 'strong', reason: `Looks like your ${account.bankName} ${account.accountType}` };
    }
    if (typeHit) {
      return { account, tier: 'weak', reason: `Best guess by account type` };
    }
    return { account, tier: 'none', reason: 'No matching signals' };
  });

  const order: Record<MatchTier, number> = { exact: 0, strong: 1, weak: 2, none: 3 };
  const ranked = [...scored].sort((a, b) => order[a.tier] - order[b.tier]);

  const best = ranked.find((r) => r.tier !== 'none') ?? null;
  return { ranked, best, suggestCreate: best === null };
}
```

Note: the `SCORE` const above is illustrative scaffolding — delete it; the tier logic uses the `order` map. (Do not ship dead code.)

- [ ] **Step 2: Compile gate**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Inline sanity check of ranking (temporary script)**

Create a throwaway `apps/web/_match_check.mjs` that hardcodes the pure logic expectations and reason about them by hand against `rankAccounts`:

Verify by reading the code that these hold, and write the expected results as a comment in the commit body:
1. file last4 `1234`, account last4 `1234` → `exact`, `best` = that account.
2. fingerprint `{bank:'chase', type:'bank'}`, account `{bankName:'Chase', accountType:'checking', last4:null}` → `strong`.
3. fingerprint `{bank:null, type:'credit'}`, account `{accountType:'credit'}` → `weak`.
4. file last4 `1234`, account last4 `5678` → that account `none`; if it is the only account, `suggestCreate === true`.

Delete `_match_check.mjs` after confirming (do not commit it).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/accountMatch.ts
git commit -m "feat: add account ranking for file-first import"
```

---

## Task 3: ImportReconcileModal — existing-account path

**Files:**
- Create: `apps/web/src/components/ImportReconcileModal.tsx`

**Interfaces:**
- Consumes: `parseCsv`, `detectCsvFingerprint`, `extractFileLast4`, `CsvRow` from `@/lib/csvImport`; `rankAccounts`, `MatchAccount`, `RankedAccount` from `@/lib/accountMatch`.
- Produces:
  - `interface ImportReconcileResult { imported: number; skipped: number; account: MatchAccount; }`
  - `interface Props { accounts: MatchAccount[]; onClose: () => void; onImported: (r: ImportReconcileResult) => void; onAccountCreated: (a: MatchAccount) => void; }`
  - default export `ImportReconcileModal`.

This task builds everything except the "Create new account" inline form (Task 4). The selector still lists a disabled "➕ Create new account" option as a placeholder so the layout is final.

- [ ] **Step 1: Scaffold the modal shell + file drop**

Create `apps/web/src/components/ImportReconcileModal.tsx`. Start `'use client';`. Reuse the drop-zone, parsing, and stats markup patterns from `CsvImportModal.tsx` (drag handlers, `processFile`, FileReader → `parseCsv`). Differences from `CsvImportModal`:
- No `account` prop; instead `accounts: MatchAccount[]`.
- After parse, compute and store the fingerprint + last4 + ranking:

```ts
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

// inside the component, state:
const [rows, setRows] = useState<CsvRow[]>([]);
const [csvBalance, setCsvBalance] = useState<number | undefined>(undefined);
const [fileName, setFileName] = useState('');
const [error, setError] = useState('');
const [ranking, setRanking] = useState<RankResult | null>(null);
const [selectedId, setSelectedId] = useState<string | 'create' | null>(null);
const [importing, setImporting] = useState(false);
const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

function processFile(file: File) {
  setError(''); setRows([]); setResult(null); setRanking(null); setSelectedId(null);
  setFileName(file.name);
  if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.txt')) {
    setError('Please select a CSV or TXT file.'); return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const raw = ev.target?.result as string;
      const { rows: parsed, finalBalance } = parseCsv(raw);
      if (parsed.length === 0) throw new Error('No transactions found in this file.');
      const fingerprint = detectCsvFingerprint(raw);
      const last4 = extractFileLast4(file.name, raw);
      const rank = rankAccounts(accounts, fingerprint, last4);
      setRows(parsed);
      setCsvBalance(finalBalance);
      setRanking(rank);
      setSelectedId(rank.best ? rank.best.account.id : 'create');
    } catch (err: any) {
      setError(err.message ?? 'Could not parse CSV file.');
    }
  };
  reader.readAsText(file);
}
```

- [ ] **Step 2: Render the account selector + confidence label**

Below the stats/table, render a selector seeded from `ranking.ranked` (best-first), plus a `'create'` option. Show the selected candidate's `reason` and a tier-colored badge (`exact`→green, `strong`→primary, `weak`→amber, `create`→muted). Use existing tokens (`--color-green`, `--color-primary`, `--color-amber`, `--color-text-muted`). Example selector:

```tsx
<select
  value={selectedId ?? ''}
  onChange={(e) => setSelectedId(e.target.value as string | 'create')}
  className="w-full px-3 py-2 rounded-xl text-sm"
  style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
>
  {ranking?.ranked.map((r) => (
    <option key={r.account.id} value={r.account.id}>
      {r.account.bankName} — {r.account.accountName}
      {r.tier === 'none' ? ' (no match)' : ''}
    </option>
  ))}
  <option value="create">➕ Create new account…</option>
</select>
```

The confidence line reads the selected ranked entry's `reason` (look it up in `ranking.ranked` by `selectedId`; when `selectedId === 'create'` show "A new account will be created from this file").

- [ ] **Step 3: Duplicate check on selection + import**

When `selectedId` is a real account id, call the existing dedupe endpoint and import like `CsvImportModal` does. Reuse the same request shapes:

```ts
async function handleImport() {
  if (!selectedId || selectedId === 'create') return; // create path handled in Task 4
  const account = accounts.find((a) => a.id === selectedId);
  if (!account) return;
  setImporting(true); setError('');
  try {
    const res = await fetch(`${API}/transactions/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ bankAccountId: account.id, rows, finalBalance: csvBalance }),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    setResult(data);
    onImported({ imported: data.imported, skipped: data.skipped, account });
  } catch {
    setError('Import failed. Please try again.');
  } finally { setImporting(false); }
}
```

(Optional dedupe preview can reuse the `check-duplicates` call from `CsvImportModal`; if included, copy that logic verbatim from `CsvImportModal.checkDups`. If skipped for now, the import endpoint still de-dupes server-side — counts just aren't previewed.)

The footer "Import" button is disabled while `!selectedId`, `selectedId === 'create'` (until Task 4), or `importing`.

- [ ] **Step 4: Success state**

Reuse the success panel from `CsvImportModal` (`result.imported` / `result.skipped`).

- [ ] **Step 5: Compile gate**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual check (rendered via a temporary mount)**

Temporarily render `<ImportReconcileModal accounts={accounts} onClose={()=>{}} onImported={()=>{}} onAccountCreated={()=>{}} />` from the transactions page behind a throwaway button (do not commit that button). Verify:
- Dropping a CSV whose last-4 matches an existing account pre-selects that account with a green "Matched account ending in NNNN".
- A Chase file with no last-4 pre-selects a Chase account as "strong".
- A file with no matching account defaults the selector to "Create new account…".
Remove the throwaway button before committing.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/ImportReconcileModal.tsx
git commit -m "feat: ImportReconcileModal with auto-detected account selection"
```

---

## Task 4: Create-new-account inline path

**Files:**
- Modify: `apps/web/src/components/ImportReconcileModal.tsx`

**Interfaces:**
- Consumes: `POST /bank-accounts` (body `{ bankName, accountName, accountType, color, currency, balance, last4 }`) returning the created `MatchAccount` (the API returns the full bank-account row).
- Produces: calls `onAccountCreated(created)` then imports into `created.id`.

- [ ] **Step 1: Add create-form state seeded from the file**

When `selectedId === 'create'`, show an inline form. Seed defaults from the file when the ranking is computed:

```ts
const [newAcc, setNewAcc] = useState({
  bankName: '', accountName: '', accountType: 'checking', last4: '', color: '#9B6DFF',
});
```

In `processFile`, after computing `fingerprint` and `last4`, prefill:

```ts
const detectedType = fingerprint.type === 'credit' ? 'credit' : 'checking';
const bank = fingerprint.bank
  ? fingerprint.bank.replace(/\b\w/g, (c) => c.toUpperCase())
  : '';
const typeLabel = detectedType.charAt(0).toUpperCase() + detectedType.slice(1);
setNewAcc({
  bankName: bank,
  accountName: `${bank ? bank + ' ' : ''}${typeLabel}${last4 ? ' ••' + last4 : ''}`.trim(),
  accountType: detectedType,
  last4: last4 ?? '',
  color: '#9B6DFF',
});
```

(Default account name follows the spec: `"{Bank} {Type} ••{last4}"`, editable.)

- [ ] **Step 2: Render the inline form**

Fields: bank name (text), account name (text), account type (select: checking/savings/credit/investment), last-4 (text, maxLength 4). All bound to `newAcc`. Match the styling of the existing add-account form in `transactions/page.tsx` (same tokens/inputs).

- [ ] **Step 3: Create-then-import on confirm**

Extend `handleImport` to handle the create path:

```ts
async function handleImport() {
  setImporting(true); setError('');
  try {
    let account: MatchAccount;
    if (selectedId === 'create') {
      if (!newAcc.bankName.trim() || !newAcc.accountName.trim()) {
        setError('Bank name and account name are required.'); setImporting(false); return;
      }
      const res = await fetch(`${API}/bank-accounts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          bankName: newAcc.bankName.trim(),
          accountName: newAcc.accountName.trim(),
          accountType: newAcc.accountType,
          color: newAcc.color,
          currency: 'USD',
          balance: csvBalance ?? 0,
          last4: newAcc.last4 || null,
        }),
      });
      if (!res.ok) throw new Error('Could not create the account.');
      account = await res.json();
      onAccountCreated(account);
    } else {
      const found = accounts.find((a) => a.id === selectedId);
      if (!found) { setImporting(false); return; }
      account = found;
    }

    const imp = await fetch(`${API}/transactions/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ bankAccountId: account.id, rows, finalBalance: csvBalance }),
    });
    if (!imp.ok) throw new Error('Account created, but import failed. Re-run the import into that account.');
    const data = await imp.json();
    setResult(data);
    onImported({ imported: data.imported, skipped: data.skipped, account });
  } catch (err: any) {
    setError(err.message ?? 'Import failed. Please try again.');
  } finally { setImporting(false); }
}
```

Enable the footer button when `selectedId === 'create'` and required fields are filled.

- [ ] **Step 4: Compile gate**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual check**

With the throwaway mount from Task 3: drop a file with no matching account → selector defaults to "Create new account", form prefilled (e.g. "Chase Checking ••1234"). Confirm → a new account appears and the transactions import into it. Then remove the throwaway mount.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ImportReconcileModal.tsx
git commit -m "feat: create account from file during file-first import"
```

---

## Task 5: Wire the file-first entry point into the transactions page

**Files:**
- Modify: `apps/web/src/app/transactions/page.tsx`

**Interfaces:**
- Consumes: `ImportReconcileModal`, `ImportReconcileResult` from `@/components/ImportReconcileModal`.

- [ ] **Step 1: Import the modal and add state**

At the top imports:

```ts
import ImportReconcileModal from '@/components/ImportReconcileModal';
```

Add state near `importAccount` (`page.tsx:90`):

```ts
const [showFileImport, setShowFileImport] = useState(false);
```

- [ ] **Step 2: Add the file-first option to the import menu**

In the import picker dropdown (`page.tsx:560`, the `!showAddAccForm` branch), add a prominent button **above** the "Select account to import into" list:

```tsx
<button
  onClick={() => { setShowFileImport(true); setShowImportPicker(false); }}
  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:brightness-110"
  style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-primary)' }}
>
  <UploadIcon />
  <div className="flex-1 min-w-0">
    <p className="text-sm font-semibold">Import a file — auto-detect account</p>
    <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Drop a CSV; we'll find the right account</p>
  </div>
</button>
```

This keeps both entry points: the new file-first button on top, the existing per-account list (per spec) below it.

- [ ] **Step 3: Render the modal**

Next to the existing `{importAccount && (<CsvImportModal … />)}` block (`page.tsx:2146`), add:

```tsx
{showFileImport && (
  <ImportReconcileModal
    accounts={accounts}
    onClose={() => setShowFileImport(false)}
    onAccountCreated={(a) => setAccounts((prev) => prev.some((x) => x.id === a.id) ? prev : [...prev, a as BankAccount])}
    onImported={(result) => {
      setShowFileImport(false);
      loadTransactions();
      setImportToast(result);
      if (importToastTimer.current) clearTimeout(importToastTimer.current);
      importToastTimer.current = setTimeout(() => setImportToast(null), 6000);
    }}
  />
)}
```

(Mirrors the existing `CsvImportModal.onImported` handler at `page.tsx:2150-2155`. `setImportToast` already accepts `{ imported, skipped, account }`.)

- [ ] **Step 4: Compile gate**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 5: Full manual end-to-end**

`npm run dev:web`, open Transactions → Import:
1. Click "Import a file — auto-detect account". Drop a CSV matching an existing account → that account pre-selected with confidence label → confirm → toast shows, transactions appear under that account.
2. Drop a CSV with no matching account → "Create new account" prefilled → confirm → new account created and populated.
3. The existing per-account import (pick an account from the same menu) still works unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/transactions/page.tsx
git commit -m "feat: file-first import entry point on transactions page"
```

---

## Self-Review

**Spec coverage:**
- File-first entry, account kept → Task 5 (both entry points). ✔
- Shared parser/detection lib → Task 1. ✔
- Ranking by last-4/bank/type + Exact/Strong/Weak/None tiers → Task 2. ✔
- Always-confirm reconcile screen → Task 3. ✔
- Soft last-4 (drop from suggestions, no hard block) → Task 2 (`last4Conflict` → tier `none`). ✔
- Create-new prefilled `"{Bank} {Type} ••{last4}"` → Task 4. ✔
- No API/DB changes → all tasks front-end; endpoints reused verbatim. ✔
- Error handling (parse, create fail, import-after-create fail) → Task 3/4 catch blocks with the spec's messages. ✔

**Placeholder scan:** No "TBD"/"handle edge cases"; the one illustrative `SCORE` const in Task 2 is explicitly flagged for deletion. ✔

**Type consistency:** `CsvRow`, `CsvFingerprint`, `CsvType` defined in Task 1 and consumed by name in Tasks 2-3. `MatchAccount`/`RankedAccount`/`RankResult` defined in Task 2, consumed in Tasks 3-4. `ImportReconcileResult` defined in Task 3, consumed in Task 5. Page casts created account to `BankAccount` (page's local type) in Task 5 — consistent with `accounts: BankAccount[]`. ✔
