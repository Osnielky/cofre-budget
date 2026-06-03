'use client';

import { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePlaidLink } from 'react-plaid-link';
import Sidebar from '@/components/Sidebar';
import CsvImportModal from '@/components/CsvImportModal';
import CategoryManager from '@/components/CategoryManager';
import ProjectCategoryManager from '@/components/ProjectCategoryManager';
import BankSelect, { BANKS } from '@/components/BankSelect';
import AccountTypeIcon from '@/components/AccountTypeIcon';
import DataResetModal from '@/components/DataResetModal';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

type AccountType = 'checking' | 'savings' | 'credit' | 'investment' | 'cash' | 'loan';
type Tab = 'banks' | 'categories' | 'projects' | 'data';

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
  last4?: string | null;
}

const TYPE_META: Record<AccountType, { label: string; accent: string; icon: string }> = {
  checking:   { label: 'Checking',    accent: '#9B6DFF', icon: '💳' },
  savings:    { label: 'Savings',     accent: '#4FBF7F', icon: '🏦' },
  credit:     { label: 'Credit',      accent: '#F07A3E', icon: '💰' },
  investment: { label: 'Investment',  accent: '#4BA8D8', icon: '📈' },
  cash:       { label: 'Cash',        accent: '#4FBF7F', icon: '💵' },
  loan:       { label: 'Loan',        accent: '#F5C842', icon: '🤝' },
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
  background: 'rgba(255,255,255,0.07)',
  borderTop: '1px solid rgba(255,255,255,0.14)',
  borderRight: '1px solid rgba(255,255,255,0.14)',
  borderBottom: '1px solid rgba(255,255,255,0.14)',
  borderLeft: '1px solid rgba(255,255,255,0.14)',
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
  {
    id: 'projects',
    label: 'Project Categories',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 20h20M5 20V8l7-5 7 5v12"/><path d="M9 20v-5h6v5"/>
      </svg>
    ),
  },
  {
    id: 'data',
    label: 'Data',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
      </svg>
    ),
  },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('banks');
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [importAccount, setImportAccount] = useState<BankAccount | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [typeOpen, setTypeOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setTypeOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const [form, setForm] = useState({
    bankName: '', accountName: '', accountType: 'checking' as AccountType,
    balance: '', currency: 'USD', color: PRESET_COLORS[0], last4: '',
  });

  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    fetch(`${API}/bank-accounts`, { credentials: 'include' })
      .then((r) => r.json()).then(setAccounts)
      .catch(() => {})
      .finally(() => setLoading(false));
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
        body: JSON.stringify({ ...form, balance: parseFloat(form.balance) || 0, last4: form.last4.trim() || null }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setAccounts((prev) => [...prev, created]);
      setShowManualForm(false);
      setForm({ bankName: '', accountName: '', accountType: 'checking', balance: '', currency: 'USD', color: PRESET_COLORS[0], last4: '' });
    } catch { setError('Could not add account. Please try again.'); }
    finally { setSubmitting(false); }
  }

  function openEdit(account: BankAccount) {
    setForm({
      bankName: account.bankName,
      accountName: account.accountName,
      accountType: account.accountType as AccountType,
      balance: String(account.balance),
      currency: account.currency,
      color: account.color || PRESET_COLORS[0],
      last4: account.last4 ?? '',
    });
    setEditingAccount(account);
    setShowManualForm(true);
    setError('');
  }

  async function handleUpdate(e: FormEvent) {
    e.preventDefault();
    if (!editingAccount) return;
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`${API}/bank-accounts/${editingAccount.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...form, balance: parseFloat(form.balance) || 0, last4: form.last4.trim() || null }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setShowManualForm(false);
      setEditingAccount(null);
      setForm({ bankName: '', accountName: '', accountType: 'checking', balance: '', currency: 'USD', color: PRESET_COLORS[0], last4: '' });
    } catch { setError('Could not update account. Please try again.'); }
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
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
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
              <button key={tab.id}
                onClick={() => tab.id === 'data' ? setShowResetModal(true) : setActiveTab(tab.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={tab.id === 'data'
                  ? { color: '#FF6B6B', border: '1px solid rgba(255,80,80,0.28)', background: 'rgba(255,80,80,0.08)' }
                  : activeTab === tab.id
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
                  onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowManualForm(false); setEditingAccount(null); setError(''); } }}>

                  <form onSubmit={editingAccount ? handleUpdate : handleAdd}
                    className="w-full max-w-md flex flex-col rounded-2xl overflow-hidden"
                    style={{ background: 'rgba(18,18,30,0.99)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 32px 80px rgba(0,0,0,0.8)' }}>

                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-5"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                          style={{ background: `${TYPE_META[form.accountType]?.accent ?? '#9B6DFF'}22`, color: TYPE_META[form.accountType]?.accent ?? '#9B6DFF' }}>
                          {TYPE_META[form.accountType]?.icon}
                        </div>
                        <div>
                          <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                            {editingAccount ? 'Edit Account' : 'New Account'}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {TYPE_META[form.accountType]?.label} · {form.currency}
                          </p>
                        </div>
                      </div>
                      <button type="button" onClick={() => { setShowManualForm(false); setEditingAccount(null); setError(''); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                        style={{ color: 'var(--color-text-muted)' }}>
                        <CloseIcon />
                      </button>
                    </div>

                    <div className="flex flex-col gap-4 px-6 py-5">

                      {/* Row 1: Account Type + Currency */}
                      <div className="flex gap-3">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0" ref={typeDropdownRef} style={{ position: 'relative' }}>
                          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Type</label>
                          <button type="button" onClick={() => setTypeOpen((o) => !o)}
                            className="px-3 py-2.5 text-sm outline-none w-full flex items-center justify-between gap-2 rounded-xl"
                            style={inputStyle}>
                            <span className="flex items-center gap-2">
                              <span>{TYPE_META[form.accountType]?.icon}</span>
                              <span style={{ color: 'var(--color-text-primary)' }}>{TYPE_META[form.accountType]?.label}</span>
                            </span>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0, transition: 'transform .15s', transform: typeOpen ? 'rotate(180deg)' : undefined }}>
                              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          {typeOpen && (
                            <div style={{
                              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
                              background: 'rgba(18,18,30,0.99)', backdropFilter: 'blur(20px)',
                              WebkitBackdropFilter: 'blur(20px)',
                              border: '1px solid rgba(255,255,255,0.10)',
                              borderRadius: '0.75rem', overflow: 'hidden',
                              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                            }}>
                              {(Object.entries(TYPE_META) as [AccountType, typeof TYPE_META[AccountType]][]).map(([val, meta]) => (
                                <button key={val} type="button"
                                  onClick={() => { setForm((f) => ({ ...f, accountType: val, bankName: val === 'cash' ? 'Personal' : f.bankName, accountName: val === 'cash' && !f.accountName ? 'My Cash' : f.accountName })); setTypeOpen(false); }}
                                  className="w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5 transition-colors"
                                  style={{ color: form.accountType === val ? meta.accent : 'var(--color-text-primary)', background: form.accountType === val ? `${meta.accent}18` : 'transparent' }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = `${meta.accent}15`)}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = form.accountType === val ? `${meta.accent}18` : 'transparent')}>
                                  <span>{meta.icon}</span><span>{meta.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0" style={{ width: 90 }}>
                          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Currency</label>
                          <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                            className="px-3 py-2.5 text-sm outline-none appearance-none w-full rounded-xl" style={inputStyle}>
                            {['USD', 'EUR', 'GBP', 'BRL', 'CUP', 'MXN', 'CAD'].map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Bank — hidden for cash */}
                      {form.accountType !== 'cash' && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                          {form.accountType === 'loan' ? 'Institution or Person' : 'Bank'}
                        </label>
                        {form.accountType === 'loan' ? (
                          <input required placeholder="e.g. John Smith" value={form.bankName}
                            onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                            className="px-3 py-2.5 text-sm outline-none rounded-xl w-full" style={inputStyle} />
                        ) : (
                          <BankSelect value={form.bankName} onChange={(v) => setForm((f) => ({ ...f, bankName: v }))}
                            inputStyle={{ ...inputStyle, borderRadius: '0.75rem' }} />
                        )}
                      </div>
                      )}

                      {/* Account Name + Last 4 */}
                      <div className="flex gap-3">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                            {form.accountType === 'loan' ? 'Description' : 'Account Name'}
                          </label>
                          <input required
                            placeholder={form.accountType === 'loan' ? 'e.g. Personal Loan' : 'e.g. Main Checking'}
                            value={form.accountName}
                            onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))}
                            className="px-3 py-2.5 text-sm outline-none rounded-xl" style={inputStyle} />
                        </div>
                        {form.accountType !== 'cash' && (
                        <div className="flex flex-col gap-1.5 shrink-0" style={{ width: 84 }}>
                          <label className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                            Last 4
                            <span className="relative group" style={{ lineHeight: 0 }}>
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ cursor: 'pointer', color: 'var(--color-text-muted)', opacity: 0.6 }}>
                                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                                <path d="M8 7v5M8 5.5v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                              <span className="absolute bottom-full right-0 mb-2 w-48 text-[11px] leading-relaxed font-normal normal-case tracking-normal rounded-lg px-3 py-2.5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50"
                                style={{ background: 'rgba(18,18,30,0.99)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--color-text-secondary)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', whiteSpace: 'normal' }}>
                                Last 4 digits of your card or account number. Used to detect if a CSV file belongs to this account on import.
                                <span className="absolute top-full right-2 -mt-px" style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid rgba(255,255,255,0.12)' }} />
                              </span>
                            </span>
                          </label>
                          <input placeholder="···· " maxLength={4} value={form.last4}
                            onChange={(e) => setForm((f) => ({ ...f, last4: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                            className="px-3 py-2.5 text-sm outline-none text-center tracking-[0.3em] rounded-xl" style={inputStyle} />
                        </div>
                        )}
                      </div>

                      {/* Balance + Color */}
                      <div className="flex gap-3">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                            {form.accountType === 'loan' ? 'Amount Owed' : form.accountType === 'credit' ? 'Current Debt' : 'Balance'}
                          </label>
                          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
                            <span className="flex items-center px-3 text-xs font-semibold shrink-0"
                              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                              {form.currency}
                            </span>
                            <input type="number" step="0.01" placeholder="0.00" value={form.balance}
                              onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))}
                              className="flex-1 px-3 py-2.5 text-sm outline-none min-w-0"
                              style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-primary)' }} />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Color</label>
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ ...inputStyle }}>
                            {PRESET_COLORS.map((c) => (
                              <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                                className="w-5 h-5 rounded-full transition-all hover:scale-110 shrink-0"
                                style={{ background: c, boxShadow: form.color === c ? `0 0 0 2px rgba(0,0,0,0.6), 0 0 0 4px ${c}` : 'none' }} />
                            ))}
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-6 py-4"
                      style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                      {error
                        ? <p className="text-xs" style={{ color: 'var(--color-card-orange)' }}>{error}</p>
                        : <span />}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setShowManualForm(false); setEditingAccount(null); setError(''); }}
                          className="px-4 py-2 text-sm font-medium rounded-xl transition-colors hover:bg-white/10"
                          style={{ color: 'var(--color-text-secondary)' }}>
                          Cancel
                        </button>
                        <button type="submit" disabled={submitting}
                          className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-60 transition-all"
                          style={{ background: TYPE_META[form.accountType]?.accent ?? 'var(--color-card-violet)' }}>
                          {submitting ? 'Saving…' : editingAccount ? 'Save Changes' : 'Add Account'}
                        </button>
                      </div>
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
                    const meta       = TYPE_META[account.accountType as AccountType] ?? TYPE_META.checking;
                    const color      = account.color || meta.accent;
                    const balance    = Number(account.balance);
                    const isDebt     = ['credit', 'loan'].includes(account.accountType);
                    const isConnected = account.provider === 'plaid';
                    const bankMeta   = BANKS.find((b) => b.name === account.bankName);
                    const isCash     = account.accountType === 'cash';

                    return (
                      <div key={account.id}
                        className="flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all hover:brightness-110"
                        style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}28`, borderLeft: `3px solid ${color}` }}>

                        {/* Mini card visual */}
                        <div className="shrink-0 w-14 h-10 rounded-xl flex flex-col items-center justify-center relative overflow-hidden"
                          style={{ background: `linear-gradient(135deg, ${color}55 0%, ${color}22 100%)`, border: `1px solid ${color}44` }}>
                          {isCash ? (
                            <span className="text-xl">💵</span>
                          ) : bankMeta ? (
                            <img src={`https://logo.clearbit.com/${bankMeta.domain}`}
                              alt={account.bankName} width={28} height={28}
                              style={{ objectFit: 'contain', borderRadius: 4, background: 'white', padding: 2 }}
                              onError={(e) => {
                                const img = e.currentTarget;
                                img.src = `https://www.google.com/s2/favicons?domain=${bankMeta.domain}&sz=64`;
                                img.style.background = 'transparent';
                                img.style.padding = '0';
                              }} />
                          ) : (
                            <AccountTypeIcon type={account.accountType} size={22} />
                          )}
                          {account.last4 && (
                            <span className="text-[8px] font-bold tracking-widest leading-none mt-0.5"
                              style={{ color: 'rgba(255,255,255,0.7)' }}>
                              ···{account.last4}
                            </span>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                              {account.accountName}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                              style={{ background: `${meta.accent}18`, color: meta.accent }}>
                              {meta.label}
                            </span>
                            {isConnected && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1"
                                style={{ background: 'rgba(79,191,127,0.12)', color: '#4FBF7F' }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#4FBF7F' }} />
                                Synced
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                            {account.bankName}{account.currency !== 'USD' ? ` · ${account.currency}` : ''}
                          </p>
                        </div>

                        {/* Balance */}
                        <div className="text-right shrink-0">
                          <p className="font-black text-base tabular-nums"
                            style={{ color: isDebt && balance > 0 ? '#FF6B6B' : 'var(--color-text-primary)' }}>
                            {isDebt && balance > 0 ? '−' : ''}{account.currency} {Math.abs(balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                          {isDebt && balance > 0 && (
                            <p className="text-[10px] font-semibold" style={{ color: 'rgba(255,107,107,0.6)' }}>owed</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 ml-1">
                          <button onClick={() => openEdit(account)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                            title="Edit account" style={{ color: 'var(--color-text-secondary)' }}>
                            <EditIcon />
                          </button>
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

          {/* ── PROJECT CATEGORIES TAB ── */}
          {activeTab === 'projects' && <ProjectCategoryManager />}


        </div>
      </main>

      {importAccount && (
        <CsvImportModal
          account={importAccount}
          onClose={() => setImportAccount(null)}
          onImported={() => setImportAccount(null)}
        />
      )}

      {showResetModal && (
        <DataResetModal
          accounts={accounts}
          onClose={() => setShowResetModal(false)}
          onDone={() => {
            setShowResetModal(false);
            /* Reload accounts in case they were deleted */
            fetch(`${API}/bank-accounts`, { credentials: 'include' })
              .then((r) => r.json()).then(setAccounts);
          }}
        />
      )}
    </div>
  );
}

function EditIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
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
