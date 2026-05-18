'use client';

import { useState, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface CsvRow { date: string; referenceNumber?: string; name: string; amount: number; }

interface Props {
  accountId: string;
  accountName: string;
  onClose: () => void;
  onImported: (count: number) => void;
}

const glass: React.CSSProperties = {
  background: 'rgba(25, 25, 38, 0.92)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
};

export default function CsvImportModal({ accountId, accountName, onClose, onImported }: Props) {
  const [rows, setRows]       = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError]     = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult]   = useState<{ imported: number; skipped: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setRows([]); setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseCsv(ev.target?.result as string);
        if (parsed.length === 0) throw new Error('No transactions found in this file.');
        setRows(parsed);
      } catch (err: any) {
        setError(err.message ?? 'Could not parse CSV file.');
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setImporting(true); setError('');
    try {
      const res = await fetch(`${API}/transactions/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bankAccountId: accountId, rows }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResult(data);
      onImported(data.imported);
    } catch {
      setError('Import failed. Please try again.');
    } finally { setImporting(false); }
  }

  const income   = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const expenses = rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="w-full max-w-2xl flex flex-col gap-5 p-6 rounded-card" style={glass}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base">Import Transactions</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{accountName}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
            style={{ color: 'var(--color-text-muted)' }}>✕</button>
        </div>

        {/* File picker */}
        {!result && (
          <div>
            <input ref={inputRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
            <button onClick={() => inputRef.current?.click()}
              className="w-full py-8 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-colors hover:border-card-violet/50"
              style={{ borderColor: rows.length ? 'rgba(79,191,127,0.4)' : 'rgba(255,255,255,0.12)', color: 'var(--color-text-secondary)' }}>
              <span className="text-2xl">{rows.length ? '✅' : '📂'}</span>
              <span className="text-sm font-medium">
                {rows.length ? `${rows.length} transactions loaded — ${fileName}` : 'Click to select CSV file'}
              </span>
              {!rows.length && (
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Export from your bank's website then upload here
                </span>
              )}
            </button>
          </div>
        )}

        {/* Preview */}
        {rows.length > 0 && !result && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Transactions', value: rows.length.toString(),            color: '#9B6DFF' },
                { label: 'Total Income',   value: `+$${income.toFixed(2)}`,            color: '#4FBF7F' },
                { label: 'Total Expenses', value: `-$${Math.abs(expenses).toFixed(2)}`, color: '#F07A3E' },
              ].map((s) => (
                <div key={s.label} className="p-3 rounded-xl text-center"
                  style={{ background: `rgba(${hexToRgb(s.color)},0.10)`, border: `1px solid rgba(${hexToRgb(s.color)},0.20)` }}>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                  <p className="font-bold text-sm mt-0.5" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}>
                      <th className="text-left px-3 py-2 font-medium">Date</th>
                      <th className="text-left px-3 py-2 font-medium">Description</th>
                      <th className="text-right px-3 py-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 150).map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-3 py-2 tabular-nums shrink-0" style={{ color: 'var(--color-text-muted)' }}>{row.date}</td>
                        <td className="px-3 py-2 truncate max-w-60" style={{ color: 'var(--color-text-secondary)' }}>{row.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium"
                          style={{ color: row.amount >= 0 ? '#4FBF7F' : '#F07A3E' }}>
                          {row.amount >= 0 ? '+' : ''}{row.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
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
            <button onClick={handleImport} disabled={importing}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-60"
              style={{ background: 'var(--color-card-violet)' }}>
              {importing ? 'Importing…' : `Import ${rows.length} transactions`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Parser ─────────────────────────────────────────────────────── */

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV file is empty or has no data rows.');

  const rawHeaders = parseRow(lines[0]);
  const headers    = rawHeaders.map((h) => h.toLowerCase().trim());

  const col = (names: string[]) =>
    names.map((n) => headers.indexOf(n)).find((i) => i >= 0) ?? -1;

  /* Date — prefer "transaction date" over "post date" */
  const dateIdx = col(['transaction date','trans date','trans. date','activity date','date','posted date','post date','value date','booking date']);

  /* Description */
  const descIdx = col(['description','payee','memo','narrative','details','merchant','name','transaction details','particulars']);

  /* Amount — single column */
  const amountIdx = col(['amount','transaction amount','net amount','trans amount']);

  /* Amount — split debit/credit */
  const debitIdx  = col(['debit','debit amount','withdrawal','withdrawals','dr','debit(dr)','money out']);
  const creditIdx = col(['credit','credit amount','deposit','deposits','cr','credit(cr)','money in']);
  const splitMode = amountIdx < 0 && debitIdx >= 0 && creditIdx >= 0;

  /* Optional: reference for dedup */
  const refIdx = col(['reference number','reference no','reference','ref no','check no','check number','transaction id']);

  /* Optional: type column — used to skip certain rows (e.g. credit card payments) */
  const typeIdx = col(['type','transaction type','trans type']);

  if (dateIdx < 0) throw new Error('Could not find a Date column. Please share your CSV format so we can add support for it.');
  if (descIdx < 0) throw new Error('Could not find a Description/Payee column.');
  if (amountIdx < 0 && !splitMode) throw new Error('Could not find an Amount column.');

  const SKIP_TYPES = new Set(['payment', 'credit card payment', 'online payment', 'autopay']);

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i]);

    /* Skip credit-card payment rows (they're transfers, not real transactions) */
    if (typeIdx >= 0 && SKIP_TYPES.has(cols[typeIdx]?.trim().toLowerCase() ?? '')) continue;

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

    const date = cols[dateIdx]?.trim() ?? '';
    const name = cols[descIdx]?.trim() ?? '';
    if (!date || !name) continue;

    const refRaw = refIdx >= 0 ? cols[refIdx]?.trim() : '';
    const referenceNumber = refRaw || `${date}|${name}|${amount}`;

    rows.push({ date, referenceNumber, name, amount });
  }
  return rows;
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
