'use client';

import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export type ResetScope = 'transactions' | 'categories' | 'projects' | 'bankAccounts' | 'budgets' | 'debts';

export const SCOPE_ITEMS: {
  id: ResetScope; label: string; description: string; icon: string; color: string; warning?: string;
}[] = [
  {
    id: 'transactions',
    label: 'Transactions',
    description: 'All imported and manual transaction history',
    icon: '📋',
    color: 'var(--color-primary)',
  },
  {
    id: 'categories',
    label: 'Custom Categories',
    description: 'User-created categories and their budget rules',
    icon: '🏷',
    color: 'var(--color-sky)',
    warning: 'Built-in categories are kept.',
  },
  {
    id: 'budgets',
    label: 'Budget Rules',
    description: 'Monthly spending targets for all categories',
    icon: '🎯',
    color: 'var(--color-orange)',
  },
  {
    id: 'projects',
    label: 'Projects',
    description: 'All projects and custom project categories',
    icon: '📦',
    color: 'var(--color-green)',
  },
  {
    id: 'bankAccounts',
    label: 'Bank Accounts',
    description: 'All accounts (transactions become unlinked)',
    icon: '🏦',
    color: 'var(--color-amber)',
    warning: 'Existing transactions are kept but lose their account link.',
  },
  {
    id: 'debts',
    label: 'Debts',
    description: 'All tracked loans and their payment history',
    icon: '🤝',
    color: 'var(--color-card-violet)',
  },
];

interface BankAccount {
  id: string; bankName: string; accountName: string; accountType: string; color: string;
}

interface Preview {
  deleted: Partial<Record<ResetScope, number>>;
}

interface Props {
  accounts: BankAccount[];
  onClose: () => void;
  onDone: () => void;
}

const CONFIRM_WORD = 'DELETE';

export default function DataResetModal({ accounts, onClose, onDone }: Props) {
  const [step, setStep] = useState<'select' | 'preview' | 'confirm' | 'done'>('select');

  /* Selection state */
  const [scope, setScope]             = useState<ResetScope[]>([]);
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [bankAccountId, setBankAccountId] = useState<string>('all');

  /* Confirmation state */
  const [preview, setPreview]   = useState<Preview | null>(null);
  const [loading, setLoading]   = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState('');

  const activeScopes = SCOPE_ITEMS.filter((s) => scope.includes(s.id));
  const hasTransactions = scope.includes('transactions');

  function toggleScope(id: ResetScope) {
    setScope((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  }

  const txFilter = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    bankAccountId: bankAccountId !== 'all' ? bankAccountId : undefined,
  };

  async function handleContinue() {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/data-reset/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scope, ...txFilter }),
      });
      if (!res.ok) throw new Error();
      setPreview(await res.json());
      setStep('confirm');
    } catch {
      setError('Could not load preview. Please try again.');
    } finally { setLoading(false); }
  }

  async function handleDelete() {
    if (confirmInput !== CONFIRM_WORD) return;
    setDeleting(true); setError('');
    try {
      const res = await fetch(`${API}/data-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scope, ...txFilter }),
      });
      if (!res.ok) throw new Error();
      setStep('done');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally { setDeleting(false); }
  }

  const totalItems = preview
    ? Object.values(preview.deleted).reduce((s, n) => s + (n ?? 0), 0)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(5px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="w-full max-w-lg flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>

        {/* ── Modal header ── */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgba(255,80,80,0.12)', border: '1px solid rgba(255,80,80,0.22)' }}>
              <TrashIcon />
            </div>
            <div>
              <p className="font-bold text-sm">
                {step === 'select'  && 'Reset Data'}
                {step === 'confirm' && 'Confirm Deletion'}
                {step === 'done'    && 'Data Deleted'}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {step === 'select'  && 'Choose what to permanently remove'}
                {step === 'confirm' && 'Review and confirm — this cannot be undone'}
                {step === 'done'    && 'Selected data has been removed'}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] transition-colors"
            style={{ color: 'var(--color-text-muted)' }}>✕</button>
        </div>

        {/* ── STEP: SELECT ── */}
        {step === 'select' && (
          <div className="flex flex-col gap-0 overflow-y-auto max-h-[70vh]">

            {/* Scope checkboxes */}
            <div className="flex flex-col gap-2 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider px-0.5 mb-1"
                style={{ color: 'var(--color-text-muted)' }}>Select what to delete</p>
              {SCOPE_ITEMS.map((item) => {
                const checked = scope.includes(item.id);
                return (
                  <label key={item.id}
                    className="flex items-start gap-3.5 px-4 py-3 rounded-xl cursor-pointer transition-all select-none"
                    style={{
                      background: checked ? `rgba(${hexToRgb(item.color)},0.08)` : 'var(--color-elevated)',
                      border: `1px solid ${checked ? `rgba(${hexToRgb(item.color)},0.28)` : 'var(--color-elevated)'}`,
                    }}>
                    <div className="mt-0.5 w-4 h-4 rounded shrink-0 flex items-center justify-center"
                      style={{
                        background: checked ? item.color : 'transparent',
                        border: `2px solid ${checked ? item.color : 'var(--color-text-muted)'}`,
                        transition: 'all 0.15s',
                      }}>
                      {checked && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <input type="checkbox" checked={checked} onChange={() => toggleScope(item.id)} className="sr-only" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{item.icon}</span>
                        <span className="text-sm font-semibold"
                          style={{ color: checked ? item.color : 'var(--color-text-primary)' }}>
                          {item.label}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{item.description}</p>
                      {item.warning && (
                        <p className="text-[11px] mt-0.5" style={{ color: 'color-mix(in srgb, var(--color-amber) 70%, transparent)' }}>{item.warning}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Transaction filters — only when transactions selected */}
            {hasTransactions && (
              <div className="mx-5 mb-4 flex flex-col gap-3 p-4 rounded-xl"
                style={{ background: 'color-mix(in srgb, var(--color-primary) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 18%, transparent)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>Filter transactions</span>
                  <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>leave empty = delete all</span>
                </div>

                {/* Account picker */}
                {accounts.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Account</span>
                    <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}
                      className="px-3 py-2 text-sm outline-none appearance-none w-full rounded-xl"
                      style={{
                        background: 'var(--color-elevated)',
                        borderTop: '1px solid var(--color-border)',
                        borderRight: '1px solid var(--color-border)',
                        borderBottom: '1px solid var(--color-border)',
                        borderLeft: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}>
                      <option value="all">All accounts</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.bankName} — {a.accountName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Date range */}
                <div className="flex gap-3">
                  <div className="flex flex-col gap-1 flex-1">
                    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>From date</span>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                      className="px-3 py-2 text-sm outline-none rounded-xl w-full"
                      style={{
                        background: 'var(--color-elevated)',
                        borderTop: '1px solid var(--color-border)',
                        borderRight: '1px solid var(--color-border)',
                        borderBottom: '1px solid var(--color-border)',
                        borderLeft: '1px solid var(--color-border)',
                        borderRadius: '10px',
                        color: 'var(--color-text-primary)',
                        colorScheme: 'dark',
                      }} />
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>To date</span>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                      className="px-3 py-2 text-sm outline-none rounded-xl w-full"
                      style={{
                        background: 'var(--color-elevated)',
                        borderTop: '1px solid var(--color-border)',
                        borderRight: '1px solid var(--color-border)',
                        borderBottom: '1px solid var(--color-border)',
                        borderLeft: '1px solid var(--color-border)',
                        borderRadius: '10px',
                        color: 'var(--color-text-primary)',
                        colorScheme: 'dark',
                      }} />
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-5 py-4"
              style={{ borderTop: '1px solid var(--color-border)' }}>
              <div className="flex gap-2">
                <button onClick={() => setScope(SCOPE_ITEMS.map((s) => s.id))}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-[var(--color-elevated)]"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  Select All
                </button>
                {scope.length > 0 && (
                  <button onClick={() => setScope([])}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-[var(--color-elevated)]"
                    style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                    Clear
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={onClose}
                  className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)] transition-colors"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  Cancel
                </button>
                <button onClick={handleContinue} disabled={scope.length === 0 || loading}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl hover:brightness-110 disabled:opacity-40 transition-all"
                  style={{ background: 'rgba(255,80,80,0.18)', color: 'var(--color-rose)', border: '1px solid rgba(255,80,80,0.28)' }}>
                  {loading ? 'Checking…' : `Continue →`}
                </button>
              </div>
            </div>

            {error && <p className="text-xs px-5 pb-4" style={{ color: 'var(--color-rose)' }}>{error}</p>}
          </div>
        )}

        {/* ── STEP: CONFIRM ── */}
        {step === 'confirm' && (
          <div className="flex flex-col gap-4 p-5">

            {/* Scope summary with counts */}
            <div className="flex flex-col gap-2">
              {activeScopes.map((item) => {
                const count = preview?.deleted[item.id] ?? 0;
                return (
                  <div key={item.id} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl"
                    style={{ background: `rgba(${hexToRgb(item.color)},0.06)`, border: `1px solid rgba(${hexToRgb(item.color)},0.15)` }}>
                    <span className="text-base shrink-0">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: item.color }}>{item.label}</p>
                      {item.id === 'transactions' && bankAccountId !== 'all' && (() => {
                        const acc = accounts.find((a) => a.id === bankAccountId);
                        return acc ? (
                          <p className="text-[11px]" style={{ color: 'color-mix(in srgb, var(--color-primary) 85%, transparent)' }}>
                            {acc.bankName} — {acc.accountName}
                          </p>
                        ) : null;
                      })()}
                      {item.id === 'transactions' && (dateFrom || dateTo) && (
                        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                          {dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : dateFrom ? `From ${dateFrom}` : `Until ${dateTo}`}
                        </p>
                      )}
                      {item.warning && (
                        <p className="text-[11px]" style={{ color: 'color-mix(in srgb, var(--color-amber) 70%, transparent)' }}>{item.warning}</p>
                      )}
                    </div>
                    <span className="text-sm font-bold tabular-nums shrink-0"
                      style={{ color: count > 0 ? 'var(--color-rose)' : 'var(--color-text-muted)' }}>
                      {count > 0 ? `${count} item${count !== 1 ? 's' : ''}` : 'none'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Warning banner */}
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-xs"
              style={{ background: 'rgba(255,80,80,0.07)', border: '1px solid rgba(255,80,80,0.18)' }}>
              <span>⚠️</span>
              <p style={{ color: 'var(--color-rose)' }}>
                <strong>{totalItems} items</strong> will be permanently deleted. There is no undo.
              </p>
            </div>

            {/* Confirm input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                Type <span style={{ color: 'var(--color-rose)', fontFamily: 'monospace' }}>DELETE</span> to confirm
              </label>
              <input
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value.toUpperCase())}
                placeholder="DELETE"
                autoFocus
                className="px-3 py-2.5 text-sm outline-none rounded-xl font-mono"
                style={{
                  background: 'var(--color-elevated)',
                  borderTop: '1px solid rgba(255,80,80,0.25)',
                  borderRight: '1px solid rgba(255,80,80,0.25)',
                  borderBottom: '1px solid rgba(255,80,80,0.25)',
                  borderLeft: '1px solid rgba(255,80,80,0.25)',
                  color: confirmInput === CONFIRM_WORD ? 'var(--color-rose)' : 'var(--color-text-primary)',
                  letterSpacing: '0.1em',
                }}
              />
            </div>

            {error && <p className="text-xs px-1" style={{ color: 'var(--color-rose)' }}>{error}</p>}

            <div className="flex gap-2 justify-between pt-1">
              <button onClick={() => { setStep('select'); setConfirmInput(''); setError(''); }}
                className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)] transition-colors"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                ← Back
              </button>
              <div className="flex gap-2">
                <button onClick={onClose}
                  className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)] transition-colors"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  Cancel
                </button>
                <button onClick={handleDelete}
                  disabled={deleting || confirmInput !== CONFIRM_WORD}
                  className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-40 transition-all"
                  style={{ background: confirmInput === CONFIRM_WORD ? '#C0392B' : 'rgba(255,80,80,0.15)' }}>
                  {deleting ? 'Deleting…' : 'Delete Forever'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: DONE ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-10 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{ background: 'color-mix(in srgb, var(--color-green) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-green) 25%, transparent)' }}>
              ✓
            </div>
            <div>
              <p className="font-bold text-lg">All done</p>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                The selected data has been permanently removed.
              </p>
            </div>
            <button onClick={onDone}
              className="mt-2 px-8 py-2.5 text-sm font-semibold rounded-xl transition-all hover:brightness-110"
              style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 25%, transparent)' }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  );
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
