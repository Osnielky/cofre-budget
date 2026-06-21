'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { parseCsv, detectCsvFingerprint, extractFileLast4 } from '@/lib/csvImport';
import type { CsvRow } from '@/lib/csvImport';
import { rankAccounts } from '@/lib/accountMatch';
import type { MatchAccount, RankResult, MatchTier } from '@/lib/accountMatch';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export interface ImportReconcileResult {
  imported: number;
  skipped: number;
  account: MatchAccount;
}

interface Props {
  accounts: MatchAccount[];
  onClose: () => void;
  onImported: (r: ImportReconcileResult) => void;
  onAccountCreated: (a: MatchAccount) => void;
}

interface DupCheck { newCount: number; duplicateCount: number; duplicateIds: Set<string>; }

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

export default function ImportReconcileModal({ accounts, onClose, onImported, onAccountCreated }: Props) {
  const [rows, setRows]             = useState<CsvRow[]>([]);
  const [csvBalance, setCsvBalance] = useState<number | undefined>(undefined);
  const [fileName, setFileName]     = useState('');
  const [error, setError]           = useState('');
  const [ranking, setRanking]       = useState<RankResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | 'create' | null>(null);
  const [importing, setImporting]   = useState(false);
  const [result, setResult]         = useState<{ imported: number; skipped: number } | null>(null);
  const [dragging, setDragging]     = useState(false);
  const [dupCheck, setDupCheck]     = useState<DupCheck | null>(null);
  const [dupChecking, setDupChecking] = useState(false);

  // Create-new-account form state
  const [newAcc, setNewAcc] = useState({
    bankName: '', accountName: '', accountType: 'checking', last4: '', color: '#9B6DFF',
  });

  const inputRef = useRef<HTMLInputElement>(null);

  async function checkDups(parsed: CsvRow[], accountId: string) {
    setDupChecking(true); setDupCheck(null);
    try {
      const res = await fetch(`${API}/transactions/check-duplicates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ bankAccountId: accountId, rows: parsed }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setDupCheck({ newCount: data.newCount, duplicateCount: data.duplicateCount, duplicateIds: new Set(data.duplicateExternalIds) });
    } catch {
      // network/CORS error — silently skip dup check
    } finally { setDupChecking(false); }
  }

  function processFile(file: File) {
    setError(''); setRows([]); setResult(null); setRanking(null); setSelectedId(null);
    setDupCheck(null);
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
        const bestId = rank.best ? rank.best.account.id : 'create';
        setSelectedId(bestId);

        // Prefill create-form from file fingerprint
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

        if (bestId !== 'create') {
          checkDups(parsed, bestId);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not parse CSV file.');
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

  function handleSelectChange(value: string) {
    setSelectedId(value as string | 'create');
    setDupCheck(null);
    if (value !== 'create' && rows.length > 0) {
      checkDups(rows, value);
    }
  }

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

  const income   = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const newCount = dupCheck ? dupCheck.newCount : rows.length;

  const selectedRanked = ranking?.ranked.find((r) => r.account.id === selectedId) ?? null;
  const confidenceText = selectedRanked?.reason ?? '';
  const confidenceTier: MatchTier = selectedRanked?.tier ?? 'none';
  const tierColor = TIER_COLORS[confidenceTier];
  const tierLabel = selectedRanked ? TIER_LABELS[confidenceTier] : '';

  const createReady = selectedId === 'create' && newAcc.bankName.trim() !== '' && newAcc.accountName.trim() !== '';
  const importDisabled = !selectedId || importing || dupChecking || (selectedId === 'create' && !createReady);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-xl flex flex-col rounded-2xl overflow-hidden"
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
              <p className="text-sm font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>
                {fileName || 'Drop a CSV to get started'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] transition-colors shrink-0"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto flex-1">

          {/* Drop zone */}
          {!result && (
            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
              <input ref={inputRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
              <button
                onClick={() => inputRef.current?.click()}
                type="button"
                className="w-full py-6 rounded-xl border-2 border-dashed flex items-center justify-center gap-3 transition-all"
                style={{
                  borderColor: dragging ? 'var(--color-primary)' : rows.length ? 'color-mix(in srgb, var(--color-green) 35%, transparent)' : 'var(--color-elevated)',
                  background: dragging ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : rows.length ? 'color-mix(in srgb, var(--color-green) 5%, transparent)' : 'var(--color-elevated)',
                }}
              >
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

          {/* Stats + table + account selector */}
          {rows.length > 0 && !result && (
            <>
              {/* Stats bar */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Total',   value: rows.length,                                          color: 'var(--color-primary)' },
                  { label: 'New',     value: dupChecking ? '…' : newCount,                         color: 'var(--color-green)' },
                  { label: 'Skipped', value: dupChecking ? '…' : (dupCheck?.duplicateCount ?? 0),  color: dupCheck?.duplicateCount ? 'var(--color-amber)' : 'var(--color-text-muted)' },
                  { label: 'Income',  value: income > 0 ? `+$${income.toFixed(2)}` : '$0.00',      color: income > 0 ? 'var(--color-green)' : 'var(--color-text-muted)' },
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

              {/* Duplicate notice */}
              {dupCheck && dupCheck.duplicateCount > 0 && (
                <div
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
                  style={{ background: 'color-mix(in srgb, var(--color-amber) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--color-amber) 18%, transparent)' }}
                >
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
                            <td
                              className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap"
                              style={{ color: isDup ? 'var(--color-text-muted)' : row.amount >= 0 ? 'var(--color-green)' : 'var(--color-text-primary)' }}
                            >
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

              {/* Account selector */}
              {ranking && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                    Import into account
                  </label>
                  <SelectMenu
                    value={selectedId ?? ''}
                    onChange={handleSelectChange}
                    ariaLabel="Import into account"
                    options={[
                      ...ranking.ranked.map((r) => ({
                        value: r.account.id,
                        label: `${r.account.bankName} — ${r.account.accountName}`,
                        note: r.tier === 'none' ? 'no match' : TIER_LABELS[r.tier],
                        noteColor: TIER_COLORS[r.tier],
                      })),
                      { value: 'create', label: '＋ Create new account…', accent: true },
                    ]}
                  />

                  {/* Existing-account confidence label */}
                  {selectedId && selectedId !== 'create' && (
                    <div className="flex items-center gap-2 text-xs">
                      {tierLabel && (
                        <span
                          className="px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wide"
                          style={{ background: `color-mix(in srgb, ${tierColor} 15%, transparent)`, color: tierColor, border: `1px solid color-mix(in srgb, ${tierColor} 30%, transparent)` }}
                        >
                          {tierLabel}
                        </span>
                      )}
                      <span style={{ color: tierColor }}>{confidenceText}</span>
                    </div>
                  )}

                  {/* Create-account notice — make it clear a brand-new account is being made */}
                  {selectedId === 'create' && (
                    <div
                      className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-xs"
                      style={{ background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 28%, transparent)' }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                        strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" style={{ color: 'var(--color-primary)' }}>
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      <span style={{ color: 'var(--color-text-secondary)' }}>
                        No matching account found. A <strong style={{ color: 'var(--color-primary)' }}>new account</strong>
                        {newAcc.accountName.trim() ? <> — <strong style={{ color: 'var(--color-text-primary)' }}>“{newAcc.accountName.trim()}”</strong></> : null}
                        {' '}will be created and these {rows.length} transaction{rows.length !== 1 ? 's' : ''} imported into it. Review the details below.
                      </span>
                    </div>
                  )}

                  {/* Inline create-account form */}
                  {selectedId === 'create' && (
                    <div
                      className="flex flex-col gap-3 mt-1 p-4 rounded-xl"
                      style={{ background: 'color-mix(in srgb, var(--color-primary) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 18%, transparent)' }}
                    >
                      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>
                        New account details
                      </p>

                      {/* Bank name */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                          Bank name <span style={{ color: 'var(--color-card-orange)' }}>*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Chase"
                          value={newAcc.bankName}
                          onChange={(e) => setNewAcc((f) => ({ ...f, bankName: e.target.value }))}
                          className="w-full px-3 py-2 text-sm rounded-xl outline-none"
                          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                        />
                      </div>

                      {/* Account name */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                          Account name <span style={{ color: 'var(--color-card-orange)' }}>*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Checking ••1234"
                          value={newAcc.accountName}
                          onChange={(e) => setNewAcc((f) => ({ ...f, accountName: e.target.value }))}
                          className="w-full px-3 py-2 text-sm rounded-xl outline-none"
                          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                        />
                      </div>

                      {/* Account type + last 4 */}
                      <div className="flex gap-2">
                        <div className="flex flex-col gap-1 flex-1">
                          <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Type</label>
                          <SelectMenu
                            value={newAcc.accountType}
                            onChange={(v) => setNewAcc((f) => ({ ...f, accountType: v }))}
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
                            type="text"
                            placeholder="1234"
                            maxLength={4}
                            value={newAcc.last4}
                            onChange={(e) => setNewAcc((f) => ({ ...f, last4: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                            className="w-full px-3 py-2 text-sm rounded-xl outline-none tabular-nums"
                            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                          />
                        </div>
                      </div>

                      {/* Color swatches */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Color</label>
                        <div className="flex items-center gap-2">
                          {ACC_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setNewAcc((f) => ({ ...f, color: c }))}
                              className="w-5 h-5 rounded-full transition-transform hover:scale-110 shrink-0"
                              style={{ background: c, outline: newAcc.color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Success */}
          {result && (
            <div className="py-8 flex flex-col items-center gap-3 text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--color-green) 30%, transparent)' }}
              >
                🎉
              </div>
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
        <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <span />
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)] transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {result ? 'Close' : 'Cancel'}
            </button>
            {rows.length > 0 && !result && (() => {
              const nothingNew = dupCheck && dupCheck.newCount === 0 && selectedId !== 'create';
              if (nothingNew) return (
                <span
                  className="text-xs font-semibold px-3 py-2 rounded-xl"
                  style={{ background: 'color-mix(in srgb, var(--color-green) 12%, transparent)', color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 25%, transparent)' }}
                >
                  ✓ All already imported
                </span>
              );
              return (
                <button
                  onClick={handleImport}
                  disabled={importDisabled}
                  className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-50 transition-all"
                  style={{ background: 'var(--color-primary)' }}
                >
                  {importing ? 'Importing…'
                    : dupChecking ? 'Checking…'
                    : selectedId === 'create' && !createReady ? 'Fill in account details'
                    : selectedId === 'create' ? `Create & import ${rows.length} transaction${rows.length !== 1 ? 's' : ''}`
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
