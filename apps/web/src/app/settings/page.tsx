'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePlaidLink } from 'react-plaid-link';
import Sidebar from '@/components/Sidebar';
import CsvImportModal from '@/components/CsvImportModal';
import CategoryManager from '@/components/CategoryManager';
import BankSelect from '@/components/BankSelect';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

type AccountType = 'checking' | 'savings' | 'credit' | 'investment' | 'cash';
type Tab = 'banks' | 'categories';

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
  checking:   { label: 'Checking',    accent: '#9B6DFF', icon: '💳' },
  savings:    { label: 'Savings',     accent: '#4FBF7F', icon: '🏦' },
  credit:     { label: 'Credit',      accent: '#F07A3E', icon: '💰' },
  investment: { label: 'Investment',  accent: '#4BA8D8', icon: '📈' },
  cash:       { label: 'Cash',        accent: '#4FBF7F', icon: '💵' },
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

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'banks',
    label: 'Bank Accounts',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="9" width="18" height="12" rx="2"/><path d="M8 9V5a2 2 0 0 1 4 0v4"/><path d="M3 9h18"/>
      </svg>
    ),
  },
  {
    id: 'categories',
    label: 'Categories',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>
      </svg>
    ),
  },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('banks');
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
    bankName: '', accountName: '', accountType: 'checking' as AccountType,
    balance: '', currency: 'USD', color: PRESET_COLORS[0],
  });

  useEffect(() => {
    fetch(`${API}/bank-accounts`, { credentials: 'include' })
      .then((r) => r.json()).then(setAccounts).finally(() => setLoading(false));
  }, []);

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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
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
    } finally { setLinkToken(null); setConnecting(false); }
  }, []);

  const { open: openLink, ready: linkReady } = usePlaidLink({
    token: linkToken ?? '', onSuccess: onPlaidSuccess,
    onExit: () => { setLinkToken(null); setConnecting(false); },
  });

  useEffect(() => { if (linkToken && linkReady) openLink(); }, [linkToken, linkReady, openLink]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault(); setSubmitting(true); setError('');
    try {
      const res = await fetch(`${API}/bank-accounts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...form, balance: parseFloat(form.balance) || 0 }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setAccounts((prev) => [...prev, created]);
      setShowManualForm(false);
      setForm({ bankName: '', accountName: '', accountType: 'checking', balance: '', currency: 'USD', color: PRESET_COLORS[0] });
    } catch { setError('Could not add account. Please try again.'); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`${API}/bank-accounts/${id}`, { method: 'DELETE', credentials: 'include' });
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } finally { setDeletingId(null); }
  }

  async function handleSync(account: BankAccount) {
    if (!account.plaidItemId) return;
    setSyncingId(account.id);
    try {
      await fetch(`${API}/plaid/sync/${account.plaidItemId}`, { method: 'POST', credentials: 'include' });
      const res = await fetch(`${API}/bank-accounts`, { credentials: 'include' });
      setAccounts(await res.json());
    } finally { setSyncingId(null); }
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        {/* Page header */}
        <div className="sticky top-0 z-10 px-6 pt-6 pb-4"
          style={{ background: 'rgba(15,15,26,0.80)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h1 className="text-2xl font-bold tracking-tight mb-4">Settings</h1>

          {/* Tab bar */}
          <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {TABS.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={activeTab === tab.id
                  ? { background: 'rgba(155,109,255,0.18)', color: '#9B6DFF', border: '1px solid rgba(155,109,255,0.30)' }
                  : { color: 'var(--color-text-secondary)', border: '1px solid transparent' }}>
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">

          {/* ── BANK ACCOUNTS TAB ── */}
          {activeTab === 'banks' && (
            <div className="flex flex-col gap-5 max-w-3xl"><>
              <div className="flex items-center justify-between">
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Connect your bank for automatic updates or add accounts manually.
                </p>
                <div className="flex gap-2">
                  <button onClick={openPlaidLink} disabled={connecting}
                    className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all hover:brightness-110 disabled:opacity-60 flex items-center gap-2"
                    style={{ background: 'var(--color-card-green)' }}>
                    <LinkIcon />
                    {connecting ? 'Connecting…' : 'Connect Bank'}
                  </button>
                  <button onClick={() => setShowManualForm(true)}
                    className="px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:text-white"
                    style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.10)' }}>
                    + Manual
                  </button>
                </div>
              </div>

              {/* Plaid info banner */}
              <div className="px-4 py-3 rounded-xl flex items-start gap-3 text-sm"
                style={{ background: 'rgba(79,191,127,0.08)', border: '1px solid rgba(79,191,127,0.18)' }}>
                <span className="mt-0.5">🔒</span>
                <p style={{ color: 'var(--color-text-secondary)' }}>
                  Bank connections use <span className="font-semibold text-white">Plaid</span> — a read-only, bank-grade secure link. Cofre never stores your bank credentials.
                </p>
              </div>

              {/* Add account modal */}
              {showManualForm && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                  style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
                  onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowManualForm(false); setError(''); } }}>

                  <form onSubmit={handleAdd}
                    className="w-full max-w-lg flex flex-col gap-5 p-6 rounded-2xl"
                    style={{ background: 'rgba(22,22,36,0.98)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>

                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-base">Add Account</p>
                      <button type="button" onClick={() => { setShowManualForm(false); setError(''); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                        style={{ color: 'var(--color-text-muted)' }}>
                        <CloseIcon />
                      </button>
                    </div>

                    <div className="flex flex-col gap-4">

                      {/* Row 1: Bank + Account Name */}
                      <div className="flex gap-3">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Bank / Institution</span>
                          <BankSelect
                            value={form.bankName}
                            onChange={(v: string) => setForm((f) => ({ ...f, bankName: v }))}
                            inputStyle={{ ...inputStyle, borderRadius: 'var(--radius-input)' }}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Account Name</span>
                          <input required placeholder="e.g. Main Checking" value={form.accountName}
                            onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))}
                            className="px-3 py-2.5 text-sm outline-none" style={inputStyle} />
                        </div>
                      </div>

                      {/* Row 2: Type + Currency */}
                      <div className="flex gap-3">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Account Type</span>
                          <select value={form.accountType} onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value as AccountType }))}
                            className="px-3 py-2.5 text-sm outline-none appearance-none w-full" style={inputStyle}>
                            <option value="checking">Checking</option>
                            <option value="savings">Savings</option>
                            <option value="credit">Credit Card</option>
                            <option value="investment">Investment</option>
                            <option value="cash">Cash</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Currency</span>
                          <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                            className="px-3 py-2.5 text-sm outline-none appearance-none w-full" style={inputStyle}>
                            {['USD', 'EUR', 'GBP', 'BRL', 'CUP', 'MXN', 'CAD'].map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Row 3: Balance + Color */}
                      <div className="flex gap-3">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Current Balance</span>
                          <div className="flex">
                            <span className="flex items-center px-3 text-sm shrink-0"
                              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', borderRight: 'none', borderRadius: 'var(--radius-input) 0 0 var(--radius-input)', color: 'var(--color-text-muted)' }}>
                              {form.currency}
                            </span>
                            <input type="number" step="0.01" placeholder="0.00" value={form.balance}
                              onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))}
                              className="flex-1 px-3 py-2.5 text-sm outline-none min-w-0"
                              style={{ ...inputStyle, borderRadius: '0 var(--radius-input) var(--radius-input) 0', borderLeft: 'none' }} />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Color</span>
                          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5" style={{ ...inputStyle, borderRadius: 'var(--radius-input)' }}>
                            {PRESET_COLORS.map((c) => (
                              <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                                className="w-5 h-5 rounded-full transition-transform hover:scale-110 shrink-0"
                                style={{ background: c, outline: form.color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }} />
                            ))}
                          </div>
                        </div>
                      </div>

                    </div>

                    {error && (
                      <p className="text-xs px-1" style={{ color: 'var(--color-card-orange)' }}>{error}</p>
                    )}

                    <div className="flex gap-2 justify-end pt-1">
                      <button type="button" onClick={() => { setShowManualForm(false); setError(''); }}
                        className="px-4 py-2 text-sm font-medium rounded-xl transition-colors hover:bg-white/10"
                        style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        Cancel
                      </button>
                      <button type="submit" disabled={submitting}
                        className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-60"
                        style={{ background: 'var(--color-card-violet)' }}>
                        {submitting ? 'Adding…' : 'Add Account'}
                      </button>
                    </div>
                  </form>
                </div>,
                document.body
              )}

              {/* Account list */}
              {loading ? (
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading accounts…</p>
              ) : accounts.length === 0 && !showManualForm ? (
                <div className="p-10 flex flex-col items-center gap-3 text-center" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
                  <span className="text-4xl">🏦</span>
                  <p className="font-medium">No accounts yet</p>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    Connect your bank for automatic updates or add an account manually.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {accounts.map((account) => {
                    const meta = TYPE_META[account.accountType as AccountType] ?? TYPE_META.checking;
                    const color = account.color || meta.accent;
                    const balance = Number(account.balance);
                    const isConnected = account.provider === 'plaid';
                    return (
                      <div key={account.id}
                        className="flex items-center gap-4 p-4 transition-colors hover:bg-white/2"
                        style={{ ...glass, borderRadius: 'var(--radius-card)', borderLeft: `3px solid ${color}` }}>
                        <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-lg"
                          style={{ background: `rgba(${hexToRgb(color)}, 0.15)` }}>
                          {meta.icon}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate">{account.bankName}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                              style={{ background: `rgba(${hexToRgb(meta.accent)},0.15)`, color: meta.accent }}>
                              {meta.label}
                            </span>
                            {isConnected && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1"
                                style={{ background: 'rgba(79,191,127,0.12)', color: '#4FBF7F' }}>
                                <span className="w-1.5 h-1.5 rounded-full bg-card-green inline-block" />
                                Synced
                              </span>
                            )}
                          </div>
                          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                            {account.accountName}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="font-bold text-base"
                            style={{ color: account.accountType === 'credit' && balance > 0 ? 'var(--color-card-orange)' : 'white' }}>
                            {balance < 0 ? '−' : ''}{account.currency} {Math.abs(balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 ml-1">
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
            </></div>
          )}

          {/* ── CATEGORIES TAB ── */}
          {activeTab === 'categories' && <CategoryManager />}

        </div>
      </main>

      {importAccount && (
        <CsvImportModal
          accountId={importAccount.id}
          accountName={`${importAccount.bankName} — ${importAccount.accountName}`}
          onClose={() => setImportAccount(null)}
          onImported={() => setImportAccount(null)}
        />
      )}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
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

function CloseIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
