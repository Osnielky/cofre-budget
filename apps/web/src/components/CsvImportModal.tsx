'use client';

import { useState, useRef } from 'react';

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
  background: 'rgba(25, 25, 38, 0.92)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
};

const ACC_ICONS: Record<string, string> = {
  checking: '💳', savings: '🏦', cash: '💵', credit: '💰', investment: '📈', debit: '💳',
};

interface DupCheck { newCount: number; duplicateCount: number; duplicateIds: Set<string> }

export default function CsvImportModal({ account, onClose, onImported }: Props) {
  const [rows, setRows]         = useState<CsvRow[]>([]);
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
        const parsed = parseCsv(raw);
        if (parsed.length === 0) throw new Error('No transactions found in this file.');
        setRows(parsed);
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
        body: JSON.stringify({ bankAccountId: account.id, rows }),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="w-full max-w-2xl flex flex-col gap-5 p-6 rounded-2xl" style={glass}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base">Import Transactions</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Upload a CSV exported from your bank
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
            style={{ color: 'var(--color-text-muted)' }}>✕</button>
        </div>

        {/* Target account */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: `${account.color}12`, border: `1px solid ${account.color}30` }}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
            style={{ background: `${account.color}20` }}>
            {accIcon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
              Importing into
            </p>
            <p className="text-sm font-bold truncate" style={{ color: account.color }}>{accLabel}</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0 capitalize"
            style={{ background: `${account.color}20`, color: account.color }}>
            {account.accountType}
          </span>
        </div>

        {/* File picker / drop zone */}
        {!result && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}>
            <input ref={inputRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
            <button onClick={() => inputRef.current?.click()} type="button"
              className="w-full py-8 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-all"
              style={{
                borderColor: dragging
                  ? account.color
                  : rows.length ? 'rgba(79,191,127,0.4)' : 'rgba(255,255,255,0.12)',
                background: dragging ? `${account.color}08` : 'transparent',
                color: 'var(--color-text-secondary)',
              }}>
              <span className="text-2xl">{dragging ? '📥' : rows.length ? '✅' : '📂'}</span>
              <span className="text-sm font-medium">
                {dragging
                  ? 'Drop to import'
                  : rows.length
                    ? `${rows.length} transactions — ${fileName}`
                    : 'Click to select or drag & drop a CSV file'}
              </span>
              {!rows.length && !dragging && (
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Supports Chase, Bank of America, Wells Fargo and most bank exports
                </span>
              )}
            </button>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && !result && (
          <div className="flex flex-col gap-2">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
                style={{
                  background: w.level === 'error' ? 'rgba(255,107,107,0.10)' : 'rgba(245,200,66,0.10)',
                  border: `1px solid ${w.level === 'error' ? 'rgba(255,107,107,0.25)' : 'rgba(245,200,66,0.25)'}`,
                  color: w.level === 'error' ? '#FF6B6B' : '#F5C842',
                }}>
                <span className="shrink-0">{w.level === 'error' ? '✕' : '⚠'}</span>
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Preview */}
        {rows.length > 0 && !result && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Total',    value: rows.length.toString(),                    color: '#9B6DFF' },
                { label: 'New',      value: dupChecking ? '…' : (dupCheck ? dupCheck.newCount.toString() : rows.length.toString()), color: '#4FBF7F' },
                { label: 'Skipped',  value: dupChecking ? '…' : (dupCheck ? dupCheck.duplicateCount.toString() : '0'),              color: dupCheck?.duplicateCount ? '#F5C842' : 'rgba(255,255,255,0.25)' },
                { label: 'Income',   value: `+$${income.toFixed(2)}`,                  color: '#4FBF7F' },
              ].map((s) => (
                <div key={s.label} className="p-2.5 rounded-xl text-center"
                  style={{ background: `rgba(${hexToRgb(s.color)},0.08)`, border: `1px solid rgba(${hexToRgb(s.color)},0.18)` }}>
                  <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                  <p className="font-bold text-sm mt-0.5" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Duplicate banner */}
            {dupCheck && dupCheck.duplicateCount > 0 && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs"
                style={{ background: 'rgba(245,200,66,0.08)', border: '1px solid rgba(245,200,66,0.25)' }}>
                <span>⟳</span>
                <span style={{ color: '#F5C842' }}>
                  <strong>{dupCheck.duplicateCount} already imported</strong> — they'll be skipped automatically.
                  Only <strong>{dupCheck.newCount} new transactions</strong> will be added.
                </span>
              </div>
            )}

            {/* Transaction table */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}>
                      <th className="text-left px-3 py-2 font-medium">Date</th>
                      <th className="text-left px-3 py-2 font-medium">Description</th>
                      <th className="text-right px-3 py-2 font-medium">Amount</th>
                      {dupCheck && dupCheck.duplicateCount > 0 && <th className="px-3 py-2 w-8" />}
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
                        <tr key={i}
                          style={{
                            borderTop: '1px solid rgba(255,255,255,0.04)',
                            opacity: isDup ? 0.4 : 1,
                          }}>
                          <td className="px-3 py-2 tabular-nums shrink-0" style={{ color: 'var(--color-text-muted)' }}>{row.date}</td>
                          <td className="px-3 py-2 truncate max-w-60" style={{ color: isDup ? 'var(--color-text-muted)' : 'var(--color-text-secondary)', textDecoration: isDup ? 'line-through' : 'none' }}>{row.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium"
                            style={{ color: isDup ? 'var(--color-text-muted)' : row.amount >= 0 ? '#4FBF7F' : '#F07A3E' }}>
                            {row.amount >= 0 ? '+' : ''}{row.amount.toFixed(2)}
                          </td>
                          {dupCheck && dupCheck.duplicateCount > 0 && (
                            <td className="px-3 py-2 text-center">
                              {isDup && <span className="text-[9px] px-1 py-0.5 rounded font-bold" style={{ background: 'rgba(245,200,66,0.15)', color: '#F5C842' }}>skip</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length > 150 && (
                  <p className="text-center py-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    … and {rows.length - 150} more
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {/* Success */}
        {result && (
          <div className="py-6 flex flex-col items-center gap-3 text-center">
            <span className="text-4xl">🎉</span>
            <p className="font-bold text-lg">{result.imported} transactions imported</p>
            {result.skipped > 0 && (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{result.skipped} duplicates skipped</p>
            )}
          </div>
        )}

        {error && <p className="text-xs px-1" style={{ color: 'var(--color-card-orange)' }}>{error}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-white/10 transition-colors"
            style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {result ? 'Close' : 'Cancel'}
          </button>
          {rows.length > 0 && !result && (
            <button onClick={handleImport} disabled={importing || hasErrors || dupChecking}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-60"
              style={{ background: 'var(--color-card-violet)' }}>
              {importing
                ? 'Importing…'
                : dupChecking
                  ? 'Checking…'
                  : dupCheck
                    ? `Import ${dupCheck.newCount} new transaction${dupCheck.newCount !== 1 ? 's' : ''}`
                    : `Import ${rows.length} transactions`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Validation ─────────────────────────────────────────────────── */

function detectCsvType(rawText: string): 'bank' | 'credit' | 'unknown' {
  const header = rawText.split('\n').slice(0, 15).join('\n').toLowerCase();
  if (header.includes('running bal') || header.includes('running balance')) return 'bank';
  if (header.includes('reference number') || header.includes('ref no')) return 'credit';
  return 'unknown';
}

function validate(rows: CsvRow[], account: BankAccount, fileName: string, rawText = ''): Warning[] {
  const warnings: Warning[] = [];

  /* Column-header type mismatch — hard block */
  const csvType = detectCsvType(rawText);
  const acctIsCredit = account.accountType === 'credit';
  const acctIsBank   = ['checking', 'savings', 'cash', 'debit'].includes(account.accountType);
  if (csvType === 'bank' && acctIsCredit) {
    warnings.push({ level: 'error', message: `These transactions do not belong to this account.` });
  }
  if (csvType === 'credit' && acctIsBank) {
    warnings.push({ level: 'error', message: `These transactions do not belong to this account.` });
  }

  /* Last-4 check: extract 4-digit suffix from filename e.g. "May2026_1564.csv" → "1564" */
  const fileLast4Match = fileName.match(/(\d{4})\.(?:csv|txt)$/i);
  const fileLast4 = fileLast4Match?.[1];
  if (fileLast4 && account.last4 && fileLast4 !== account.last4) {
    warnings.push({
      level: 'error',
      message: `These transactions do not belong to this account.`,
    });
  }
  if (fileLast4 && !account.last4) {
    warnings.push({
      level: 'warn',
      message: `This file appears to belong to an account ending in ${fileLast4}. Set the "Last 4" digits on "${account.accountName}" in Settings to enable automatic detection next time.`,
    });
  }

  const positiveCount = rows.filter((r) => r.amount > 0).length;
  const negativeCount = rows.filter((r) => r.amount < 0).length;
  const total = rows.length;

  /* Credit cards: expect mostly negative amounts (charges) */
  if (account.accountType === 'credit' && positiveCount / total > 0.8) {
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

function parseCsv(text: string): CsvRow[] {
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

  const SKIP_TYPES = new Set(['payment', 'credit card payment', 'online payment', 'autopay']);
  const SKIP_DESC  = /^(beginning balance|ending balance|opening balance|closing balance)/i;

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
  return rows;
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
