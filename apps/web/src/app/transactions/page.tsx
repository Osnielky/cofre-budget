'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Sidebar from '@/components/Sidebar';
import CsvImportModal from '@/components/CsvImportModal';
import BankSelect from '@/components/BankSelect';
import CategoryFormModal from '@/components/CategoryFormModal';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Category { id: string; name: string; icon: string; color: string; type: string }
interface BankAccount { id: string; bankName: string; accountName: string; accountType: string; color: string; provider: string; plaidItemId: string | null }
interface Budget { id: string; categoryId: string; category: Category; amount: string | number; spent: number }
interface Transaction {
  id: string; name: string; amount: number; date: string; source: string; pending: boolean;
  categoryId: string | null; categoryRef: Category | null;
  bankAccountId: string; bankAccount: BankAccount | null;
}

type Filter    = 'all' | 'uncategorized' | 'expense' | 'income';
type RangeMode = 'month' | 'custom';

const glass: React.CSSProperties = {
  background: 'rgba(35,35,47,0.50)', backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
};

/* ── date helpers ──────────────────────────────────────────────── */
function currentMonth() { return new Date().toISOString().slice(0, 7); }
function prevMonth(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nextMonth(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
function monthFrom(m: string) { return `${m}-01`; }
function monthTo(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).toISOString().slice(0, 10);
}
function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatAmount(n: number) {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 });
  return n >= 0 ? `+$${abs}` : `-$${abs}`;
}
const TYPE_META: Record<string, string> = { checking: '💳', savings: '🏦', credit: '💰', investment: '📈' };

/* ═══════════════════════════════════════════════════════════════ */
export default function TransactionsPage() {
  const [month, setMonth]           = useState(currentMonth);
  const [rangeMode, setRangeMode]   = useState<RangeMode>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories]     = useState<Category[]>([]);
  const [accounts, setAccounts]         = useState<BankAccount[]>([]);
  const [loading, setLoading]           = useState(true);
  const [syncing, setSyncing]           = useState(false);
  const [filter, setFilter]             = useState<Filter>('all');
  const [search, setSearch]             = useState('');
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [pickerPos, setPickerPos]       = useState<{ top: number; left: number } | null>(null);
  const [updatingId, setUpdatingId]     = useState<string | null>(null);
  const [importAccount, setImportAccount]       = useState<BankAccount | null>(null);
  const [showImportPicker, setShowImportPicker] = useState(false);
  const [showAddAccForm, setShowAddAccForm]     = useState(false);
  const [addingAcc, setAddingAcc]               = useState(false);
  const [addAccError, setAddAccError]           = useState('');
  const [newAcc, setNewAcc] = useState({ bankName: '', accountName: '', accountType: 'checking', color: '#9B6DFF', currency: 'USD' });
  const pickerRef     = useRef<HTMLDivElement>(null);
  const importBtnRef  = useRef<HTMLDivElement>(null);

  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatForTxId, setNewCatForTxId]     = useState<string | null>(null);
  const [showManualTx, setShowManualTx]   = useState(false);
  const [manualTxSaving, setManualTxSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [manualTx, setManualTx] = useState({ name: '', amountStr: '', sign: '-' as '+' | '-', date: today, bankAccountId: '', categoryId: '' });

  const [budgetWidth, setBudgetWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 256;
    return Number(localStorage.getItem('budgetWidth') || '256');
  });
  const [showNotifications, setShowNotifications] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('showNotifications') !== 'false';
  });
  const dragRef = useRef<{ active: boolean; startX: number; startWidth: number }>({ active: false, startX: 0, startWidth: 0 });

  function startBudgetResize(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { active: true, startX: e.clientX, startWidth: budgetWidth };
    function onMove(ev: MouseEvent) {
      if (!dragRef.current.active) return;
      const delta = dragRef.current.startX - ev.clientX;
      const next = Math.min(480, Math.max(180, dragRef.current.startWidth + delta));
      setBudgetWidth(next);
    }
    function onUp() {
      dragRef.current.active = false;
      setBudgetWidth((w) => { localStorage.setItem('budgetWidth', String(w)); return w; });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function toggleNotifications() {
    setShowNotifications((prev) => {
      const next = !prev;
      localStorage.setItem('showNotifications', String(next));
      return next;
    });
  }

  const ACC_COLORS = ['#9B6DFF', '#4FBF7F', '#F07A3E', '#F5C842', '#4BA8D8', '#E879A0'];

  const from = rangeMode === 'month' ? monthFrom(month) : customFrom;
  const to   = rangeMode === 'month' ? monthTo(month)   : customTo;

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    const res = await fetch(`${API}/transactions?${params}`, { credentials: 'include' });
    setTransactions(await res.json());
    setLoading(false);
  }, [from, to]);

  const budgetMonth = rangeMode === 'month' ? month : (from ? from.slice(0, 7) : currentMonth());
  const [budgets, setBudgets]             = useState<Budget[]>([]);
  const [budgetsLoading, setBudgetsLoading] = useState(true);

  const loadBudgets = useCallback(async () => {
    setBudgetsLoading(true);
    const res = await fetch(`${API}/budgets?month=${budgetMonth}`, { credentials: 'include' });
    setBudgets(await res.json());
    setBudgetsLoading(false);
  }, [budgetMonth]);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/categories`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API}/bank-accounts`, { credentials: 'include' }).then((r) => r.json()),
    ]).then(([cats, accs]) => { setCategories(cats); setAccounts(accs); });
  }, []);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);
  useEffect(() => { loadBudgets(); }, [loadBudgets]);

  /* close pickers on outside click */
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (openPickerId && pickerRef.current && !pickerRef.current.contains(e.target as Node))
        setOpenPickerId(null);
      if (showImportPicker && importBtnRef.current && !importBtnRef.current.contains(e.target as Node)) {
        setShowImportPicker(false);
        setShowAddAccForm(false);
        setAddAccError('');
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openPickerId, showImportPicker]);

  /* ── category assign ── */
  async function assignCategory(txId: string, categoryId: string | null) {
    setUpdatingId(txId); setOpenPickerId(null);
    const res = await fetch(`${API}/transactions/${txId}/category`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ categoryId }),
    });
    const updated: Transaction = await res.json();
    setTransactions((prev) => prev.map((t) =>
      t.id === txId ? { ...t, categoryId: updated.categoryId, categoryRef: updated.categoryRef } : t,
    ));
    setUpdatingId(null);
  }

  /* ── manual transaction ── */
  async function saveManualTx(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(manualTx.amountStr);
    if (!manualTx.bankAccountId || !manualTx.amountStr || isNaN(amount)) return;
    setManualTxSaving(true);
    try {
      const res = await fetch(`${API}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: manualTx.name,
          amount: amount * (manualTx.sign === '-' ? -1 : 1),
          date: manualTx.date,
          bankAccountId: manualTx.bankAccountId,
          categoryId: manualTx.categoryId || null,
        }),
      });
      if (!res.ok) return;
      const created: Transaction = await res.json();
      setTransactions((prev) => [created, ...prev]);
      setShowManualTx(false);
      setManualTx({ name: '', amountStr: '', sign: '-', date: today, bankAccountId: '', categoryId: '' });
    } finally {
      setManualTxSaving(false);
    }
  }

  async function deleteManualTx(id: string) {
    await fetch(`${API}/transactions/${id}`, { method: 'DELETE', credentials: 'include' });
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  /* ── sync all Plaid accounts ── */
  async function syncAll() {
    const plaid = accounts.filter((a) => a.provider === 'plaid' && a.plaidItemId);
    if (!plaid.length) return;
    setSyncing(true);
    await Promise.all(plaid.map((a) =>
      fetch(`${API}/plaid/sync/${a.plaidItemId}`, { method: 'POST', credentials: 'include' }),
    ));
    await loadTransactions();
    setSyncing(false);
  }

  /* ── add account inline ── */
  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    setAddAccError('');
    const duplicate = accounts.some(
      (a) => a.bankName.toLowerCase() === newAcc.bankName.toLowerCase() &&
             a.accountName.toLowerCase() === newAcc.accountName.toLowerCase(),
    );
    if (duplicate) { setAddAccError('An account with this name already exists.'); return; }
    setAddingAcc(true);
    try {
      const res = await fetch(`${API}/bank-accounts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...newAcc, balance: 0 }),
      });
      const created: BankAccount = await res.json();
      setAccounts((prev) => [...prev, created]);
      setImportAccount(created);
      setShowImportPicker(false);
      setShowAddAccForm(false);
      setNewAcc({ bankName: '', accountName: '', accountType: 'checking', color: '#9B6DFF', currency: 'USD' });
    } finally { setAddingAcc(false); }
  }

  /* ── derived data ── */
  const isTransfer = (t: Transaction) => t.categoryRef?.type === 'transfer';
  const uncategorizedCount = transactions.filter((t) => !t.categoryId && !isTransfer(t)).length;
  const visible = transactions.filter((t) => {
    if (filter === 'uncategorized' && (t.categoryId || isTransfer(t))) return false;
    if (filter === 'expense'       && (Number(t.amount) >= 0 || isTransfer(t))) return false;
    if (filter === 'income'        && (Number(t.amount) < 0  || isTransfer(t))) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  /* Group by account first, then by date within each account */
  const byAccount = visible.reduce<Map<string, Transaction[]>>((map, tx) => {
    const key = tx.bankAccountId ?? 'unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tx);
    return map;
  }, new Map());

  const accountGroups = [...byAccount.entries()].sort(([, a], [, b]) =>
    (a[0]?.bankAccount?.bankName ?? '').localeCompare(b[0]?.bankAccount?.bankName ?? ''),
  );

  const hasPlaid = accounts.some((a) => a.provider === 'plaid');
  const totalIncome  = transactions.filter((t) => Number(t.amount) >= 0 && !isTransfer(t)).reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = transactions.filter((t) => Number(t.amount) < 0  && !isTransfer(t)).reduce((s, t) => s + Number(t.amount), 0);

  /* Collapse state — accounts */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function toggleCollapse(id: string) {
    setCollapsed((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const allCollapsed = accountGroups.length > 0 && accountGroups.every(([id]) => collapsed.has(id));

  /* Collapse state — date groups (key = accountId::date) */
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  function toggleCollapseDate(key: string) {
    setCollapsedDates((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  /* ════════════════════════════════════════════════════════════ */
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto min-w-0">

        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-20 px-6 pt-5 pb-4 flex flex-col gap-4"
          style={{ background: 'rgba(15,15,26,0.88)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>

          {/* Title + actions */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
            <div className="flex items-center gap-2">
              {/* New manual transaction */}
              <button onClick={() => setShowManualTx(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition-all hover:brightness-110"
                style={{ background: 'rgba(79,191,127,0.15)', border: '1px solid rgba(79,191,127,0.28)', color: '#4FBF7F' }}>
                <PlusIcon /> New
              </button>
              {/* Import CSV */}
              <div className="relative" ref={importBtnRef}>
                <button onClick={() => { setShowImportPicker((v) => !v); setShowAddAccForm(false); setAddAccError(''); }}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition-all hover:brightness-110"
                  style={{ background: 'rgba(155,109,255,0.15)', border: '1px solid rgba(155,109,255,0.28)', color: '#9B6DFF' }}>
                  <UploadIcon /> Import CSV
                </button>
                {showImportPicker && (
                  <div className="absolute right-0 top-full mt-2 z-30 rounded-xl min-w-64"
                    style={{ ...glass }}>

                    {!showAddAccForm ? (
                      /* ── Account list ── */
                      <>
                        <p className="px-3 pt-3 pb-1 text-[10px] font-bold tracking-widest uppercase"
                          style={{ color: 'var(--color-text-muted)' }}>Select account</p>

                        {accounts.length === 0 ? (
                          <p className="px-3 py-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            No accounts yet — create one below.
                          </p>
                        ) : (
                          accounts.map((a) => (
                            <button key={a.id}
                              onClick={() => { setImportAccount(a); setShowImportPicker(false); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors hover:bg-white/10 text-left">
                              <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm"
                                style={{ background: `${a.color || '#9B6DFF'}20` }}>
                                {TYPE_META[a.accountType] ?? '🏦'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold truncate">{a.bankName}</p>
                                <p className="truncate" style={{ color: 'var(--color-text-muted)' }}>{a.accountName}</p>
                              </div>
                            </button>
                          ))
                        )}

                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '4px 0' }} />
                        <button
                          onClick={() => { setShowAddAccForm(true); setAddAccError(''); }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold transition-colors hover:bg-white/10"
                          style={{ color: '#9B6DFF' }}>
                          <span className="text-base leading-none">+</span> Create new account
                        </button>
                      </>
                    ) : (
                      /* ── Inline add account form ── */
                      <form onSubmit={handleAddAccount} className="p-3 flex flex-col gap-2.5">
                        <div className="flex items-center gap-2 mb-1">
                          <button type="button" onClick={() => { setShowAddAccForm(false); setAddAccError(''); }}
                            className="text-lg leading-none hover:opacity-70" style={{ color: 'var(--color-text-muted)' }}>
                            ←
                          </button>
                          <p className="text-xs font-bold" style={{ color: 'var(--color-text-secondary)' }}>New Account</p>
                        </div>

                        <BankSelect
                          value={newAcc.bankName}
                          onChange={(v: string) => setNewAcc((f) => ({ ...f, bankName: v }))}
                          compact
                          inputStyle={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px', color: 'var(--color-text-primary)' }}
                        />

                        <input required placeholder="Account name (e.g. Checking)" value={newAcc.accountName}
                          onChange={(e) => setNewAcc((f) => ({ ...f, accountName: e.target.value }))}
                          className="w-full px-3 py-2 text-xs rounded-lg outline-none"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--color-text-primary)' }} />

                        <div className="flex gap-2">
                          <select value={newAcc.accountType} onChange={(e) => setNewAcc((f) => ({ ...f, accountType: e.target.value }))}
                            className="flex-1 px-2 py-2 text-xs rounded-lg outline-none appearance-none"
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--color-text-primary)' }}>
                            <option value="checking">Checking</option>
                            <option value="savings">Savings</option>
                            <option value="credit">Credit Card</option>
                            <option value="investment">Investment</option>
                          </select>
                          <select value={newAcc.currency} onChange={(e) => setNewAcc((f) => ({ ...f, currency: e.target.value }))}
                            className="px-2 py-2 text-xs rounded-lg outline-none appearance-none"
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--color-text-primary)' }}>
                            {['USD','EUR','GBP','MXN','BRL','CAD'].map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </div>

                        {/* Color swatches */}
                        <div className="flex items-center gap-1.5 px-1">
                          {ACC_COLORS.map((c) => (
                            <button key={c} type="button" onClick={() => setNewAcc((f) => ({ ...f, color: c }))}
                              className="w-5 h-5 rounded-full transition-transform hover:scale-110 shrink-0"
                              style={{ background: c, outline: newAcc.color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }} />
                          ))}
                        </div>

                        {addAccError && (
                          <p className="text-[10px] px-1" style={{ color: '#FF6B6B' }}>{addAccError}</p>
                        )}

                        <button type="submit" disabled={addingAcc}
                          className="w-full py-2 text-xs font-bold rounded-lg transition-all hover:brightness-110 disabled:opacity-50"
                          style={{ background: 'var(--color-card-violet)', color: 'white' }}>
                          {addingAcc ? 'Creating…' : 'Create & Import'}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {/* Sync (Plaid only) */}
              {hasPlaid && (
                <button onClick={syncAll} disabled={syncing}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition-all hover:brightness-110 disabled:opacity-50"
                  style={{ background: 'rgba(79,191,127,0.12)', border: '1px solid rgba(79,191,127,0.25)', color: '#4FBF7F' }}>
                  <span style={{ display: 'inline-block', animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
                    <SyncIcon />
                  </span>
                  {syncing ? 'Syncing…' : 'Sync Plaid'}
                </button>
              )}
            </div>
          </div>

          {/* ── Date range selector ── */}
          <div className="flex items-center gap-3 flex-wrap">
            {rangeMode === 'month' ? (
              <div className="flex items-center gap-1 p-1 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <button onClick={() => setMonth(prevMonth(month))}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10 text-lg leading-none"
                  style={{ color: 'var(--color-text-secondary)' }}>‹</button>
                <span className="px-3 text-sm font-semibold min-w-36 text-center">{monthLabel(month)}</span>
                <button onClick={() => setMonth(nextMonth(month))}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10 text-lg leading-none"
                  style={{ color: 'var(--color-text-secondary)' }}>›</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-xl outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--color-text-primary)' }} />
                <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-xl outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--color-text-primary)' }} />
              </div>
            )}
            <button onClick={() => setRangeMode((m) => m === 'month' ? 'custom' : 'month')}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-white/10"
              style={{ color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {rangeMode === 'month' ? '📅 Custom range' : '← Month view'}
            </button>

            {/* Summary chips */}
            {!loading && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs px-2.5 py-1 rounded-lg font-semibold"
                  style={{ background: 'rgba(79,191,127,0.10)', color: '#4FBF7F' }}>
                  +${totalIncome.toFixed(2)}
                </span>
                <span className="text-xs px-2.5 py-1 rounded-lg font-semibold"
                  style={{ background: 'rgba(240,122,62,0.10)', color: '#F07A3E' }}>
                  -${Math.abs(totalExpense).toFixed(2)}
                </span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {transactions.length} transactions
                </span>
              </div>
            )}
          </div>

          {/* ── Uncategorized alert ── */}
          {!loading && uncategorizedCount > 0 && (
            <button onClick={() => setFilter('uncategorized')}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-left w-full transition-opacity hover:opacity-80"
              style={{ background: 'rgba(245,200,66,0.08)', border: '1px solid rgba(245,200,66,0.25)' }}>
              <span className="text-lg">🏷️</span>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: '#F5C842' }}>
                  {uncategorizedCount} transaction{uncategorizedCount !== 1 ? 's' : ''} without a category
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Assign categories so your budgets track spending correctly.
                </p>
              </div>
              <span className="text-xs font-bold px-2 py-1 rounded-lg shrink-0"
                style={{ background: 'rgba(245,200,66,0.16)', color: '#F5C842' }}>
                Review →
              </span>
            </button>
          )}

          {/* ── Search + filter tabs ── */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-44">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--color-text-muted)' }}><SearchIcon /></span>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name…"
                className="w-full pl-9 pr-3 py-2 text-sm outline-none rounded-xl"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'var(--color-text-primary)' }} />
            </div>
            <div className="flex gap-1 p-1 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {([
                { id: 'all',          label: 'All',           count: transactions.length },
                { id: 'uncategorized',label: 'Uncategorized', count: uncategorizedCount, dot: true },
                { id: 'expense',      label: 'Expenses',      count: transactions.filter((t) => Number(t.amount) < 0).length },
                { id: 'income',       label: 'Income',        count: transactions.filter((t) => Number(t.amount) >= 0).length },
              ] as { id: Filter; label: string; count: number; dot?: boolean }[]).map((f) => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={filter === f.id
                    ? { background: 'rgba(155,109,255,0.18)', color: '#9B6DFF', border: '1px solid rgba(155,109,255,0.28)' }
                    : { color: 'var(--color-text-muted)', border: '1px solid transparent' }}>
                  {f.dot && f.count > 0 && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#F5C842' }} />}
                  {f.label}
                  <span className="opacity-50">{f.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Transaction list ── */}
        <div className="px-6 py-5 flex flex-col gap-4">

          {/* Expand / Collapse all */}
          {accountGroups.length > 1 && (
            <div className="flex justify-end">
              <button
                onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(accountGroups.map(([id]) => id)))}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-white/10"
                style={{ color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {allCollapsed ? '↓ Expand all' : '↑ Collapse all'}
              </button>
            </div>
          )}

          {loading ? (
            <p className="py-16 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading transactions…</p>
          ) : accountGroups.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-center"
              style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
              <span className="text-4xl">💸</span>
              <p className="font-semibold">No transactions found</p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {filter === 'uncategorized'
                  ? '✅ All transactions in this period are categorized!'
                  : 'Import a CSV or connect a bank account to get started.'}
              </p>
              {filter !== 'all' && (
                <button onClick={() => setFilter('all')}
                  className="mt-1 text-sm px-3 py-1.5 rounded-lg"
                  style={{ color: '#9B6DFF', border: '1px solid rgba(155,109,255,0.25)' }}>
                  Clear filter
                </button>
              )}
            </div>
          ) : (
            accountGroups.map(([accountId, txList]) => {
              const acc        = txList[0]?.bankAccount;
              const isCollapsed = collapsed.has(accountId);
              const accIncome       = txList.filter((t) => Number(t.amount) >= 0 && !isTransfer(t)).reduce((s, t) => s + Number(t.amount), 0);
              const accExpense      = txList.filter((t) => Number(t.amount) < 0  && !isTransfer(t)).reduce((s, t) => s + Number(t.amount), 0);
              const accUncategorized = txList.filter((t) => !t.categoryId && !isTransfer(t)).length;
              const accColor        = acc?.color || '#9B6DFF';

              const dateMap = txList.reduce<Record<string, Transaction[]>>((m, tx) => {
                (m[tx.date] ??= []).push(tx); return m;
              }, {});
              const dates = Object.keys(dateMap).sort((a, b) => b.localeCompare(a));

              return (
                <div key={accountId} className="flex flex-col gap-2">

                  {/* ── Account header ── */}
                  <button
                    onClick={() => toggleCollapse(accountId)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-all hover:brightness-110"
                    style={{ ...glass, borderLeft: `3px solid ${accColor}` }}>

                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style={{ background: `${accColor}20` }}>
                      {TYPE_META[acc?.accountType ?? ''] ?? '🏦'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{acc?.bankName ?? 'Unknown Bank'}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                        {acc?.accountName}{acc?.accountType ? ` · ${acc.accountType}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {accIncome > 0 && (
                        <span className="text-xs font-semibold hidden sm:block" style={{ color: '#4FBF7F' }}>
                          +${accIncome.toFixed(2)}
                        </span>
                      )}
                      {accExpense < 0 && (
                        <span className="text-xs font-semibold hidden sm:block" style={{ color: '#F07A3E' }}>
                          -${Math.abs(accExpense).toFixed(2)}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-muted)' }}>
                        {txList.length}
                      </span>
                      {accUncategorized > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: 'rgba(245,200,66,0.15)', color: '#F5C842' }}>
                          {accUncategorized} uncat.
                        </span>
                      )}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                        strokeLinecap="round" strokeLinejoin="round"
                        style={{ color: 'var(--color-text-muted)', transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </button>

                  {/* ── Date groups (shown when expanded) ── */}
                  {!isCollapsed && dates.map((date) => {
                    const dateKey       = `${accountId}::${date}`;
                    const dateCollapsed = collapsedDates.has(dateKey);
                    const dayUncategorized = dateMap[date].filter((t) => !t.categoryId && !isTransfer(t)).length;
                    return (
                    <div key={date} className="pl-3">
                      {/* Date header — collapsible */}
                      <button
                        onClick={() => toggleCollapseDate(dateKey)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 mb-1 rounded-lg transition-colors hover:bg-white/5 text-left">
                        <span className="text-[10px] font-bold tracking-wider uppercase flex-1"
                          style={{ color: 'var(--color-text-muted)' }}>
                          {formatDate(date)}
                        </span>
                        {dayUncategorized > 0 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                            style={{ background: 'rgba(245,200,66,0.12)', color: '#F5C842' }}>
                            {dayUncategorized} uncat.
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md"
                          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>
                          {dateMap[date].length}
                        </span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                          strokeLinecap="round" strokeLinejoin="round"
                          style={{ color: 'var(--color-text-muted)', transition: 'transform 0.2s', transform: dateCollapsed ? 'rotate(-90deg)' : 'none', flexShrink: 0 }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      {!dateCollapsed && (
                      <div className="flex flex-col overflow-hidden"
                        style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
                        {dateMap[date].map((tx, i) => {
                        const amount       = Number(tx.amount);
                        const isIncome     = amount >= 0;
                        const cat          = tx.categoryRef;
                        const txIsTransfer = isTransfer(tx);
                        const isOpen       = openPickerId === tx.id;
                        const pickerCats   = isIncome
                          ? categories.filter((c) => c.type !== 'expense')
                          : categories.filter((c) => c.type !== 'income');

                        return (
                          <div key={tx.id} className="relative group"
                            style={i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.05)' } : {}}>
                            <div className="flex items-center gap-3 px-4 py-3">

                              {/* Income/expense/transfer bar */}
                              <div className="w-1 h-8 rounded-full shrink-0"
                                style={{ background: txIsTransfer ? '#6B6B8A' : isIncome ? '#4FBF7F' : '#F07A3E' }} />

                              {/* Name + source */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate leading-snug">{tx.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase"
                                    style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>
                                    {tx.source}
                                  </span>
                                  {tx.pending && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                      style={{ background: 'rgba(245,200,66,0.12)', color: '#F5C842' }}>
                                      Pending
                                    </span>
                                  )}
                                </div>
                              </div>

                          {/* Category picker */}
                          <div className="relative shrink-0">
                            <button
                              onMouseDown={(e) => { if (isOpen) e.stopPropagation(); }}
                              onClick={(e) => {
                                if (isOpen) { setOpenPickerId(null); return; }
                                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                const w = 220;
                                const left = Math.max(4, rect.right - w);
                                const spaceBelow = window.innerHeight - rect.bottom - 8;
                                const spaceAbove = rect.top - 8;
                                const openAbove = spaceBelow < 200 && spaceAbove > spaceBelow;
                                setPickerPos({ top: openAbove ? rect.top - Math.min(300, spaceAbove) - 4 : rect.bottom + 4, left });
                                setOpenPickerId(tx.id);
                              }}
                              disabled={updatingId === tx.id}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:brightness-110 disabled:opacity-40 max-w-40"
                              style={cat
                                ? { background: `${cat.color}18`, border: `1px solid ${cat.color}35`, color: cat.color }
                                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--color-text-muted)' }}>
                              {updatingId === tx.id ? (
                                <span>…</span>
                              ) : cat ? (
                                <><span>{cat.icon}</span><span className="truncate">{cat.name}</span><ChevronIcon /></>
                              ) : (
                                <><TagIcon /><span>Categorize</span><ChevronIcon /></>
                              )}
                            </button>

                            {isOpen && pickerPos && createPortal(
                              <div ref={pickerRef} className="py-1 rounded-xl overflow-y-auto"
                                style={{ ...glass, position: 'fixed', top: pickerPos.top, left: pickerPos.left, width: '220px', maxHeight: '300px', zIndex: 9999 }}>
                                {cat && (
                                  <>
                                    <button onClick={() => assignCategory(tx.id, null)}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-white/10"
                                      style={{ color: '#FF6B6B' }}>
                                      <span>✕</span><span>Remove category</span>
                                    </button>
                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />
                                  </>
                                )}
                                {pickerCats.map((c) => (
                                  <button key={c.id} onClick={() => assignCategory(tx.id, c.id)}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors hover:bg-white/10"
                                    style={tx.categoryId === c.id ? { background: `${c.color}15` } : {}}>
                                    <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                                      style={{ background: `${c.color}20` }}>{c.icon}</span>
                                    <span className="font-medium flex-1 text-left"
                                      style={{ color: tx.categoryId === c.id ? c.color : 'var(--color-text-primary)' }}>
                                      {c.name}
                                    </span>
                                    {tx.categoryId === c.id && <span style={{ color: c.color }}>✓</span>}
                                  </button>
                                ))}
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '4px 0' }} />
                                <button
                                  onClick={() => { setOpenPickerId(null); setNewCatForTxId(tx.id); setShowNewCatModal(true); }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold transition-colors hover:bg-white/10"
                                  style={{ color: '#9B6DFF' }}>
                                  <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                                    style={{ background: 'rgba(155,109,255,0.15)' }}>+</span>
                                  New category
                                </button>
                              </div>,
                              document.body
                            )}
                          </div>

                          {/* Delete — manual only */}
                          {tx.source === 'manual' && (
                            <button onClick={() => deleteManualTx(tx.id)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20 shrink-0"
                              title="Delete transaction">
                              <TrashIcon />
                            </button>
                          )}

                          {/* Amount */}
                          <p className="text-sm font-bold tabular-nums w-24 text-right shrink-0"
                            style={{ color: txIsTransfer ? '#6B6B8A' : isIncome ? '#4FBF7F' : 'white' }}>
                            {formatAmount(amount)}
                          </p>
                        </div>
                      </div>
                    );
                        })}
                      </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Manual transaction modal */}
        {showManualTx && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setShowManualTx(false); }}>
            <form onSubmit={saveManualTx}
              className="w-full max-w-md flex flex-col gap-5 p-6 rounded-2xl"
              style={{ background: 'rgba(22,22,36,0.98)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>

              {/* Header */}
              <div className="flex items-center justify-between">
                <p className="font-bold text-base">New Transaction</p>
                <button type="button" onClick={() => setShowManualTx(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10"
                  style={{ color: 'var(--color-text-muted)' }}>
                  <CloseIcon />
                </button>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Description</span>
                <input required placeholder="e.g. Grocery run, Coffee…" value={manualTx.name}
                  onChange={(e) => setManualTx((f) => ({ ...f, name: e.target.value }))}
                  className="px-3 py-2.5 text-sm outline-none rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--color-text-primary)' }} />
              </div>

              {/* Amount row */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Amount</span>
                <div className="flex gap-2">
                  {/* Expense / Income toggle */}
                  <div className="flex rounded-xl overflow-hidden shrink-0"
                    style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
                    <button type="button" onClick={() => setManualTx((f) => ({ ...f, sign: '-' }))}
                      className="px-3 py-2.5 text-sm font-semibold transition-colors"
                      style={{ background: manualTx.sign === '-' ? 'rgba(240,122,62,0.2)' : 'transparent',
                               color: manualTx.sign === '-' ? '#F07A3E' : 'var(--color-text-muted)' }}>
                      − Expense
                    </button>
                    <button type="button" onClick={() => setManualTx((f) => ({ ...f, sign: '+' }))}
                      className="px-3 py-2.5 text-sm font-semibold transition-colors"
                      style={{ background: manualTx.sign === '+' ? 'rgba(79,191,127,0.2)' : 'transparent',
                               color: manualTx.sign === '+' ? '#4FBF7F' : 'var(--color-text-muted)',
                               borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
                      + Income
                    </button>
                  </div>
                  <input required type="number" min="0.01" step="0.01" placeholder="0.00"
                    value={manualTx.amountStr}
                    onChange={(e) => setManualTx((f) => ({ ...f, amountStr: e.target.value }))}
                    className="flex-1 px-3 py-2.5 text-sm outline-none rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--color-text-primary)' }} />
                </div>
              </div>

              {/* Date + Account */}
              <div className="flex gap-3">
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Date</span>
                  <input required type="date" value={manualTx.date}
                    onChange={(e) => setManualTx((f) => ({ ...f, date: e.target.value }))}
                    className="px-3 py-2.5 text-sm outline-none rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--color-text-primary)', colorScheme: 'dark' }} />
                </div>
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Account</span>
                  <select required value={manualTx.bankAccountId}
                    onChange={(e) => setManualTx((f) => ({ ...f, bankAccountId: e.target.value }))}
                    className="px-3 py-2.5 text-sm outline-none appearance-none rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: manualTx.bankAccountId ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                    <option value="">Select account…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.bankName} — {a.accountName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Category (optional) */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Category <span className="opacity-50">(optional)</span>
                </span>
                <select value={manualTx.categoryId}
                  onChange={(e) => setManualTx((f) => ({ ...f, categoryId: e.target.value }))}
                  className="px-3 py-2.5 text-sm outline-none appearance-none rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: manualTx.categoryId ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  <option value="">Uncategorized</option>
                  {categories.filter((c) => c.type !== 'transfer').map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => setShowManualTx(false)}
                  className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-white/10"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={manualTxSaving}
                  className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-60"
                  style={{ background: 'var(--color-card-violet)' }}>
                  {manualTxSaving ? 'Saving…' : 'Add Transaction'}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}

        {/* New category from picker */}
        {showNewCatModal && (
          <CategoryFormModal
            onClose={() => { setShowNewCatModal(false); setNewCatForTxId(null); }}
            onSaved={(cat) => {
              setCategories((prev) => [...prev, cat]);
              if (newCatForTxId) assignCategory(newCatForTxId, cat.id);
              setShowNewCatModal(false);
              setNewCatForTxId(null);
            }}
          />
        )}

        {/* CSV Import modal */}
        {importAccount && (
          <CsvImportModal
            accountId={importAccount.id}
            accountName={`${importAccount.bankName} — ${importAccount.accountName}`}
            onClose={() => setImportAccount(null)}
            onImported={() => { setImportAccount(null); loadTransactions(); }}
          />
        )}
      </main>

      {/* ── Drag handle ── */}
      <div
        onMouseDown={startBudgetResize}
        className="w-1.5 shrink-0 cursor-col-resize group relative hover:bg-violet-500/30 transition-colors duration-150"
        style={{ background: 'rgba(255,255,255,0.04)' }}
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 opacity-0 group-hover:opacity-100 rounded-full transition-opacity duration-150"
          style={{ background: 'rgba(155,109,255,0.7)' }} />
      </div>

      {/* ── Budget column ── */}
      <div className="shrink-0 flex flex-col overflow-hidden border-l"
        style={{ width: budgetWidth, minWidth: 180, maxWidth: 480, borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(12,12,22,0.6)' }}>

        <div className="px-4 py-4 border-b shrink-0 flex items-center justify-between gap-2"
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(15,15,26,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>Budget</p>
            <p className="text-sm font-semibold mt-0.5">{monthLabel(budgetMonth)}</p>
          </div>
          <button onClick={toggleNotifications} title={showNotifications ? 'Hide notifications' : 'Show notifications'}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0"
            style={{ background: showNotifications ? 'rgba(155,109,255,0.15)' : 'rgba(255,255,255,0.05)', color: showNotifications ? '#9B6DFF' : 'var(--color-text-muted)' }}>
            <BellIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
          {budgetsLoading ? (
            <p className="text-xs text-center py-10" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : budgets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="text-3xl opacity-40">📊</span>
              <p className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>No budgets set</p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>Go to Budgets to create one</p>
            </div>
          ) : (
            budgets.map((b) => {
              const limit     = Number(b.amount);
              const spent     = Math.abs(Number(b.spent));
              const pct       = limit > 0 ? Math.min(spent / limit, 1) : 0;
              const over      = spent > limit;
              const barColor  = over ? '#FF6B6B' : '#4FBF7F';
              const remaining = limit - spent;
              return (
                <div key={b.id} className="rounded-xl p-3 flex flex-col gap-2"
                  style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${over ? 'rgba(255,107,107,0.18)' : 'rgba(255,255,255,0.06)'}` }}>
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                      style={{ background: `${b.category.color}22` }}>{b.category.icon}</span>
                    <span className="text-xs font-semibold flex-1 truncate">{b.category.name}</span>
                    {over && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                        style={{ background: 'rgba(255,107,107,0.15)', color: '#FF6B6B' }}>Over</span>
                    )}
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct * 100}%`, background: barColor, boxShadow: `0 0 6px ${barColor}60` }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold tabular-nums" style={{ color: over ? '#FF6B6B' : '#4FBF7F' }}>
                      ${spent.toFixed(0)} spent
                    </span>
                    <span className="text-[10px] tabular-nums" style={{ color: over ? '#FF6B6B' : 'var(--color-text-muted)' }}>
                      {over ? `+$${Math.abs(remaining).toFixed(0)} over` : `$${remaining.toFixed(0)} left`}
                    </span>
                    <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                      /${limit.toFixed(0)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Notifications column ── */}
      {showNotifications ? (
        <aside className="hidden 2xl:flex w-64 shrink-0 flex-col border-l"
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(10,10,20,0.5)' }}>
          <div className="px-4 py-4 border-b shrink-0 flex items-center justify-between gap-2"
            style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(15,15,26,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>Notifications</p>
            </div>
            <button onClick={toggleNotifications} title="Hide notifications"
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}>
              <CloseIcon />
            </button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center">
            <span className="text-4xl opacity-20">🔔</span>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)', opacity: 0.4 }}>Coming soon</p>
          </div>
        </aside>
      ) : (
        <div className="hidden 2xl:flex w-8 shrink-0 flex-col items-center border-l"
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(10,10,20,0.5)' }}>
          <button onClick={toggleNotifications} title="Show notifications"
            className="mt-4 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}>
            <BellIcon />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── icons ── */
function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function TagIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
}
function ChevronIcon() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
}
function UploadIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
}
function SyncIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>;
}
function PlusIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function BellIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
function CloseIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
function TrashIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
}
