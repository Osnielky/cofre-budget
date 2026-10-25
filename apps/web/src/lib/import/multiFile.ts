/* ── Multi-file import helpers ──────────────────────────────────────
   Pure functions shared by the two import modals when the user drops
   several CSV files at once. No DOM, no fetch — fully unit-tested.
─────────────────────────────────────────────────────────────────── */

import type { CsvRow, CsvFingerprint } from '@/lib/csvImport';

export function isAcceptedImportFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.csv') || lower.endsWith('.txt');
}

export interface ParsedFile {
  name: string;
  rows: CsvRow[];
  finalBalance?: number;
}

/* Stable identity for a row — the bank's reference number when the parser
   found one, otherwise the same composite key the server dedupes on. */
export function rowKey(row: CsvRow): string {
  return row.referenceNumber?.trim() || `${row.date}|${row.name}|${row.amount.toFixed(2)}`;
}

/* Concatenate rows from several files for ONE account, dropping rows that
   appear in more than one file (overlapping statement periods). The first
   occurrence wins so file order is preserved. */
export function mergeFileRows(files: ParsedFile[]): { rows: CsvRow[]; repeated: number } {
  const seen = new Set<string>();
  const rows: CsvRow[] = [];
  let repeated = 0;
  for (const f of files) {
    for (const r of f.rows) {
      const key = rowKey(r);
      if (seen.has(key)) { repeated++; continue; }
      seen.add(key);
      rows.push(r);
    }
  }
  return { rows, repeated };
}

export function dateRangeOf(rows: CsvRow[]): { from: string; to: string } | null {
  if (rows.length === 0) return null;
  let from = rows[0].date, to = rows[0].date;
  for (const r of rows) {
    if (r.date < from) from = r.date;
    if (r.date > to) to = r.date;
  }
  return { from, to };
}

function latestDate(rows: CsvRow[]): string {
  return dateRangeOf(rows)?.to ?? '';
}

/* Which file's closing balance describes the account NOW: the one whose
   newest transaction is the most recent. Files without a balance column are
   ignored; ties go to the later file in the list. */
export function pickFinalBalance(files: ParsedFile[]): number | undefined {
  const idx = balanceCarrierIndex(files);
  return idx === -1 ? undefined : files[idx].finalBalance;
}

export function balanceCarrierIndex(files: ParsedFile[]): number {
  let best = -1, bestDate = '';
  files.forEach((f, i) => {
    if (f.finalBalance === undefined) return;
    const d = latestDate(f.rows);
    if (best === -1 || d >= bestDate) { best = i; bestDate = d; }
  });
  return best;
}

/* For the file-first flow several files may land in the same account. Only
   one of them should send `finalBalance` (the server applies it blindly, so
   an older statement imported last would overwrite a newer balance). Returns
   the indexes that carry the balance, one per target. */
export function balanceCarriers<T extends ParsedFile & { target: string }>(files: T[]): Set<number> {
  const byTarget = new Map<string, number[]>();
  files.forEach((f, i) => {
    const list = byTarget.get(f.target) ?? [];
    list.push(i);
    byTarget.set(f.target, list);
  });
  const carriers = new Set<number>();
  for (const idxs of byTarget.values()) {
    const local = balanceCarrierIndex(idxs.map((i) => files[i]));
    if (local !== -1) carriers.add(idxs[local]);
  }
  return carriers;
}

/* Files that need a brand-new account are grouped so six statements of the
   same new card create ONE account, not six. Same detected bank + type +
   last-4 ⇒ same key. */
export function createKeyFor(fingerprint: CsvFingerprint, last4: string | null): string {
  return `create:${fingerprint.bank ?? ''}|${fingerprint.type}|${last4 ?? ''}`;
}

export interface NewAccountDraft {
  bankName: string;
  accountName: string;
  accountType: 'checking' | 'savings' | 'credit' | 'investment';
  last4: string;
  color: string;
}

export function defaultNewAccount(fingerprint: CsvFingerprint, last4: string | null, canonicalBank: string): NewAccountDraft {
  const accountType: NewAccountDraft['accountType'] =
    fingerprint.type === 'credit' ? 'credit' : fingerprint.type === 'investment' ? 'investment' : 'checking';
  const typeLabel = accountType.charAt(0).toUpperCase() + accountType.slice(1);
  return {
    bankName: canonicalBank,
    accountName: `${canonicalBank ? canonicalBank + ' ' : ''}${typeLabel}${last4 ? ' ••' + last4 : ''}`.trim(),
    accountType,
    last4: last4 ?? '',
    color: '#9B6DFF',
  };
}

export interface ImportAccount {
  id: string; bankName: string; accountName: string; accountType: string; color: string;
}

export interface FileImportOutcome {
  fileName: string;
  imported: number;
  skipped: number;
  account: ImportAccount;
  dateRange: { from: string; to: string } | null;
}

export interface ImportSummary {
  files: number;
  imported: number;
  skipped: number;
  accounts: ImportAccount[];
  dateRange: { from: string; to: string } | null;
}

export function summarizeImports(outcomes: FileImportOutcome[]): ImportSummary {
  const accounts: ImportAccount[] = [];
  let imported = 0, skipped = 0;
  const froms: string[] = [], tos: string[] = [];
  for (const o of outcomes) {
    imported += o.imported;
    skipped += o.skipped;
    if (!accounts.some((a) => a.id === o.account.id)) accounts.push(o.account);
    if (o.dateRange) { froms.push(o.dateRange.from); tos.push(o.dateRange.to); }
  }
  const dateRange = froms.length
    ? { from: froms.reduce((a, b) => (b < a ? b : a)), to: tos.reduce((a, b) => (b > a ? b : a)) }
    : null;
  return { files: outcomes.length, imported, skipped, accounts, dateRange };
}
