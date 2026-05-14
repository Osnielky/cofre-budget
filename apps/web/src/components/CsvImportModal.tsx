'use client';

import { useState, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface CsvRow {
  date: string;
  referenceNumber?: string;
  name: string;
  amount: number;
}

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
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setRows([]);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseCsv(ev.target?.result as string);
        if (parsed.length === 0) throw new Error('No transactions found in file.');
        setRows(parsed);
      } catch (err: any) {
        setError(err.message ?? 'Could not parse CSV file.');
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setImporting(true);
    setError('');
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
    } finally {
      setImporting(false);
    }
  }

  const income = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const expenses = rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="w-full max-w-2xl flex flex-col gap-5 p-6 rounded-[var(--radius-card)]" style={glass}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base">Import Transactions</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{accountName}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
            style={{ color: 'var(--color-text-muted)' }}>✕</button>
        </div>

        {/* Supported formats */}
        <div className="px-4 py-3 rounded-xl text-xs" style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.18)', color: 'var(--color-text-secondary)' }}>
          Supported format: <span className="text-white font-medium">Bank of America CSV</span> — columns: Posted Date, Reference Number, Payee, Address, Amount
        </div>

        {/* File picker */}
        {!result && (
          <div>
            <input ref={inputRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
            <button onClick={() => inputRef.current?.click()}
              className="w-full py-8 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-colors hover:border-[#9B6DFF]/50"
              style={{ borderColor: rows.length ? 'rgba(79,191,127,0.4)' : 'rgba(255,255,255,0.12)', color: 'var(--color-text-secondary)' }}>
              <span className="text-2xl">{rows.length ? '✅' : '📂'}</span>
              <span className="text-sm font-medium">{rows.length ? `${rows.length} transactions loaded` : 'Click to select CSV file'}</span>
              {rows.length === 0 && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Export from your bank's website then upload here</span>}
            </button>
          </div>
        )}

        {/* Preview */}
        {rows.length > 0 && !result && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Transactions', value: rows.length.toString(), color: '#9B6DFF' },
                { label: 'Total Income', value: `+$${income.toFixed(2)}`, color: '#4FBF7F' },
                { label: 'Total Expenses', value: `-$${Math.abs(expenses).toFixed(2)}`, color: '#F07A3E' },
              ].map((s) => (
                <div key={s.label} className="p-3 rounded-xl text-center"
                  style={{ background: `rgba(${hexToRgb(s.color)},0.10)`, border: `1px solid rgba(${hexToRgb(s.color)},0.20)` }}>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                  <p className="font-bold text-sm mt-0.5" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Table preview */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="max-h-52 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}>
                      <th className="text-left px-3 py-2 font-medium">Date</th>
                      <th className="text-left px-3 py-2 font-medium">Payee</th>
                      <th className="text-right px-3 py-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{row.date}</td>
                        <td className="px-3 py-2 truncate max-w-[200px]" style={{ color: 'var(--color-text-secondary)' }}>{cleanName(row.name)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium`}
                          style={{ color: row.amount >= 0 ? '#4FBF7F' : '#F07A3E' }}>
                          {row.amount >= 0 ? '+' : ''}{row.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 100 && (
                  <p className="text-center py-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    … and {rows.length - 100} more
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
            className="px-4 py-2 text-sm font-medium rounded-xl transition-colors"
            style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {result ? 'Close' : 'Cancel'}
          </button>
          {rows.length > 0 && !result && (
            <button onClick={handleImport} disabled={importing}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all hover:brightness-110 disabled:opacity-60"
              style={{ background: 'var(--color-card-violet)' }}>
              {importing ? 'Importing…' : `Import ${rows.length} transactions`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── CSV parser (handles quoted fields) ── */
function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV file is empty or has no data rows.');

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().trim());
  const dateIdx   = headers.findIndex((h) => h.includes('date'));
  const refIdx    = headers.findIndex((h) => h.includes('reference'));
  const payeeIdx  = headers.findIndex((h) => h.includes('payee') || h.includes('description'));
  const amountIdx = headers.findIndex((h) => h.includes('amount'));

  if (dateIdx < 0 || payeeIdx < 0 || amountIdx < 0) {
    throw new Error('Unrecognized CSV format. Expected columns: Date, Payee, Amount.');
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i]);
    const amount = parseFloat(cols[amountIdx]?.replace(/[^0-9.\-]/g, '') ?? '0');
    if (isNaN(amount)) continue;
    rows.push({
      date: cols[dateIdx]?.trim() ?? '',
      referenceNumber: refIdx >= 0 ? cols[refIdx]?.trim() : undefined,
      name: cols[payeeIdx]?.trim() ?? '',
      amount,
    });
  }
  return rows;
}

function parseRow(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuote = !inQuote; continue; }
    if (c === ',' && !inQuote) { cols.push(cur); cur = ''; continue; }
    cur += c;
  }
  cols.push(cur);
  return cols;
}

function cleanName(name: string): string {
  return name.replace(/\s{2,}/g, ' ').trim();
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
