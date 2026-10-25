'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { isLiability } from '@/lib/accountTypes';
import { parseCsv, detectCsvFingerprint, bankNamesMatch, extractFileLast4 } from '@/lib/csvImport';
import type { CsvRow } from '@/lib/csvImport';
import { isAcceptedImportFile, mergeFileRows, pickFinalBalance, dateRangeOf } from '@/lib/import/multiFile';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface BankAccount {
  id: string; bankName: string; accountName: string; accountType: string; color: string;
  last4?: string | null; balance?: number;
}

interface ImportResult {
  imported: number; skipped: number; account: BankAccount;
  dateRange: { from: string; to: string } | null;
}

interface Props {
  account: BankAccount;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}

interface Warning { level: 'warn' | 'error'; message: string; }

/* One dropped file, already parsed and validated against the account. */
interface FileEntry {
  id: string;
  name: string;
  rows: CsvRow[];
  finalBalance?: number;
  warnings: Warning[];
  error?: string;
}

const ACC_ICONS: Record<string, string> = {
  checking: '💳', savings: '🏦', cash: '💵', credit: '💳', investment: '📈', debit: '💳',
  line_of_credit: '💳', paypal: '🅿️', merchant: '🏪', mortgage: '🏠',
  other_asset: '📦', other_liability: '📉', loan: '🤝',
};

interface DupCheck {
  newCount: number; duplicateCount: number; duplicateIds: Set<string>;
  /* Duplicates that live in another account (or one that was deleted). */
  elsewhereCount: number; elsewhereAccounts: string[];
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve((ev.target?.result as string) ?? '');
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

let nextId = 0;

export default function CsvImportModal({ account, onClose, onImported }: Props) {
  const [files, setFiles]       = useState<FileEntry[]>([]);
  const [error, setError]       = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult]     = useState<{ imported: number; skipped: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dupCheck, setDupCheck] = useState<DupCheck | null>(null);
  const [dupChecking, setDupChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validFiles = useMemo(() => files.filter((f) => !f.error && f.rows.length > 0), [files]);
  // All files go into ONE account, so their rows merge into a single import;
  // rows repeated across overlapping statements are dropped up front.
  const merged     = useMemo(() => mergeFileRows(validFiles), [validFiles]);
  const rows       = merged.rows;
  const csvBalance = useMemo(() => pickFinalBalance(validFiles), [validFiles]);

  // Re-check duplicates whenever the set of rows changes.
  useEffect(() => {
    if (rows.length === 0) { setDupCheck(null); return; }
    let cancelled = false;
    setDupChecking(true); setDupCheck(null);
    (async () => {
      try {
        const res = await fetch(`${API}/transactions/check-duplicates`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ bankAccountId: account.id, rows }),
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setDupCheck({
          newCount: data.newCount, duplicateCount: data.duplicateCount, duplicateIds: new Set(data.duplicateExternalIds),
          elsewhereCount: data.elsewhereCount ?? 0, elsewhereAccounts: data.elsewhereAccounts ?? [],
        });
      } catch {
        // network/CORS error — silently skip dup check
      } finally { if (!cancelled) setDupChecking(false); }
    })();
    return () => { cancelled = true; };
  }, [rows, account.id]);

  async function addFiles(list: File[]) {
    setError(''); setResult(null);
    const fresh: FileEntry[] = [];
    for (const file of list) {
      if (files.some((f) => f.name === file.name) || fresh.some((f) => f.name === file.name)) continue;
      const base: FileEntry = { id: `f${nextId++}`, name: file.name, rows: [], warnings: [] };
      if (!isAcceptedImportFile(file.name)) { fresh.push({ ...base, error: 'Not a CSV or TXT file.' }); continue; }
      try {
        const raw = await readFileText(file);
        const { rows: parsed, finalBalance } = parseCsv(raw);
        if (parsed.length === 0) throw new Error('No transactions found in this file.');
        fresh.push({ ...base, rows: parsed, finalBalance, warnings: validate(parsed, account, file.name, raw) });
      } catch (err: unknown) {
        fresh.push({ ...base, error: err instanceof Error ? err.message : 'Could not parse CSV file.' });
      }
    }
    if (fresh.length) setFiles((prev) => [...prev, ...fresh]);
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (list.length) addFiles(list);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault(); setDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const list = Array.from(e.dataTransfer.files ?? []);
    if (list.length) addFiles(list);
  }

  async function handleImport() {
    setImporting(true); setError(''); setProgress(null);
    try {
      // Chunked so a stack of statements shows real progress and keeps each
      // request small. finalBalance rides on the last chunk only.
      const CHUNK = 200;
      let imported = 0, skipped = 0;
      setProgress({ done: 0, total: rows.length });
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const isLast = i + CHUNK >= rows.length;
        const res = await fetch(`${API}/transactions/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ bankAccountId: account.id, rows: slice, finalBalance: isLast ? csvBalance : undefined }),
        });
        if (!res.ok) throw new Error('Import failed partway through. Re-import to finish — rows already saved are skipped.');
        const data = await res.json();
        imported += data.imported ?? 0;
        skipped += data.skipped ?? 0;
        setProgress({ done: Math.min(i + CHUNK, rows.length), total: rows.length });
      }
      setResult({ imported, skipped });
      onImported({ imported, skipped, account, dateRange: dateRangeOf(rows) });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed. Please try again.');
    } finally { setImporting(false); }
  }

  // Warnings: a file's own name is prefixed only when several files are loaded.
  const warnings: Warning[] = validFiles.flatMap((f) =>
    f.warnings.map((w) => validFiles.length > 1 ? { ...w, message: `${f.name}: ${w.message}` } : w));
  const hasErrors   = warnings.some((w) => w.level === 'error');
  const income      = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const accIcon     = ACC_ICONS[account.accountType] ?? '🏦';
  const accLabel    = `${account.bankName} — ${account.accountName}`;
  const newCount    = dupCheck ? dupCheck.newCount : rows.length;

  const dropLabel = dragging ? 'Drop to add'
    : files.length === 0 ? 'Click to select or drag & drop — several files at once is fine'
    : 'Add more files';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !importing) onClose(); }}>

      <div className="w-full max-w-xl flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)', background: `linear-gradient(135deg, ${account.color}10 0%, transparent 50%)` }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{ background: `${account.color}22`, boxShadow: `0 0 0 1px ${account.color}44` }}>
              {accIcon}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>Importing into</p>
              <p className="text-sm font-bold truncate" style={{ color: account.color }}>{accLabel}</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md capitalize shrink-0"
              style={{ background: `${account.color}20`, color: account.color }}>
              {account.accountType}
            </span>
          </div>
          <button onClick={onClose} disabled={importing}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] transition-colors shrink-0 disabled:opacity-40"
            style={{ color: 'var(--color-text-muted)' }}>✕</button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto flex-1">

          {/* Drop zone */}
          {!result && (
            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
              <input ref={inputRef} type="file" accept=".csv,.txt" multiple onChange={handleFile} className="hidden" />
              <button onClick={() => inputRef.current?.click()} type="button" disabled={importing}
                className={`w-full rounded-xl border-2 border-dashed flex items-center justify-center gap-3 transition-all ${files.length ? 'py-3' : 'py-6'}`}
                style={{
                  borderColor: dragging ? account.color : rows.length ? 'color-mix(in srgb, var(--color-green) 35%, transparent)' : 'var(--color-elevated)',
                  background: dragging ? `${account.color}08` : rows.length ? 'color-mix(in srgb, var(--color-green) 5%, transparent)' : 'var(--color-elevated)',
                }}>
                <span className="text-xl">{dragging ? '📥' : files.length ? '➕' : '📂'}</span>
                <div className="text-left">
                  <p className="text-sm font-semibold" style={{ color: rows.length ? 'var(--color-green)' : 'var(--color-text-secondary)' }}>
                    {dropLabel}
                  </p>
                  {!files.length && !dragging && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      Supports Chase, Bank of America, Wells Fargo & most banks
                    </p>
                  )}
                </div>
              </button>
            </div>
          )}

          {/* File list */}
          {files.length > 0 && !result && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
              {files.map((f, i) => (
                <div key={f.id} className="flex items-center gap-2.5 px-3 py-2 text-xs"
                  style={{ borderTop: i ? '1px solid var(--color-border)' : 'none', background: 'var(--color-elevated)' }}>
                  <span className="shrink-0">{f.error ? '⚠️' : '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{f.name}</p>
                    <p className="truncate" style={{ color: f.error ? 'var(--color-rose)' : 'var(--color-text-muted)' }}>
                      {f.error ?? <>
                        {f.rows.length.toLocaleString()} transaction{f.rows.length !== 1 ? 's' : ''}
                        {(() => { const r = dateRangeOf(f.rows); return r ? <> · {r.from} → {r.to}</> : null; })()}
                        {f.finalBalance !== undefined && <> · balance ${f.finalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</>}
                      </>}
                    </p>
                  </div>
                  <button type="button" onClick={() => removeFile(f.id)} disabled={importing} aria-label={`Remove ${f.name}`}
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 hover:bg-[color-mix(in_srgb,var(--color-rose)_12%,transparent)] transition-colors disabled:opacity-40"
                    style={{ color: 'var(--color-text-muted)' }}>✕</button>
                </div>
              ))}
              {merged.repeated > 0 && (
                <p className="px-3 py-2 text-[11px]" style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                  {merged.repeated} transaction{merged.repeated !== 1 ? 's' : ''} appeared in more than one file and {merged.repeated !== 1 ? 'were' : 'was'} counted once.
                </p>
              )}
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && !result && warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-xs"
              style={{
                background: w.level === 'error' ? 'color-mix(in srgb, var(--color-rose) 8%, transparent)' : 'color-mix(in srgb, var(--color-amber) 8%, transparent)',
                border: `1px solid ${w.level === 'error' ? 'color-mix(in srgb, var(--color-rose) 25%, transparent)' : 'color-mix(in srgb, var(--color-amber) 20%, transparent)'}`,
                color: w.level === 'error' ? 'var(--color-rose)' : 'var(--color-amber)',
              }}>
              <span className="shrink-0 mt-0.5">{w.level === 'error' ? '✕' : '⚠'}</span>
              <span className="leading-relaxed">{w.message}</span>
            </div>
          ))}

          {/* Stats + table */}
          {rows.length > 0 && !result && (
            <>
              {/* Stats bar */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Total',   value: rows.length,                                               color: 'var(--color-primary)' },
                  { label: 'New',     value: dupChecking ? '…' : newCount,                             color: 'var(--color-green)' },
                  { label: 'Skipped', value: dupChecking ? '…' : (dupCheck?.duplicateCount ?? 0),      color: dupCheck?.duplicateCount ? 'var(--color-amber)' : 'var(--color-text-muted)' },
                  { label: 'Income',  value: income > 0 ? `+$${income.toFixed(2)}` : '$0.00',          color: income > 0 ? 'var(--color-green)' : 'var(--color-text-muted)' },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col items-center py-2.5 rounded-xl"
                    style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                    <p className="text-[9px] uppercase tracking-widest font-bold" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                    <p className="font-black text-base mt-0.5 tabular-nums" style={{ color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Duplicate notice */}
              {dupCheck && dupCheck.duplicateCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
                  style={{ background: 'color-mix(in srgb, var(--color-amber) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--color-amber) 18%, transparent)' }}>
                  <span style={{ color: 'var(--color-amber)' }}>⟳</span>
                  <span style={{ color: 'var(--color-amber)' }}>
                    <strong>{dupCheck.duplicateCount} already imported</strong> — skipped automatically.
                    {dupCheck.newCount > 0
                      ? <> Only <strong>{dupCheck.newCount} new</strong> will be added.</>
                      : <> Nothing new to add.</>}
                    {dupCheck.elsewhereCount > 0 && (
                      <> {dupCheck.elsewhereCount} of them {dupCheck.elsewhereCount === 1 ? 'lives' : 'live'} in {formatElsewhere(dupCheck.elsewhereAccounts)}, not in this account.</>
                    )}
                  </span>
                </div>
              )}

              {/* Table */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                <div className="max-h-52 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0">
                      <tr style={{ background: 'var(--color-elevated)', borderBottom: '1px solid var(--color-border)' }}>
                        <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Date</th>
                        <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Description</th>
                        <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 150).map((row, i) => {
                        const extId = row.referenceNumber ? `csv_${row.referenceNumber}` : null;
                        const compositeKey = `csv_${row.date}|${row.name}|${row.amount.toFixed(2)}`;
                        const isDup = dupCheck
                          ? (extId ? dupCheck.duplicateIds.has(extId) : false) || dupCheck.duplicateIds.has(compositeKey)
                          : false;
                        return (
                          <tr key={i} style={{ borderTop: '1px solid var(--color-border)', opacity: isDup ? 0.35 : 1 }}>
                            <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>{row.date}</td>
                            <td className="px-3 py-2 truncate max-w-xs" style={{ color: isDup ? 'var(--color-text-muted)' : 'var(--color-text-primary)', textDecoration: isDup ? 'line-through' : 'none' }}>{row.name}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap"
                              style={{ color: isDup ? 'var(--color-text-muted)' : row.amount >= 0 ? 'var(--color-green)' : 'var(--color-text-primary)' }}>
                              {row.amount >= 0 ? '+' : ''}${Math.abs(row.amount).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {rows.length > 150 && (
                    <p className="text-center py-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      +{rows.length - 150} more transactions
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Success */}
          {result && (
            <div className="py-8 flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--color-green) 30%, transparent)' }}>🎉</div>
              <div>
                <p className="font-bold text-lg" style={{ color: 'var(--color-green)' }}>{result.imported} transactions imported</p>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {validFiles.length > 1 && <>from {validFiles.length} files</>}
                  {validFiles.length > 1 && result.skipped > 0 && <> · </>}
                  {result.skipped > 0 && <>{result.skipped} duplicates skipped</>}
                </p>
              </div>
            </div>
          )}

          {error && <p className="text-xs px-1" style={{ color: 'var(--color-card-orange)' }}>{error}</p>}
        </div>

        {/* Import progress */}
        {importing && progress && (
          <div className="px-5 pt-3">
            <div className="flex items-center justify-between mb-1.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              <span>Importing transactions…</span>
              <span className="tabular-nums">{progress.done.toLocaleString()} / {progress.total.toLocaleString()}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
              <div className="h-full rounded-full transition-all duration-200 ease-out"
                style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`, background: account.color }} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderTop: '1px solid var(--color-border)' }}>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {!result && validFiles.length > 1 && <>{validFiles.length} files merged</>}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={importing}
              className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)] transition-colors disabled:opacity-40"
              style={{ color: 'var(--color-text-secondary)' }}>
              {result ? 'Close' : 'Cancel'}
            </button>
            {rows.length > 0 && !result && (() => {
              const nothingNew = dupCheck && dupCheck.newCount === 0;
              if (nothingNew) {
                // Everything's already imported — but if the newest file's ending
                // balance differs from the account's, let the user refresh just the
                // balance (sends the import; the server applies finalBalance with 0 new rows).
                const canUpdateBalance = csvBalance !== undefined && Number(account.balance ?? 0) !== csvBalance;
                if (canUpdateBalance) return (
                  <button onClick={handleImport} disabled={importing}
                    className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-50 transition-all"
                    style={{ background: account.color }}>
                    {importing ? 'Updating…' : `Update balance to $${csvBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                  </button>
                );
                return (
                  <span className="text-xs font-semibold px-3 py-2 rounded-xl"
                    style={{ background: 'color-mix(in srgb, var(--color-green) 12%, transparent)', color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 25%, transparent)' }}>
                    ✓ All already imported
                  </span>
                );
              }
              return (
                <button onClick={handleImport} disabled={importing || hasErrors || dupChecking}
                  className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-50 transition-all"
                  style={{ background: hasErrors ? 'color-mix(in srgb, var(--color-rose) 30%, transparent)' : account.color }}>
                  {importing ? 'Importing…' : dupChecking ? 'Checking…'
                    : dupCheck ? `Import ${dupCheck.newCount} transaction${dupCheck.newCount !== 1 ? 's' : ''}`
                    : `Import ${rows.length} transactions`}
                </button>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

/* "another account (Chase — Checking)" / "a deleted account" / "2 other places" */
function formatElsewhere(names: string[]): string {
  if (names.length === 0) return 'another account';
  if (names.length === 1) return names[0] === 'a deleted account' ? 'a deleted account' : `another account (${names[0]})`;
  return `${names.length} other places (${names.join(', ')})`;
}

/* ── Validation ─────────────────────────────────────────────────── */

function validate(rows: CsvRow[], account: BankAccount, fileName: string, rawText = ''): Warning[] {
  const warnings: Warning[] = [];

  /* ── Primary: bank format fingerprint ── */
  const { bank: csvBank, type: csvType } = detectCsvFingerprint(rawText);
  const acctIsCredit     = isLiability(account.accountType);
  const acctIsBank       = ['checking', 'savings', 'cash', 'debit', 'paypal', 'merchant'].includes(account.accountType);
  const acctIsInvestment = account.accountType === 'investment';

  // Wrong account TYPE (credit vs bank vs investment)
  if (csvType === 'bank' && acctIsCredit) {
    warnings.push({ level: 'error', message: 'These transactions do not belong to this account.' });
  }
  if (csvType === 'credit' && acctIsBank) {
    warnings.push({ level: 'error', message: 'These transactions do not belong to this account.' });
  }
  if (csvType === 'investment' && !acctIsInvestment) {
    warnings.push({ level: 'error', message: 'These transactions do not belong to this account.' });
  }
  if (csvType !== 'investment' && csvType !== 'unknown' && acctIsInvestment) {
    warnings.push({ level: 'error', message: 'These transactions do not belong to this account.' });
  }

  // Wrong BANK — same account type but different institution
  if (csvBank) {
    const csvBankLabel = csvBank.charAt(0).toUpperCase() + csvBank.slice(1);
    if (account.bankName && !bankNamesMatch(csvBank, account.bankName)) {
      // Bank name is set and doesn't match
      warnings.push({
        level: 'error',
        message: `This file is from ${csvBankLabel} but "${account.accountName}" is at ${account.bankName}.`,
      });
    } else if (!account.bankName) {
      // Account has no bank name set — can't verify, warn the user
      warnings.push({
        level: 'warn',
        message: `This file appears to be from ${csvBankLabel}. Make sure "${account.accountName}" is also a ${csvBankLabel} account.`,
      });
    }
  }

  /* ── Secondary: last-4 digit check (account-level, not just bank-level) ── */
  const fileLast4 = extractFileLast4(fileName, rawText);

  if (fileLast4 && account.last4 && fileLast4 !== account.last4) {
    warnings.push({ level: 'error', message: 'These transactions do not belong to this account.' });
  }
  if (fileLast4 && !account.last4) {
    warnings.push({ level: 'warn', message: `File appears to be for account ending in ${fileLast4}. Set "Last 4" on "${account.accountName}" in Settings to auto-detect next time.` });
  }

  const positiveCount = rows.filter((r) => r.amount > 0).length;
  const negativeCount = rows.filter((r) => r.amount < 0).length;
  const total = rows.length;

  /* Credit cards: expect mostly negative amounts (charges) */
  if (isLiability(account.accountType) && positiveCount / total > 0.8) {
    warnings.push({
      level: 'warn',
      message: `This CSV has mostly positive amounts but "${account.accountName}" is a credit card — credit card exports usually show charges as positive. Double-check you exported the right account.`,
    });
  }

  /* Checking/savings: a file with zero negative rows is suspicious */
  if (['checking', 'savings', 'debit'].includes(account.accountType) && negativeCount === 0) {
    warnings.push({
      level: 'warn',
      message: `All ${total} transactions are income — no expenses found. Make sure this CSV belongs to "${account.accountName}".`,
    });
  }

  /* Detect likely wrong bank from filename */
  const fileLower = fileName.toLowerCase();
  const bankLower = account.bankName.toLowerCase();
  const BANK_KEYWORDS: Record<string, string[]> = {
    chase:     ['chase'],
    'bank of america': ['bofa', 'bankofamerica', 'boa'],
    'wells fargo': ['wellsfargo', 'wells'],
    citi:      ['citi'],
    capital:   ['capital'],
    amex:      ['amex', 'americanexpress'],
  };
  for (const [bank, keywords] of Object.entries(BANK_KEYWORDS)) {
    const fileMatchesBank   = keywords.some((k) => fileLower.includes(k)) || fileLower.includes(bank);
    const accountMatchesBank = bankLower.includes(bank) || keywords.some((k) => bankLower.includes(k));
    if (fileMatchesBank && !accountMatchesBank) {
      warnings.push({
        level: 'warn',
        message: `The file name suggests a ${bank.charAt(0).toUpperCase() + bank.slice(1)} export, but you're importing into "${account.bankName} — ${account.accountName}". Make sure this is the right account.`,
      });
      break;
    }
  }

  return warnings;
}
