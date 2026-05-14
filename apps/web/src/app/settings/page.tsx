'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import Sidebar from '@/components/Sidebar';
import CsvImportModal from '@/components/CsvImportModal';
import CategoryManager from '@/components/CategoryManager';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

type AccountType = 'checking' | 'savings' | 'credit' | 'investment';

interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountType: AccountType;
  balance: number;
  currency: string;
  color: string;
  provider: string;
  plaidItemId: string | null;
}

const TYPE_META: Record<AccountType, { label: string; accent: string; icon: string }> = {
  checking:   { label: 'Checking',   accent: '#9B6DFF', icon: '💳' },
  savings:    { label: 'Savings',    accent: '#4FBF7F', icon: '🏦' },
  credit:     { label: 'Credit',     accent: '#F07A3E', icon: '💰' },
  investment: { label: 'Investment', accent: '#4BA8D8', icon: '📈' },
};

const PRESET_COLORS = ['#9B6DFF', '#4FBF7F', '#F07A3E', '#F5C842', '#4BA8D8', '#E879A0'];

const glass: React.CSSProperties = {
  background: 'rgba(35, 35, 47, 0.50)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 'var(--radius-input)',
  color: 'var(--color-text-primary)',
};

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManualForm, setShowManualForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [importAccount, setImportAccount] = useState<BankAccount | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    bankName: '',
    accountName: '',
    accountType: 'checking' as AccountType,
    balance: '',
    currency: 'USD',
    color: PRESET_COLORS[0],
  });

  useEffect(() => {
    fetch(`${API}/bank-accounts`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setAccounts)
      .finally(() => setLoading(false));
  }, []);

  /* ── Plaid Link ── */
  const openPlaidLink = async () => {
    setConnecting(true);
    try {
      const res = await fetch(`${API}/plaid/link-token`, { method: 'POST', credentials: 'include' });
      const { link_token } = await res.json();
      setLinkToken(link_token);
    } catch {
      setError('Could not open bank connection. Check your Plaid credentials.');
      setConnecting(false);
    }
  };

  const onPlaidSuccess = useCallback(async (publicToken: string, metadata: any) => {
    setConnecting(true);
    try {
      const res = await fetch(`${API}/plaid/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          public_token: publicToken,
          institution_id: metadata.institution?.institution_id ?? '',
          institution_name: metadata.institution?.name ?? 'Unknown Bank',
        }),
      });
      if (!res.ok) throw new Error();
      const newAccounts: BankAccount[] = await res.json();
      setAccounts((prev) => {
        const ids = new Set(newAccounts.map((a) => a.id));
        return [...prev.filter((a) => !ids.has(a.id)), ...newAccounts];
      });
    } catch {
      setError('Bank connected but account import failed. Try syncing manually.');
    } finally {
      setLinkToken(null);
      setConnecting(false);
    }
  }, []);

  const { open: openLink, ready: linkReady } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: onPlaidSuccess,
    onExit: () => { setLinkToken(null); setConnecting(false); },
  });

  useEffect(() => {
    if (linkToken && linkReady) openLink();
  }, [linkToken, linkReady, openLink]);

  /* ── Manual form ── */
  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API}/bank-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...form, balance: parseFloat(form.balance) || 0 }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setAccounts((prev) => [...prev, created]);
      setShowManualForm(false);
      setForm({ bankName: '', accountName: '', accountType: 'checking', balance: '', currency: 'USD', color: PRESET_COLORS[0] });
    } catch {
      setError('Could not add account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`${API}/bank-accounts/${id}`, { method: 'DELETE', credentials: 'include' });
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSync(account: BankAccount) {
    if (!account.plaidItemId) return;
    setSyncingId(account.id);
    try {
      await fetch(`${API}/plaid/sync/${account.plaidItemId}`, { method: 'POST', credentials: 'include' });
      const res = await fetch(`${API}/bank-accounts`, { credentials: 'include' });
      setAccounts(await res.json());
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-base">Bank Accounts</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                Connect your bank for automatic updates or add accounts manually.
              </p>
            </div>

            {!showManualForm && (
              <div className="flex gap-2">
                <button
                  onClick={openPlaidLink}
                  disabled={connecting}
                  className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all hover:brightness-110 disabled:opacity-60 flex items-center gap-2"
                  style={{ background: 'var(--color-card-green)' }}
                >
                  <LinkIcon />
                  {connecting ? 'Connecting…' : 'Connect Bank'}
                </button>
                <button
                  onClick={() => setShowManualForm(true)}
                  className="px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:text-white"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.10)' }}
                >
                  + Manual
                </button>
              </div>
            )}
          </div>

          {/* Plaid info banner */}
          <div
            className="px-4 py-3 rounded-xl flex items-start gap-3 text-sm"
            style={{ background: 'rgba(79,191,127,0.08)', border: '1px solid rgba(79,191,127,0.18)' }}
          >
            <span className="mt-0.5">🔒</span>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              Bank connections use <span className="font-semibold text-white">Plaid</span> — a read-only, bank-grade secure link. Cofre never stores your bank credentials.
            </p>
          </div>

          {/* Manual add form */}
          {showManualForm && (
            <form onSubmit={handleAdd} className="p-5 flex flex-col gap-4" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
              <p className="font-semibold text-sm">Add Account Manually</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Bank Name</span>
                  <input required placeholder="e.g. Chase" value={form.bankName}
                    onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                    className="px-3 py-2.5 text-sm outline-none" style={inputStyle} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Account Name</span>
                  <input required placeholder="e.g. Main Checking" value={form.accountName}
                    onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))}
                    className="px-3 py-2.5 text-sm outline-none" style={inputStyle} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Account Type</span>
                  <select value={form.accountType} onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value as AccountType }))}
                    className="px-3 py-2.5 text-sm outline-none appearance-none" style={inputStyle}>
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                    <option value="credit">Credit Card</option>
                    <option value="investment">Investment</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Current Balance</span>
                  <div className="flex">
                    <span className="flex items-center px-3 text-sm rounded-l-[var(--radius-input)]"
                      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', borderRight: 'none', color: 'var(--color-text-muted)' }}>
                      {form.currency}
                    </span>
                    <input type="number" step="0.01" placeholder="0.00" value={form.balance}
                      onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))}
                      className="flex-1 px-3 py-2.5 text-sm outline-none"
                      style={{ ...inputStyle, borderRadius: '0 var(--radius-input) var(--radius-input) 0', borderLeft: 'none' }} />
                  </div>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Currency</span>
                  <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    className="px-3 py-2.5 text-sm outline-none appearance-none" style={inputStyle}>
                    {['USD','EUR','GBP','BRL','CUP','MXN','CAD'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Color</span>
                  <div className="flex items-center gap-2 px-3 py-2" style={{ ...inputStyle, borderRadius: 'var(--radius-input)' }}>
                    {PRESET_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                        className="w-6 h-6 rounded-full transition-transform hover:scale-110 shrink-0"
                        style={{ background: c, outline: form.color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }} />
                    ))}
                  </div>
                </label>
              </div>
              {error && <p className="text-xs" style={{ color: 'var(--color-card-orange)' }}>{error}</p>}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setShowManualForm(false); setError(''); }}
                  className="px-4 py-2 text-sm font-medium rounded-xl"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all hover:brightness-110 disabled:opacity-60"
                  style={{ background: 'var(--color-card-violet)' }}>
                  {submitting ? 'Adding…' : 'Add Account'}
                </button>
              </div>
            </form>
          )}

          {error && !showManualForm && (
            <p className="text-xs px-1" style={{ color: 'var(--color-card-orange)' }}>{error}</p>
          )}

          {/* Account list */}
          {loading ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading accounts…</p>
          ) : accounts.length === 0 && !showManualForm ? (
            <div className="p-8 flex flex-col items-center gap-3 text-center" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
              <span className="text-3xl">🏦</span>
              <p className="font-medium text-sm">No accounts yet</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Connect your bank for automatic updates or add an account manually.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {accounts.map((account) => {
                const meta = TYPE_META[account.accountType as AccountType] ?? TYPE_META.checking;
                const color = account.color || meta.accent;
                const balance = Number(account.balance);
                const isConnected = account.provider === 'plaid';
                return (
                  <div key={account.id} className="flex items-center gap-4 p-4" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
                    <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-lg"
                      style={{ background: `rgba(${hexToRgb(color)}, 0.18)`, border: `1px solid rgba(${hexToRgb(color)}, 0.3)` }}>
                      {meta.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">{account.bankName}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                          style={{ background: `rgba(${hexToRgb(meta.accent)}, 0.18)`, color: meta.accent }}>
                          {meta.label}
                        </span>
                        {isConnected && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1"
                            style={{ background: 'rgba(79,191,127,0.15)', color: '#4FBF7F' }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-[#4FBF7F] inline-block" />
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-secondary)' }}>{account.accountName}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-bold text-base"
                        style={{ color: account.accountType === 'credit' && balance > 0 ? 'var(--color-card-orange)' : 'white' }}>
                        {balance < 0 ? '−' : ''}{account.currency} {Math.abs(balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{account.currency}</p>
                    </div>

                    <div className="flex items-center gap-1 ml-2">
                      <button onClick={() => setImportAccount(account)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                        title="Import CSV" style={{ color: 'var(--color-text-secondary)' }}>
                        <UploadIcon />
                      </button>
                      {isConnected && (
                        <button onClick={() => handleSync(account)} disabled={syncingId === account.id}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40"
                          style={{ color: syncingId === account.id ? 'var(--color-text-muted)' : '#4FBF7F' }}
                          title="Sync now">
                          <SyncIcon spinning={syncingId === account.id} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(account.id)} disabled={deletingId === account.id}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20 disabled:opacity-40"
                        title="Remove account">
                        {deletingId === account.id ? <span className="text-xs">…</span> : <TrashIcon />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '0.5rem' }} />

        <CategoryManager />

      {importAccount && (
        <CsvImportModal
          accountId={importAccount.id}
          accountName={`${importAccount.bankName} — ${importAccount.accountName}`}
          onClose={() => setImportAccount(null)}
          onImported={(count) => {
            setImportAccount(null);
          }}
        />
      )}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ animation: spinning ? 'spin 1s linear infinite' : 'none' }}>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
      <path d="M21 3v5h-5"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--color-text-muted)' }}>
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
