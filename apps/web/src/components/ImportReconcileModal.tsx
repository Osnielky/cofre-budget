'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { parseCsv, detectCsvFingerprint, extractFileLast4, bankNamesMatch } from '@/lib/csvImport';
import type { CsvRow, CsvFingerprint } from '@/lib/csvImport';
import { rankAccounts } from '@/lib/accountMatch';
import type { MatchAccount, RankResult, MatchTier } from '@/lib/accountMatch';
import { BANKS } from '@/components/BankSelect';
import {
  isAcceptedImportFile, dateRangeOf, balanceCarriers, createKeyFor, defaultNewAccount, summarizeImports,
} from '@/lib/import/multiFile';
import type { NewAccountDraft, FileImportOutcome } from '@/lib/import/multiFile';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export type ImportReconcileResult = FileImportOutcome;

interface Props {
  accounts: MatchAccount[];
  onClose: () => void;
  /** Called once per batch with every file that imported successfully. */
  onImported: (results: ImportReconcileResult[]) => void;
  onAccountCreated: (a: MatchAccount) => void;
}

interface DupCheck {
  newCount: number; duplicateCount: number; duplicateIds: Set<string>;
  /* Duplicates that live in another account (or one that was deleted). */
  elsewhereCount: number; elsewhereAccounts: string[];
}

/* One dropped file. `target` is an account id, a create-key (see
   createKeyFor — files for the same new account share one), or null when
   the file could not be parsed. */
interface FileEntry {
  id: string;
  name: string;
  rows: CsvRow[];
  finalBalance?: number;
  fingerprint: CsvFingerprint;
  last4: string | null;
  ranking: RankResult | null;
  target: string | null;
  error?: string;
  dupCheck: DupCheck | null;
  dupChecking: boolean;
  showPreview: boolean;
}

interface FileOutcome extends FileImportOutcome { error?: string }

const TIER_COLORS: Record<MatchTier, string> = {
  exact:  'var(--color-green)',
  strong: 'var(--color-primary)',
  weak:   'var(--color-amber)',
  none:   'var(--color-text-muted)',
};

const TIER_LABELS: Record<MatchTier, string> = {
  exact:  'Exact match',
  strong: 'Strong match',
  weak:   'Weak match',
  none:   'No match',
};

const ACC_COLORS = ['#9B6DFF', '#4FBF7F', '#F07A3E', '#F5C842', '#4BA8D8', '#E879A0'];

const isCreateKey = (target: string | null): target is string => !!target && target.startsWith('create:');

/* Map a detected fingerprint bank (lowercase, e.g. "bank of america", "citi")
   to the BANKS registry's canonical display name so the saved account resolves
   to a known logo. Falls back to title-case when no registry entry matches. */
function canonicalBankName(detected: string | null): string {
  if (!detected) return '';
  const hit = BANKS.find((b) => bankNamesMatch(detected, b.name));
  return hit ? hit.name : detected.replace(/\b\w/g, (c) => c.toUpperCase());
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve((ev.target?.result as string) ?? '');
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

function detectedLabel(fp: CsvFingerprint): string {
  const bank = fp.bank ? canonicalBankName(fp.bank) : '';
  const type = fp.type === 'bank' ? 'checking' : fp.type === 'unknown' ? '' : fp.type;
  return [bank, type].filter(Boolean).join(' ') || 'Unrecognized format';
}

/* "another account (Chase — Checking)" / "a deleted account" / "2 other places" */
function formatElsewhere(names: string[]): string {
  if (names.length === 0) return 'another account';
  if (names.length === 1) return names[0] === 'a deleted account' ? 'a deleted account' : `another account (${names[0]})`;
  return `${names.length} other places (${names.join(', ')})`;
}

let nextId = 0;

export default function ImportReconcileModal({ accounts, onClose, onImported, onAccountCreated }: Props) {
  const [entries, setEntries]       = useState<FileEntry[]>([]);
  const [drafts, setDrafts]         = useState<Record<string, NewAccountDraft>>({});
  const [error, setError]           = useState('');
  const [importing, setImporting]   = useState(false);
  const [progress, setProgress]     = useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes]     = useState<FileOutcome[] | null>(null);
  const [dragging, setDragging]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const patchEntry = (id: string, patch: Partial<FileEntry> | ((e: FileEntry) => Partial<FileEntry>)) =>
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e));

  async function checkDups(entryId: string, rows: CsvRow[], accountId: string) {
    patchEntry(entryId, { dupChecking: true, dupCheck: null });
    try {
      const res = await fetch(`${API}/transactions/check-duplicates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ bankAccountId: accountId, rows }),
      });
      if (!res.ok) return;
      const data = await res.json();
      // The user may have re-targeted this file while the request was in flight.
      patchEntry(entryId, (e) => e.target === accountId
        ? { dupCheck: {
            newCount: data.newCount, duplicateCount: data.duplicateCount, duplicateIds: new Set(data.duplicateExternalIds),
            elsewhereCount: data.elsewhereCount ?? 0, elsewhereAccounts: data.elsewhereAccounts ?? [],
          } }
        : {});
    } catch {
      // network/CORS error — silently skip dup check
    } finally { patchEntry(entryId, { dupChecking: false }); }
  }

  async function addFiles(files: File[]) {
    setError(''); setOutcomes(null);
    const fresh: FileEntry[] = [];
    for (const file of files) {
      if (entries.some((e) => e.name === file.name) || fresh.some((e) => e.name === file.name)) continue; // already in the batch
      const base: FileEntry = {
        id: `f${nextId++}`, name: file.name, rows: [], fingerprint: { bank: null, type: 'unknown' }, last4: null,
        ranking: null, target: null, dupCheck: null, dupChecking: false, showPreview: false,
      };
      if (!isAcceptedImportFile(file.name)) { fresh.push({ ...base, error: 'Not a CSV or TXT file.' }); continue; }
      try {
        const raw = await readFileText(file);
        const { rows, finalBalance } = parseCsv(raw);
        if (rows.length === 0) throw new Error('No transactions found in this file.');
        const fingerprint = detectCsvFingerprint(raw);
        const last4 = extractFileLast4(file.name, raw);
        const ranking = rankAccounts(accounts, fingerprint, last4);
        const target = ranking.best ? ranking.best.account.id : createKeyFor(fingerprint, last4);
        fresh.push({ ...base, rows, finalBalance, fingerprint, last4, ranking, target });
      } catch (err: unknown) {
        fresh.push({ ...base, error: err instanceof Error ? err.message : 'Could not parse CSV file.' });
      }
    }
    if (fresh.length === 0) return;

    // One draft per new-account key, prefilled from the first file that needs it.
    setDrafts((prev) => {
      const next = { ...prev };
      for (const e of fresh) {
        if (isCreateKey(e.target) && !next[e.target]) {
          next[e.target] = defaultNewAccount(e.fingerprint, e.last4, canonicalBankName(e.fingerprint.bank));
        }
      }
      return next;
    });
    setEntries((prev) => [...prev, ...fresh]);
    for (const e of fresh) {
      if (e.target && !isCreateKey(e.target)) checkDups(e.id, e.rows, e.target);
    }
  }

  function removeFile(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file after removing it
    if (files.length) addFiles(files);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault(); setDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) addFiles(files);
  }

  function handleTargetChange(entry: FileEntry, value: string) {
    if (value === 'create') {
      const key = createKeyFor(entry.fingerprint, entry.last4);
      setDrafts((prev) => prev[key] ? prev : { ...prev, [key]: defaultNewAccount(entry.fingerprint, entry.last4, canonicalBankName(entry.fingerprint.bank)) });
      patchEntry(entry.id, { target: key, dupCheck: null });
      return;
    }
    patchEntry(entry.id, { target: value, dupCheck: null });
    checkDups(entry.id, entry.rows, value);
  }

  const valid = entries.filter((e): e is FileEntry & { target: string } => !e.error && e.rows.length > 0 && !!e.target);
  const createKeysInUse = [...new Set(valid.map((e) => e.target).filter(isCreateKey))];
  const draftReady = (d: NewAccountDraft | undefined) => !!d && d.bankName.trim() !== '' && d.accountName.trim() !== '';
  const draftsReady = createKeysInUse.every((k) => draftReady(drafts[k]));

  async function handleImport() {
    setImporting(true); setError(''); setProgress(null);
    const created = new Map<string, MatchAccount>();
    const results: FileOutcome[] = [];
    const carriers = balanceCarriers(valid.map((e) => ({ name: e.name, rows: e.rows, finalBalance: e.finalBalance, target: e.target })));
    const total = valid.reduce((s, e) => s + e.rows.length, 0);
    let done = 0;
    setProgress({ done, total });

    for (let fi = 0; fi < valid.length; fi++) {
      const entry = valid[fi];
      const target = entry.target;
      const dateRange = dateRangeOf(entry.rows);
      try {
        let account: MatchAccount;
        if (isCreateKey(target)) {
          const existing = created.get(target);
          if (existing) account = existing;
          else {
            const d = drafts[target];
            if (!draftReady(d)) throw new Error('Bank name and account name are required.');
            const res = await fetch(`${API}/bank-accounts`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
              body: JSON.stringify({
                bankName: d.bankName.trim(),
                accountName: d.accountName.trim(),
                accountType: d.accountType,
                color: d.color,
                currency: 'USD',
                balance: entry.finalBalance ?? 0,
                last4: d.last4 || null,
              }),
            });
            if (!res.ok) throw new Error('Could not create the account.');
            account = await res.json();
            created.set(target, account);
            onAccountCreated(account);
          }
        } else {
          const found = accounts.find((a) => a.id === target);
          if (!found) throw new Error('That account no longer exists.');
          account = found;
        }

        // Import in chunks so we can show real progress and keep each request
        // small. Dedup is per-row (server-side), so chunks are independent.
        // finalBalance rides on the last chunk of the one file per account whose
        // statement is newest, so an older statement never overwrites the balance.
        const CHUNK = 200;
        const sendsBalance = carriers.has(fi);
        let imported = 0, skipped = 0;
        for (let i = 0; i < entry.rows.length; i += CHUNK) {
          const slice = entry.rows.slice(i, i + CHUNK);
          const isLast = i + CHUNK >= entry.rows.length;
          const imp = await fetch(`${API}/transactions/import`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ bankAccountId: account.id, rows: slice, finalBalance: isLast && sendsBalance ? entry.finalBalance : undefined }),
          });
          if (!imp.ok) throw new Error('Import failed partway through. Re-import this file to finish.');
          const data = await imp.json();
          imported += data.imported ?? 0;
          skipped += data.skipped ?? 0;
          done += slice.length;
          setProgress({ done, total });
        }
        results.push({ fileName: entry.name, imported, skipped, account, dateRange });
      } catch (err: unknown) {
        done += entry.rows.length;
        setProgress({ done, total });
        results.push({
          fileName: entry.name, imported: 0, skipped: 0, dateRange,
          account: { id: '', bankName: '', accountName: '', accountType: '', color: '' },
          error: err instanceof Error ? err.message : 'Import failed.',
        });
      }
    }

    setOutcomes(results);
    setImporting(false);
    const ok = results.filter((r) => !r.error);
    if (ok.length) onImported(ok);
    else setError('Nothing was imported. Check the errors below and try again.');
  }

  /* ── Derived totals ── */
  const totalRows   = valid.reduce((s, e) => s + e.rows.length, 0);
  const anyChecking = valid.some((e) => e.dupChecking);
  const newCount    = valid.reduce((s, e) => s + (e.dupCheck ? e.dupCheck.newCount : e.rows.length), 0);
  const dupCount    = valid.reduce((s, e) => s + (e.dupCheck?.duplicateCount ?? 0), 0);
  const income      = valid.reduce((s, e) => s + e.rows.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0), 0);
  const targetCount = new Set(valid.map((e) => e.target)).size;
  const anyBalance  = valid.some((e) => e.finalBalance !== undefined);
  const nothingNew  = valid.length > 0 && createKeysInUse.length === 0 && valid.every((e) => e.dupCheck && e.dupCheck.newCount === 0);
  const importDisabled = valid.length === 0 || importing || anyChecking || !draftsReady;
  const summary = outcomes ? summarizeImports(outcomes.filter((o) => !o.error)) : null;

  const headline = entries.length === 0
    ? 'Drop one or more CSVs to get started'
    : `${entries.length} file${entries.length !== 1 ? 's' : ''} · ${totalRows.toLocaleString()} transaction${totalRows !== 1 ? 's' : ''}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !importing) onClose(); }}
    >
      <div
        className="w-full max-w-2xl flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-primary) 30%, transparent)' }}
            >
              📥
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>Import transactions</p>
              <p className="text-sm font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>{headline}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] transition-colors shrink-0 disabled:opacity-40"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto flex-1">

          {/* Drop zone */}
          {!outcomes && (
            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
              <input ref={inputRef} type="file" accept=".csv,.txt" multiple onChange={handleFile} className="hidden" />
              <button
                onClick={() => inputRef.current?.click()}
                type="button"
                disabled={importing}
                className={`w-full rounded-xl border-2 border-dashed flex items-center justify-center gap-3 transition-all ${entries.length ? 'py-3' : 'py-6'}`}
                style={{
                  borderColor: dragging ? 'var(--color-primary)' : entries.length ? 'color-mix(in srgb, var(--color-green) 35%, transparent)' : 'var(--color-elevated)',
                  background: dragging ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : entries.length ? 'color-mix(in srgb, var(--color-green) 5%, transparent)' : 'var(--color-elevated)',
                }}
              >
                <span className="text-xl">{dragging ? '📥' : entries.length ? '➕' : '📂'}</span>
                <div className="text-left">
                  <p className="text-sm font-semibold" style={{ color: entries.length ? 'var(--color-green)' : 'var(--color-text-secondary)' }}>
                    {dragging ? 'Drop to add' : entries.length ? 'Add more files' : 'Click to select or drag & drop — several files at once is fine'}
                  </p>
                  {!entries.length && !dragging && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      Supports Chase, Bank of America, Wells Fargo, Schwab & most banks
                    </p>
                  )}
                </div>
              </button>
            </div>
          )}

          {/* Stats bar */}
          {valid.length > 0 && !outcomes && (
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Total',   value: totalRows,                                  color: 'var(--color-primary)' },
                { label: 'New',     value: anyChecking ? '…' : newCount,               color: 'var(--color-green)' },
                { label: 'Skipped', value: anyChecking ? '…' : dupCount,               color: dupCount ? 'var(--color-amber)' : 'var(--color-text-muted)' },
                { label: 'Income',  value: income > 0 ? `+$${income.toFixed(2)}` : '$0.00', color: income > 0 ? 'var(--color-green)' : 'var(--color-text-muted)' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex flex-col items-center py-2.5 rounded-xl"
                  style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}
                >
                  <p className="text-[9px] uppercase tracking-widest font-bold" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                  <p className="font-black text-base mt-0.5 tabular-nums" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* File list */}
          {entries.length > 0 && !outcomes && (
            <div className="flex flex-col gap-2">
              {entries.map((entry) => (
                <FileCard
                  key={entry.id}
                  entry={entry}
                  draft={isCreateKey(entry.target) ? drafts[entry.target] : undefined}
                  disabled={importing}
                  onRemove={() => removeFile(entry.id)}
                  onTargetChange={(v) => handleTargetChange(entry, v)}
                  onTogglePreview={() => patchEntry(entry.id, (e) => ({ showPreview: !e.showPreview }))}
                />
              ))}
            </div>
          )}

          {/* New-account forms — one per distinct new account, shared by the files that feed it */}
          {!outcomes && createKeysInUse.map((key) => {
            const d = drafts[key];
            if (!d) return null;
            const feeders = valid.filter((e) => e.target === key);
            const update = (patch: Partial<NewAccountDraft>) => setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
            return (
              <div
                key={key}
                className="flex flex-col gap-3 p-4 rounded-xl"
                style={{ background: 'color-mix(in srgb, var(--color-primary) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 18%, transparent)' }}
              >
                <div className="flex items-start gap-2.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" style={{ color: 'var(--color-primary)' }}>
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    No matching account found. A <strong style={{ color: 'var(--color-primary)' }}>new account</strong>
                    {d.accountName.trim() ? <> — <strong style={{ color: 'var(--color-text-primary)' }}>“{d.accountName.trim()}”</strong></> : null}
                    {' '}will be created for {feeders.length === 1 ? <strong>{feeders[0].name}</strong> : <>{feeders.length} files: <strong>{feeders.map((f) => f.name).join(', ')}</strong></>}.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                      Bank name <span style={{ color: 'var(--color-card-orange)' }}>*</span>
                    </label>
                    <input
                      type="text" placeholder="e.g. Chase" value={d.bankName} disabled={importing}
                      onChange={(e) => update({ bankName: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-xl outline-none"
                      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                      Account name <span style={{ color: 'var(--color-card-orange)' }}>*</span>
                    </label>
                    <input
                      type="text" placeholder="e.g. Checking ••1234" value={d.accountName} disabled={importing}
                      onChange={(e) => update({ accountName: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-xl outline-none"
                      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                    <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Type</label>
                    <SelectMenu
                      value={d.accountType}
                      onChange={(v) => update({ accountType: v as NewAccountDraft['accountType'] })}
                      ariaLabel="Account type"
                      options={[
                        { value: 'checking',   label: 'Checking' },
                        { value: 'savings',    label: 'Savings' },
                        { value: 'credit',     label: 'Credit' },
                        { value: 'investment', label: 'Investment' },
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-1" style={{ width: '90px' }}>
                    <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Last 4</label>
                    <input
                      type="text" placeholder="1234" maxLength={4} value={d.last4} disabled={importing}
                      onChange={(e) => update({ last4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      className="w-full px-3 py-2 text-sm rounded-xl outline-none tabular-nums"
                      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Color</label>
                    <div className="flex items-center gap-2 h-[38px]">
                      {ACC_COLORS.map((c) => (
                        <button
                          key={c} type="button" disabled={importing}
                          onClick={() => update({ color: c })}
                          className="w-5 h-5 rounded-full transition-transform hover:scale-110 shrink-0"
                          style={{ background: c, outline: d.color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Results */}
          {outcomes && summary && (
            <div className="flex flex-col gap-4">
              <div className="py-4 flex flex-col items-center gap-3 text-center">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--color-green) 30%, transparent)' }}
                >
                  {summary.imported > 0 ? '🎉' : '✓'}
                </div>
                <div>
                  <p className="font-bold text-lg" style={{ color: 'var(--color-green)' }}>
                    {summary.imported} transaction{summary.imported !== 1 ? 's' : ''} imported
                  </p>
                  <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    {summary.files} of {outcomes.length} file{outcomes.length !== 1 ? 's' : ''}
                    {summary.accounts.length > 0 && <> · {summary.accounts.length} account{summary.accounts.length !== 1 ? 's' : ''}</>}
                    {summary.skipped > 0 && <> · {summary.skipped} duplicate{summary.skipped !== 1 ? 's' : ''} skipped</>}
                  </p>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                {outcomes.map((o, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 text-xs"
                    style={{ borderTop: i ? '1px solid var(--color-border)' : 'none' }}>
                    <span className="shrink-0" style={{ color: o.error ? 'var(--color-rose)' : 'var(--color-green)' }}>{o.error ? '✕' : '✓'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{o.fileName}</p>
                      <p className="truncate" style={{ color: o.error ? 'var(--color-rose)' : 'var(--color-text-muted)' }}>
                        {o.error ?? `${o.account.bankName} — ${o.account.accountName}`}
                      </p>
                    </div>
                    {!o.error && (
                      <div className="shrink-0 text-right tabular-nums">
                        <p className="font-semibold" style={{ color: 'var(--color-green)' }}>{o.imported} new</p>
                        {o.skipped > 0 && <p style={{ color: 'var(--color-text-muted)' }}>{o.skipped} skipped</p>}
                      </div>
                    )}
                  </div>
                ))}
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
                style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`, background: 'var(--color-primary)' }} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {!outcomes && valid.length > 1 && targetCount > 0 && (
              <>{valid.length} files → {targetCount} account{targetCount !== 1 ? 's' : ''}</>
            )}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={importing}
              className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)] transition-colors disabled:opacity-40"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {outcomes ? 'Close' : 'Cancel'}
            </button>
            {valid.length > 0 && !outcomes && (() => {
              if (nothingNew) {
                // Already imported — but let the user refresh balances from the
                // files' ending balances (server applies them even with 0 new rows).
                if (anyBalance) return (
                  <button onClick={handleImport} disabled={importing}
                    className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-50 transition-all"
                    style={{ background: 'var(--color-primary)' }}>
                    {importing ? 'Updating…' : targetCount > 1 ? 'Update balances' : 'Update balance'}
                  </button>
                );
                return (
                  <span
                    className="text-xs font-semibold px-3 py-2 rounded-xl"
                    style={{ background: 'color-mix(in srgb, var(--color-green) 12%, transparent)', color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 25%, transparent)' }}
                  >
                    ✓ All already imported
                  </span>
                );
              }
              const label = importing ? 'Importing…'
                : anyChecking ? 'Checking…'
                : !draftsReady ? 'Fill in account details'
                : createKeysInUse.length > 0
                  ? `Create ${createKeysInUse.length} account${createKeysInUse.length !== 1 ? 's' : ''} & import ${newCount} transaction${newCount !== 1 ? 's' : ''}`
                  : `Import ${newCount} transaction${newCount !== 1 ? 's' : ''}`;
              return (
                <button
                  onClick={handleImport}
                  disabled={importDisabled}
                  className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-50 transition-all"
                  style={{ background: 'var(--color-primary)' }}
                >
                  {label}
                </button>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── One file in the batch ─────────────────────────────────────────── */
function FileCard({
  entry, draft, disabled, onRemove, onTargetChange, onTogglePreview,
}: {
  entry: FileEntry;
  draft?: NewAccountDraft;
  disabled: boolean;
  onRemove: () => void;
  onTargetChange: (value: string) => void;
  onTogglePreview: () => void;
}) {
  const creating = isCreateKey(entry.target);
  const ranked = !creating && entry.ranking ? entry.ranking.ranked.find((r) => r.account.id === entry.target) ?? null : null;
  const tier: MatchTier = ranked?.tier ?? 'none';
  const tierColor = TIER_COLORS[tier];
  const newCount = entry.dupCheck ? entry.dupCheck.newCount : entry.rows.length;

  return (
    <div className="rounded-xl p-3 flex flex-col gap-2.5"
      style={{
        background: 'var(--color-elevated)',
        border: `1px solid ${entry.error ? 'color-mix(in srgb, var(--color-rose) 30%, transparent)' : 'var(--color-border)'}`,
      }}>
      {/* Title row */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-base shrink-0">{entry.error ? '⚠️' : '📄'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{entry.name}</p>
          <p className="text-[11px] truncate" style={{ color: entry.error ? 'var(--color-rose)' : 'var(--color-text-muted)' }}>
            {entry.error ?? <>
              {entry.rows.length.toLocaleString()} transaction{entry.rows.length !== 1 ? 's' : ''} · {detectedLabel(entry.fingerprint)}
              {entry.last4 && <> ••{entry.last4}</>}
            </>}
          </p>
        </div>
        {!entry.error && (
          <button type="button" onClick={onTogglePreview} disabled={disabled}
            className="text-[11px] font-semibold px-2 py-1 rounded-lg shrink-0 hover:bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] transition-colors"
            style={{ color: 'var(--color-text-muted)' }}>
            {entry.showPreview ? 'Hide' : 'Preview'}
          </button>
        )}
        <button type="button" onClick={onRemove} disabled={disabled} aria-label={`Remove ${entry.name}`}
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 hover:bg-[color-mix(in_srgb,var(--color-rose)_12%,transparent)] transition-colors disabled:opacity-40"
          style={{ color: 'var(--color-text-muted)' }}>
          ✕
        </button>
      </div>

      {/* Target account */}
      {!entry.error && entry.ranking && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[220px]">
              <SelectMenu
                value={creating ? 'create' : (entry.target ?? '')}
                onChange={onTargetChange}
                ariaLabel={`Import ${entry.name} into account`}
                options={[
                  ...entry.ranking.ranked.map((r) => ({
                    value: r.account.id,
                    label: `${r.account.bankName} — ${r.account.accountName}`,
                    note: r.tier === 'none' ? 'no match' : TIER_LABELS[r.tier],
                    noteColor: TIER_COLORS[r.tier],
                  })),
                  { value: 'create', label: draft ? `＋ New: ${draft.accountName || 'account'}` : '＋ Create new account…', accent: true },
                ]}
              />
            </div>
            <span className="text-[11px] tabular-nums shrink-0" style={{ color: 'var(--color-text-muted)' }}>
              {creating ? <span style={{ color: 'var(--color-primary)' }}>{entry.rows.length} new</span>
                : entry.dupChecking ? 'Checking…'
                : entry.dupCheck ? <>
                    <span style={{ color: 'var(--color-green)' }}>{newCount} new</span>
                    {entry.dupCheck.duplicateCount > 0 && <span style={{ color: 'var(--color-amber)' }}> · {entry.dupCheck.duplicateCount} already imported</span>}
                  </>
                : null}
            </span>
          </div>
          {entry.dupCheck && entry.dupCheck.elsewhereCount > 0 && (
            <p className="text-[11px]" style={{ color: 'var(--color-amber)' }}>
              {entry.dupCheck.elsewhereCount} of the skipped rows {entry.dupCheck.elsewhereCount === 1 ? 'lives' : 'live'} in {formatElsewhere(entry.dupCheck.elsewhereAccounts)}, not in this account.
            </p>
          )}
          {ranked && (
            <div className="flex items-center gap-2 text-[11px]">
              <span
                className="px-1.5 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wide"
                style={{ background: `color-mix(in srgb, ${tierColor} 15%, transparent)`, color: tierColor, border: `1px solid color-mix(in srgb, ${tierColor} 30%, transparent)` }}
              >
                {TIER_LABELS[tier]}
              </span>
              <span style={{ color: tierColor }}>{ranked.reason}</span>
            </div>
          )}
        </div>
      )}

      {/* Preview table */}
      {!entry.error && entry.showPreview && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          <div className="max-h-44 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0">
                <tr style={{ background: 'var(--color-elevated)', borderBottom: '1px solid var(--color-border)' }}>
                  <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Date</th>
                  <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Description</th>
                  <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {entry.rows.slice(0, 150).map((row, i) => {
                  const extId = row.referenceNumber ? `csv_${row.referenceNumber}` : null;
                  const compositeKey = `csv_${row.date}|${row.name}|${row.amount.toFixed(2)}`;
                  const isDup = entry.dupCheck
                    ? (extId ? entry.dupCheck.duplicateIds.has(extId) : false) || entry.dupCheck.duplicateIds.has(compositeKey)
                    : false;
                  return (
                    <tr key={i} style={{ borderTop: '1px solid var(--color-border)', opacity: isDup ? 0.35 : 1 }}>
                      <td className="px-3 py-1.5 tabular-nums whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>{row.date}</td>
                      <td className="px-3 py-1.5 truncate max-w-xs" style={{ color: isDup ? 'var(--color-text-muted)' : 'var(--color-text-primary)', textDecoration: isDup ? 'line-through' : 'none' }}>{row.name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap"
                        style={{ color: isDup ? 'var(--color-text-muted)' : row.amount >= 0 ? 'var(--color-green)' : 'var(--color-text-primary)' }}>
                        {row.amount >= 0 ? '+' : ''}${Math.abs(row.amount).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {entry.rows.length > 150 && (
              <p className="text-center py-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                +{entry.rows.length - 150} more transactions
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Dark themed dropdown (replaces native <select>, whose option list can't be
   styled and renders with the OS's white/blue chrome on a dark modal). ── */
interface SelectOption {
  value: string;
  label: string;
  note?: string;        // small right-aligned tag (e.g. match tier)
  noteColor?: string;   // color token for the note
  accent?: boolean;     // render label in the primary accent (e.g. "Create new…")
}

function SelectMenu({
  value, options, onChange, ariaLabel,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  function place() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4, width: r.width });
  }

  function toggle() {
    if (!open) place();
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // Ignore clicks on the trigger AND inside the portal menu — the menu lives
      // outside btnRef in document.body, so without this an option click would
      // close the menu before its onClick fires.
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onReflow = () => setOpen(false); // close on scroll/resize rather than chase position
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full px-3 py-2 rounded-xl text-sm flex items-center justify-between gap-2 text-left transition-colors"
        style={{
          background: 'var(--color-elevated)',
          border: `1px solid ${open ? 'color-mix(in srgb, var(--color-primary) 45%, transparent)' : 'var(--color-border)'}`,
          color: selected?.accent ? 'var(--color-primary)' : 'var(--color-text-primary)',
        }}
      >
        <span className="truncate">{selected ? selected.label : 'Select…'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ color: 'var(--color-text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="fixed z-[60] rounded-xl overflow-hidden py-1"
          style={{
            left: pos.left, top: pos.top, width: pos.width, maxHeight: 280, overflowY: 'auto',
            background: 'var(--color-elevated)',
            border: 'var(--glass-border)',
            boxShadow: 'var(--glass-shadow)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
          }}
        >
          {options.map((o) => {
            const isSel = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSel}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left transition-colors"
                style={{
                  background: isSel ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
                  color: o.accent ? 'var(--color-primary)' : 'var(--color-text-primary)',
                }}
                onMouseEnter={(e) => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--color-primary) 7%, transparent)'; }}
                onMouseLeave={(e) => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span className="truncate">{o.label}</span>
                {o.note && (
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
                    style={{
                      color: o.noteColor ?? 'var(--color-text-muted)',
                      background: `color-mix(in srgb, ${o.noteColor ?? 'var(--color-text-muted)'} 14%, transparent)`,
                    }}>
                    {o.note}
                  </span>
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
