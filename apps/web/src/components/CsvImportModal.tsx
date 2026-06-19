'use client';

import { useState, useRef } from 'react';
import { isLiability } from '@/lib/accountTypes';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface CsvRow { date: string; referenceNumber?: string; name: string; amount: number; }

interface BankAccount {
  id: string; bankName: string; accountName: string; accountType: string; color: string;
  last4?: string | null;
}

interface ImportResult { imported: number; skipped: number; account: BankAccount; }

interface Props {
  account: BankAccount;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}

interface Warning { level: 'warn' | 'error'; message: string; }

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

const ACC_ICONS: Record<string, string> = {
  checking: '💳', savings: '🏦', cash: '💵', credit: '💳', investment: '📈', debit: '💳',
  line_of_credit: '💳', paypal: '🅿️', merchant: '🏪', mortgage: '🏠',
  other_asset: '📦', other_liability: '📉', loan: '🤝',
};

interface DupCheck { newCount: number; duplicateCount: number; duplicateIds: Set<string> }

export default function CsvImportModal({ account, onClose, onImported }: Props) {
  const [rows, setRows]         = useState<CsvRow[]>([]);
  const [csvBalance, setCsvBalance] = useState<number | undefined>(undefined);
  const [fileName, setFileName] = useState('');
  const [error, setError]       = useState('');
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult]     = useState<{ imported: number; skipped: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dupCheck, setDupCheck] = useState<DupCheck | null>(null);
  const [dupChecking, setDupChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function checkDups(parsed: CsvRow[]) {
    setDupChecking(true); setDupCheck(null);
    try {
      const res = await fetch(`${API}/transactions/check-duplicates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ bankAccountId: account.id, rows: parsed }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setDupCheck({ newCount: data.newCount, duplicateCount: data.duplicateCount, duplicateIds: new Set(data.duplicateExternalIds) });
    } catch {
      // network/CORS error — silently skip dup check
    } finally { setDupChecking(false); }
  }

  function processFile(file: File) {
    setError(''); setRows([]); setResult(null); setWarnings([]); setDupCheck(null);
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
        setRows(parsed);
        setCsvBalance(finalBalance);
        setWarnings(validate(parsed, account, file.name, raw));
        checkDups(parsed);
      } catch (err: any) {
        setError(err.message ?? 'Could not parse CSV file.');
      }
    };
    reader.readAsText(file);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault(); setDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  async function handleImport() {
    setImporting(true); setError('');
    try {
      const res = await fetch(`${API}/transactions/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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

  const hasErrors   = warnings.some((w) => w.level === 'error');
  const income      = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const expenses    = rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
  const accIcon     = ACC_ICONS[account.accountType] ?? '🏦';
  const accLabel    = `${account.bankName} — ${account.accountName}`;

  const newCount = dupCheck ? dupCheck.newCount : rows.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

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
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] transition-colors shrink-0"
            style={{ color: 'var(--color-text-muted)' }}>✕</button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto flex-1">

          {/* Drop zone */}
          {!result && (
            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
              <input ref={inputRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
              <button onClick={() => inputRef.current?.click()} type="button"
                className="w-full py-6 rounded-xl border-2 border-dashed flex items-center justify-center gap-3 transition-all"
                style={{
                  borderColor: dragging ? account.color : rows.length ? 'color-mix(in srgb, var(--color-green) 35%, transparent)' : 'var(--color-elevated)',
                  background: dragging ? `${account.color}08` : rows.length ? 'color-mix(in srgb, var(--color-green) 5%, transparent)' : 'var(--color-elevated)',
                }}>
                <span className="text-xl">{dragging ? '📥' : rows.length ? '✅' : '📂'}</span>
                <div className="text-left">
                  <p className="text-sm font-semibold" style={{ color: rows.length ? 'var(--color-green)' : 'var(--color-text-secondary)' }}>
                    {dragging ? 'Drop to import' : rows.length ? `${rows.length} transactions — ${fileName}` : 'Click to select or drag & drop'}
                  </p>
                  {!rows.length && !dragging && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      Supports Chase, Bank of America, Wells Fargo & most banks
                    </p>
                  )}
                </div>
              </button>
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
                    Only <strong>{dupCheck.newCount} new</strong> will be added.
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
                {result.skipped > 0 && (
                  <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>{result.skipped} duplicates skipped</p>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-xs px-1" style={{ color: 'var(--color-card-orange)' }}>{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderTop: '1px solid var(--color-border)' }}>
          <span />
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)] transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}>
              {result ? 'Close' : 'Cancel'}
            </button>
            {rows.length > 0 && !result && (() => {
              const nothingNew = dupCheck && dupCheck.newCount === 0;
              if (nothingNew) return (
                <span className="text-xs font-semibold px-3 py-2 rounded-xl"
                  style={{ background: 'color-mix(in srgb, var(--color-green) 12%, transparent)', color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 25%, transparent)' }}>
                  ✓ All already imported
                </span>
              );
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

/* ── Validation ─────────────────────────────────────────────────── */

interface BankFingerprint {
  bank: string;       // normalized bank name for matching
  type: 'bank' | 'credit';
  headerIncludes: string[];   // ALL must be present in header row
  headerExcludes?: string[];  // NONE must be present
}

const BANK_FINGERPRINTS: BankFingerprint[] = [
  // Chase Checking: Details, Posting Date, Type (with values like PARTNERFI_TO_CHASE)
  { bank: 'chase', type: 'bank',   headerIncludes: ['details', 'posting date', 'check or slip'] },
  // Chase Credit: Card, Transaction Date, Category, Memo
  { bank: 'chase', type: 'credit', headerIncludes: ['card', 'transaction date', 'post date', 'category', 'memo'] },
  // Bank of America Checking: Date, Description, Amount, Running Bal.
  { bank: 'bank of america', type: 'bank',   headerIncludes: ['running bal'] },
  // Bank of America Credit: Posted Date, Reference Number, Payee, Address
  { bank: 'bank of america', type: 'credit', headerIncludes: ['posted date', 'reference number', 'payee', 'address'] },
  // Wells Fargo: Date, Amount, Balance, Description (no "type" col)
  { bank: 'wells fargo', type: 'bank',   headerIncludes: ['date', 'amount', 'balance', 'description'], headerExcludes: ['details', 'running bal', 'reference number'] },
  // Citibank credit: Status, Date, Description, Debit, Credit
  { bank: 'citi',        type: 'credit', headerIncludes: ['status', 'debit', 'credit', 'description'], headerExcludes: ['balance'] },
  // Capital One: Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit
  { bank: 'capital one', type: 'credit', headerIncludes: ['transaction date', 'posted date', 'card no'] },
];

const DATE_COL_HINTS = ['date','posting date','transaction date','trans date','post date','activity date','value date'];

function detectCsvFingerprint(rawText: string): { bank: string | null; type: 'bank' | 'credit' | 'unknown' } {
  // Find the real header row (some banks like BofA prepend a summary block)
  const allLines = rawText.split('\n').map(l => l.trim().replace(/\r/g, ''));
  let headerLine = allLines[0].toLowerCase();
  for (let i = 0; i < Math.min(allLines.length, 15); i++) {
    const lower = allLines[i].toLowerCase();
    if (DATE_COL_HINTS.some(d => lower.split(',').some(col => col.trim() === d))) {
      headerLine = lower;
      break;
    }
  }
  const context = allLines.slice(0, 15).join('\n').toLowerCase();

  for (const fp of BANK_FINGERPRINTS) {
    const allPresent = fp.headerIncludes.every(h => headerLine.includes(h));
    const noneExcluded = !fp.headerExcludes?.some(h => headerLine.includes(h));
    if (allPresent && noneExcluded) return { bank: fp.bank, type: fp.type };
  }

  // Fallback type-only detection (no bank identified)
  if (context.includes('running bal') || context.includes('partnerfi_to_chase') || context.includes('fee_transaction')) {
    return { bank: null, type: 'bank' };
  }
  if (headerLine.includes('reference number') || headerLine.includes('ref no')) {
    return { bank: null, type: 'credit' };
  }
  return { bank: null, type: 'unknown' };
}

function bankNamesMatch(csvBank: string, accountBank: string): boolean {
  const csv = csvBank.toLowerCase();
  const acc = accountBank.toLowerCase();
  // Allow partial matches: "chase" matches "Chase Bank", "JPMorgan Chase", etc.
  return acc.includes(csv) || csv.includes(acc) ||
    (csv === 'bank of america' && (acc.includes('bofa') || acc.includes('boa'))) ||
    (csv === 'citi' && acc.includes('citibank'));
}

// Keep old name as wrapper for backward compatibility
function detectCsvType(rawText: string): 'bank' | 'credit' | 'unknown' {
  return detectCsvFingerprint(rawText).type;
}

function validate(rows: CsvRow[], account: BankAccount, fileName: string, rawText = ''): Warning[] {
  const warnings: Warning[] = [];

  /* ── Primary: bank format fingerprint ── */
  const { bank: csvBank, type: csvType } = detectCsvFingerprint(rawText);
  const acctIsCredit = isLiability(account.accountType);
  const acctIsBank   = ['checking', 'savings', 'cash', 'debit', 'paypal', 'merchant'].includes(account.accountType);

  // Wrong account TYPE (credit vs bank)
  if (csvType === 'bank' && acctIsCredit) {
    warnings.push({ level: 'error', message: 'These transactions do not belong to this account.' });
  }
  if (csvType === 'credit' && acctIsBank) {
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
  const baseName  = fileName.replace(/\.(?:csv|txt)$/i, '');
  const allLast4  = [...baseName.matchAll(/(?<!\d)(\d{4})(?!\d)/g)].map(m => m[1]);
  const fileLast4 = allLast4.filter(n => { const v = parseInt(n,10); return v < 1900 || v > 2099; }).at(-1) ?? null;

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

/* ── Parser ─────────────────────────────────────────────────────── */

const DATE_COL_NAMES = ['transaction date','trans date','trans. date','activity date','date','posting date','posted date','post date','value date','booking date'];

function parseCsv(text: string): { rows: CsvRow[]; finalBalance: number | undefined } {
  const allLines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (allLines.length < 2) throw new Error('CSV file is empty or has no data rows.');

  /* Find the real header row — some banks (BofA) prepend a summary block */
  let headerIdx = 0;
  for (let i = 0; i < Math.min(allLines.length, 15); i++) {
    const cols = parseRow(allLines[i]).map((h) => h.toLowerCase().trim());
    if (cols.some((c) => DATE_COL_NAMES.includes(c))) { headerIdx = i; break; }
  }
  const lines = allLines.slice(headerIdx);
  if (lines.length < 2) throw new Error('No transactions found in this file.');

  const rawHeaders = parseRow(lines[0]);
  const headers    = rawHeaders.map((h) => h.toLowerCase().trim());

  const col = (names: string[]) =>
    names.map((n) => headers.indexOf(n)).find((i) => i >= 0) ?? -1;

  const dateIdx = col(DATE_COL_NAMES);
  const descIdx = col(['description','payee','memo','narrative','details','merchant','name','transaction details','particulars']);
  const amountIdx = col(['amount','transaction amount','net amount','trans amount']);
  const debitIdx  = col(['debit','debit amount','withdrawal','withdrawals','dr','debit(dr)','money out']);
  const creditIdx = col(['credit','credit amount','deposit','deposits','cr','credit(cr)','money in']);
  const splitMode = amountIdx < 0 && debitIdx >= 0 && creditIdx >= 0;
  const refIdx = col(['reference number','reference no','reference','ref no','check no','check number','transaction id']);
  const typeIdx = col(['type','transaction type','trans type']);

  if (dateIdx < 0) throw new Error('Could not find a Date column. Please share your CSV format so we can add support for it.');
  if (descIdx < 0) throw new Error('Could not find a Description/Payee column.');
  if (amountIdx < 0 && !splitMode) throw new Error('Could not find an Amount column.');

  const SKIP_TYPES = new Set<string>(); // nothing skipped by type — let the user see all transactions
  const SKIP_DESC  = /^(beginning balance|ending balance|opening balance|closing balance)/i;
  const balIdx     = col(['balance','running bal','running balance','available balance','ledger balance','current balance']);

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i]);

    if (typeIdx >= 0 && SKIP_TYPES.has(cols[typeIdx]?.trim().toLowerCase() ?? '')) continue;

    const rawDesc = cols[descIdx]?.trim() ?? '';
    if (SKIP_DESC.test(rawDesc)) continue;

    let amount: number;
    if (splitMode) {
      const debit  = parseAmt(cols[debitIdx]);
      const credit = parseAmt(cols[creditIdx]);
      if (isNaN(debit) && isNaN(credit)) continue;
      amount = (!isNaN(debit) && debit !== 0) ? -Math.abs(debit) : Math.abs(credit);
    } else {
      amount = parseAmt(cols[amountIdx]);
      if (isNaN(amount)) continue;
    }

    const rawDate = cols[dateIdx]?.trim() ?? '';
    const date    = normalizeDate(rawDate);
    const name    = rawDesc;
    if (!date || !name) continue;

    const refRaw = refIdx >= 0 ? cols[refIdx]?.trim().replace(/\s+/g, ' ') : '';
    /* Use bank's transaction ID when available; otherwise a stable composite.
       amount.toFixed(2) prevents floating-point string differences between imports. */
    const referenceNumber = refRaw || `${date}|${name}|${amount.toFixed(2)}`;

    rows.push({ date, referenceNumber, name, amount });
  }

  // Extract most recent balance from the first data row (banks sort newest first)
  let finalBalance: number | undefined;
  if (balIdx >= 0 && lines.length > 1) {
    const firstDataRow = parseRow(lines[1]);
    const raw = firstDataRow[balIdx]?.replace(/[$,\s]/g, '') ?? '';
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) finalBalance = parsed;
  }

  return { rows, finalBalance };
}

/* MM/DD/YYYY → YYYY-MM-DD; already ISO dates pass through unchanged */
function normalizeDate(raw: string): string {
  const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) return `${mdyMatch[3]}-${mdyMatch[1].padStart(2,'0')}-${mdyMatch[2].padStart(2,'0')}`;
  const dmyMatch = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2,'0')}-${dmyMatch[1].padStart(2,'0')}`;
  return raw; // already YYYY-MM-DD or other ISO
}

function parseAmt(raw: string | undefined): number {
  if (!raw) return NaN;
  const s = raw.replace(/[^0-9.\-]/g, '');
  return s ? parseFloat(s) : NaN;
}

function parseRow(line: string): string[] {
  const cols: string[] = [];
  let cur = '', inQuote = false;
  for (const c of line) {
    if (c === '"') { inQuote = !inQuote; continue; }
    if (c === ',' && !inQuote) { cols.push(cur); cur = ''; continue; }
    cur += c;
  }
  cols.push(cur);
  return cols;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
