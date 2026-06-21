'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Sidebar from '@/components/Sidebar';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Category { id: string; name: string; icon: string; color: string; type: string }
interface MonthSummary { month: string; total: number; count: number }
interface BudgetWithSpent {
  id: string; categoryId: string; category: Category; month?: string;
  amount: number; spent: number; percentage: number; remaining: number;
}
interface Transaction {
  id: string; name: string; amount: number; date: string;
  categoryRef: Category | null; bankAccount: { accountName: string; bankName: string } | null;
}

function progressColor(pct: number) {
  if (pct >= 100) return 'var(--color-rose)';
  if (pct >= 80)  return 'var(--color-amber)';
  return 'var(--color-green)';
}
function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
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
function monthFrom(m: string) { return `${m}-01`; }
function monthTo(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).toISOString().slice(0, 10);
}
function fmt(n: number) { return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function BudgetsPage() {
  const [month, setMonth]           = useState(() => new Date().toISOString().slice(0, 7));
  const [budgets, setBudgets]       = useState<BudgetWithSpent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm]             = useState({ categoryId: '', amount: '' });
  const [sort, setSort]             = useState<'pct' | 'spent' | 'name'>('pct');
  const [catDropOpen, setCatDropOpen] = useState(false);
  const [formKind, setFormKind]     = useState<'expense' | 'income'>('expense');

  /* Expanded budget detail */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [budgetTxs, setBudgetTxs]   = useState<Transaction[]>([]);
  const [txLoading, setTxLoading]   = useState(false);

  /* Import plan from another month */
  const [importOpen, setImportOpen]       = useState(false);
  const [importTarget, setImportTarget]   = useState('');
  const [importing, setImporting]         = useState(false);
  const [monthList, setMonthList]         = useState<MonthSummary[]>([]);
  const [loadingMonths, setLoadingMonths] = useState(false);

  /* Set-all-at-once budget table */
  const [setAllOpen, setSetAllOpen]     = useState(false);
  const [setAllRows, setSetAllRows]     = useState<{ categoryId: string; amount: string }[]>([]);
  const [setAllAvgs, setSetAllAvgs]     = useState<Record<string, number>>({});
  const [setAllSaving, setSetAllSaving] = useState(false);

  useEffect(() => {
    if (!importOpen) return;
    setLoadingMonths(true);
    fetch(`${API}/budgets/months`, { credentials: 'include' })
      .then(r => r.json())
      .then((data) => {
        const list: MonthSummary[] = Array.isArray(data) ? data : [];
        setMonthList(list.filter(m => m.month !== month && m.count > 0));
        setImportTarget('');
      })
      .catch(() => setMonthList([]))
      .finally(() => setLoadingMonths(false));
  }, [importOpen, month]);

  async function handleImport() {
    if (!importTarget) return;
    setImporting(true);
    try {
      await fetch(`${API}/budgets/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fromMonth: importTarget, toMonth: month }),
      });
      const fresh = await fetch(`${API}/budgets?month=${month}`, { credentials: 'include' }).then(r => r.json());
      setBudgets(Array.isArray(fresh) ? fresh : []);
      setImportOpen(false);
    } catch { /* ignore */ } finally { setImporting(false); }
  }

  function openSetAll() {
    const expenseCats = categories.filter((c) => c.type !== 'income');
    const byCat = new Map(budgets.map((b) => [b.categoryId, Number(b.amount)]));
    setSetAllRows(expenseCats.map((c) => ({
      categoryId: c.id,
      amount: byCat.has(c.id) ? String(byCat.get(c.id)) : '',
    })));
    setSetAllAvgs({});
    setSetAllOpen(true);
    fetch(`${API}/budgets/category-averages?months=3`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => setSetAllAvgs(d && typeof d === 'object' ? (d as Record<string, number>) : {}))
      .catch(() => {});
  }

  function setRowAmount(categoryId: string, amount: string) {
    setSetAllRows((rows) => rows.map((r) => (r.categoryId === categoryId ? { ...r, amount } : r)));
  }

  function fillAllFromAverage() {
    setSetAllRows((rows) => rows.map((r) => {
      const avg = setAllAvgs[r.categoryId];
      return avg && avg > 0 ? { ...r, amount: String(Math.round(avg)) } : r;
    }));
  }

  async function saveAllBudgets() {
    setSetAllSaving(true);
    try {
      const changed = setAllRows.filter((r) => r.amount.trim() !== '' && !isNaN(parseFloat(r.amount)));
      await Promise.all(changed.map((r) =>
        fetch(`${API}/budgets`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ categoryId: r.categoryId, amount: parseFloat(r.amount), month }),
        }),
      ));
      const fresh = await fetch(`${API}/budgets?month=${month}`, { credentials: 'include' }).then((r) => r.json());
      setBudgets(Array.isArray(fresh) ? fresh : []);
      setSetAllOpen(false);
    } catch { /* ignore */ } finally { setSetAllSaving(false); }
  }

  useEffect(() => {
    setLoading(true);
    // Months are independent; if this month has no budgets yet, the API copies
    // them from the most recent prior month before we fetch.
    fetch(`${API}/budgets/ensure-month`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ month }),
    })
      .catch(() => {})
      .then(() => Promise.all([
        fetch(`${API}/budgets?month=${month}`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/categories`, { credentials: 'include' }).then(r => r.json()),
      ]))
      .then(([b, c]) => {
        setBudgets(Array.isArray(b) ? b : []);
        setCategories(Array.isArray(c) ? c : []);
      }).catch(() => {}).finally(() => setLoading(false));
  }, [month]);

  const expandedBudget = budgets.find(b => b.id === expandedId);

  const loadTxs = useCallback(async () => {
    if (!expandedBudget) return;
    setTxLoading(true);
    try {
      const res = await fetch(`${API}/transactions?from=${monthFrom(month)}&to=${monthTo(month)}&limit=500`, { credentials: 'include' });
      const all: Transaction[] = await res.json();
      setBudgetTxs(Array.isArray(all) ? all.filter(t => t.categoryRef?.id === expandedBudget.categoryId) : []);
    } catch {} finally { setTxLoading(false); }
  }, [expandedBudget, month]);

  useEffect(() => { if (expandedId) loadTxs(); }, [loadTxs, expandedId]);

  /* Derived stats — spending budgets vs income targets */
  const spending     = budgets.filter(b => b.category?.type !== 'income');
  const targets      = budgets.filter(b => b.category?.type === 'income')
    .sort((a, b) => b.percentage - a.percentage);
  const totalBudget  = spending.reduce((s, b) => s + Number(b.amount), 0);
  const totalSpent   = spending.reduce((s, b) => s + Number(b.spent), 0);
  const overBudget   = spending.filter(b => b.percentage >= 100);
  const nearBudget   = spending.filter(b => b.percentage >= 80 && b.percentage < 100);
  const onTrack      = spending.filter(b => b.percentage < 80);
  const overallPct   = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;
  const totalTarget  = targets.reduce((s, b) => s + Number(b.amount), 0);
  const totalEarned  = targets.reduce((s, b) => s + Number(b.spent), 0);
  const earnPct      = totalTarget > 0 ? Math.round((totalEarned / totalTarget) * 100) : 0;
  const plannedNet   = totalTarget - totalBudget;
  const isCurrentMonth = month === new Date().toISOString().slice(0, 7);

  const sorted = [...spending].sort((a, b) => {
    if (sort === 'pct')   return b.percentage - a.percentage;
    if (sort === 'spent') return Number(b.spent) - Number(a.spent);
    return (a.category?.name ?? '').localeCompare(b.category?.name ?? '');
  });

  const usedIds   = new Set(budgets.map(b => b.categoryId));
  const available = categories.filter(c => (formKind === 'income'
    ? c.type === 'income'
    : c.type !== 'transfer' && c.type !== 'income')
    && (!usedIds.has(c.id) || c.id === form.categoryId));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (editingId) {
      await fetch(`${API}/budgets/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ amount: amt }) });
      const prev = budgets.find(b => b.id === editingId);
      const spentAmt = prev?.spent ?? 0;
      setBudgets(bs => bs.map(b => b.id === editingId ? { ...b, amount: amt, percentage: amt > 0 ? Math.round((spentAmt / amt) * 100) : 0, remaining: amt - spentAmt } : b));
    } else {
      const res = await fetch(`${API}/budgets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ categoryId: form.categoryId, amount: amt, month }) });
      const created = await res.json();
      const cat = categories.find(c => c.id === form.categoryId);
      setBudgets(bs => [...bs, { ...created, category: cat ?? created.category, amount: amt, spent: 0, percentage: 0, remaining: amt }]);
    }
    setShowForm(false); setEditingId(null); setForm({ categoryId: '', amount: '' });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`${API}/budgets/${id}`, { method: 'DELETE', credentials: 'include' });
    setBudgets(bs => bs.filter(b => b.id !== id));
    if (expandedId === id) setExpandedId(null);
    setDeletingId(null);
  }

  /* Spend trend for expanded budget */
  const spendTrend = (() => {
    const byDay: Record<string, number> = {};
    budgetTxs.filter(t => Number(t.amount) < 0).forEach(t => {
      byDay[t.date] = (byDay[t.date] || 0) + Math.abs(Number(t.amount));
    });
    return Object.entries(byDay).sort(([a],[b]) => a.localeCompare(b)).map(([date, total]) => ({ date: fmtDate(date), total: +total.toFixed(2) }));
  })();

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">

        {/* ── Sticky header ── */}
        <div className="sticky top-14 md:top-0 z-20 px-6 pt-5 pb-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: 'var(--header-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Budgets &amp; Targets</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Spending limits &amp; income goals by category</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Month nav */}
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
              <button onClick={() => setMonth(prevMonth(month))} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] transition-colors" style={{ color: 'var(--color-text-muted)' }}>‹</button>
              <span className="text-sm font-semibold px-2 min-w-36 text-center">{monthLabel(month)}</span>
              <button onClick={() => setMonth(nextMonth(month))} disabled={isCurrentMonth} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] transition-colors disabled:opacity-30" style={{ color: 'var(--color-text-muted)' }}>›</button>
            </div>
            <button onClick={() => setImportOpen(true)}
              className="px-3 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 hover:bg-[var(--color-elevated)]"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
              Import plan
            </button>
            <button onClick={openSetAll}
              className="px-3 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 hover:bg-[var(--color-elevated)]"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
              </svg>
              Set all
            </button>
            <button onClick={() => { setFormKind('expense'); setShowForm(true); setEditingId(null); setForm({ categoryId: '', amount: '' }); }}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all flex items-center gap-1.5"
              style={{ background: 'var(--color-card-violet)' }}>
              <span className="text-base leading-none">+</span> Add Budget
            </button>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-5">

          {/* ── KPI cards: the month plan at a glance ── */}
          {!loading && budgets.length > 0 && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                { label: 'Expected Income', value: totalTarget > 0 ? `$${fmt(totalTarget)}` : '—',
                  sub: totalTarget > 0 ? `$${fmt(totalEarned)} earned` : 'no targets set',
                  color: 'var(--color-green)', icon: '💵',
                  bar: totalTarget > 0 ? { pct: earnPct, color: earnPct >= 100 ? 'var(--color-green)' : 'var(--color-amber)' } : null },
                { label: 'Total Budget', value: spending.length > 0 ? `$${fmt(totalBudget)}` : '—',
                  sub: spending.length > 0 ? `${spending.length} categor${spending.length === 1 ? 'y' : 'ies'}` : 'no budgets set',
                  color: 'var(--color-card-violet)', icon: '🎯', bar: null },
                { label: 'Total Spent',  value: `$${fmt(totalSpent)}`,  sub: `${Math.round(overallPct)}% of budget used`,
                  color: overallPct >= 100 ? 'var(--color-rose)' : 'var(--color-orange)', icon: '💸',
                  bar: spending.length > 0 ? { pct: overallPct, color: overallPct >= 100 ? 'var(--color-rose)' : overallPct >= 80 ? 'var(--color-amber)' : 'var(--color-orange)' } : null },
                totalTarget > 0
                  ? { label: 'Planned Savings', value: `${plannedNet < 0 ? '−' : '+'}$${fmt(Math.abs(plannedNet))}`,
                      sub: 'expected income − budget',
                      color: plannedNet >= 0 ? 'var(--color-card-sky)' : 'var(--color-rose)', icon: '🏦', bar: null }
                  : { label: 'Health', value: `${onTrack.length}/${spending.length}`,
                      sub: `${overBudget.length} over · ${nearBudget.length} near limit`,
                      color: overBudget.length > 0 ? 'var(--color-rose)' : nearBudget.length > 0 ? 'var(--color-amber)' : 'var(--color-green)',
                      icon: overBudget.length > 0 ? '⚠️' : '✅', bar: null },
              ].map(s => (
                <div key={s.label} className="p-4 rounded-2xl flex flex-col gap-1.5 relative overflow-hidden"
                  style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: s.color }}>{s.label}</span>
                    <span className="text-base">{s.icon}</span>
                  </div>
                  <span className="text-xl font-extrabold leading-none tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{s.value}</span>
                  <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{s.sub}</span>
                  {s.bar && (
                    <div className="h-1 rounded-full overflow-hidden mt-0.5" style={{ background: 'var(--color-border)' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(s.bar.pct, 100)}%`, background: s.bar.color }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Overall progress bar ── */}
          {!loading && spending.length > 0 && (
            <div className="p-4 rounded-2xl flex flex-col gap-2.5"
              style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Overall Spending</span>
                <div className="flex items-center gap-3">
                  <span className="font-bold tabular-nums" style={{ color: progressColor(overallPct) }}>{Math.round(overallPct)}%</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>${fmt(totalSpent)} of ${fmt(totalBudget)}</span>
                </div>
              </div>
              {/* Segmented bar */}
              <div className="h-2.5 rounded-full overflow-hidden flex gap-px" style={{ background: 'var(--color-border)' }}>
                {sorted.filter(b => Number(b.spent) > 0).map(b => (
                  <div key={b.id} className="h-full transition-all duration-700"
                    style={{ width: `${totalBudget > 0 ? Number(b.spent)/totalBudget*100 : 0}%`, background: b.category?.color ?? 'var(--color-card-violet)', minWidth: 3 }} />
                ))}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 flex-wrap">
                <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--color-green)' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-green)' }} /> {onTrack.length} on track
                </span>
                {nearBudget.length > 0 && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--color-amber)' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-amber)' }} /> {nearBudget.length} near limit
                  </span>
                )}
                {overBudget.length > 0 && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--color-rose)' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-rose)' }} /> {overBudget.length} over budget
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Budgets + Targets columns ── */}
          <div className="grid lg:grid-cols-2 gap-5 items-start">

          {/* ── Budgets column ── */}
          <div className="flex flex-col gap-5 min-w-0">
          {loading ? (
            <p className="text-xs text-center py-12" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : spending.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-4 text-center rounded-2xl"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <span className="text-5xl opacity-30">🎯</span>
              <div>
                <p className="font-semibold text-base">No budgets yet</p>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Set monthly spending limits to stay on track.</p>
              </div>
              <button onClick={() => setShowForm(true)} className="mt-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl hover:brightness-110" style={{ background: 'var(--color-card-violet)' }}>
                + Add Your First Budget
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Sort controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-card-violet)' }}>Spending Budgets</span>
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums"
                    style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    {spending.length}
                  </span>
                </div>
                <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                  {([['pct','% Usage'],['spent','Amount'],['name','A–Z']] as const).map(([k,l]) => (
                    <button key={k} onClick={() => setSort(k)}
                      className="px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors"
                      style={sort === k
                        ? { background: 'var(--color-card-violet)', color: 'white' }
                        : { color: 'var(--color-text-muted)' }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Budget cards */}
              {sorted.map(b => {
                const pct      = b.percentage;
                const catColor = b.category?.color ?? '#818CF8';
                const spent    = Number(b.spent);
                const amount   = Number(b.amount);
                const remaining = amount - spent;
                const isExpanded = expandedId === b.id;

                return (
                  <div key={b.id} className="rounded-2xl overflow-hidden transition-all"
                    style={{
                      background: 'var(--color-surface)',
                      backdropFilter: 'var(--glass-blur)',
                      WebkitBackdropFilter: 'var(--glass-blur)',
                      border: isExpanded ? `1px solid ${catColor}50` : '1px solid var(--color-border)',
                      boxShadow: isExpanded ? `0 0 0 1px ${catColor}20, var(--glass-shadow)` : 'none',
                    }}>

                    {/* Card row */}
                    <div role="button" tabIndex={0} aria-expanded={isExpanded}
                      className="w-full text-left p-5 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : b.id)}
                      onKeyDown={e => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setExpandedId(isExpanded ? null : b.id);
                        }
                      }}>

                      <div className="flex items-center gap-4">
                        {/* Icon */}
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                          style={{ background: `${catColor}20`, border: `1px solid ${catColor}30` }}>
                          {b.category?.icon ?? '📦'}
                        </div>

                        {/* Name + meta */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{b.category?.name ?? 'Unknown'}</p>
                            {pct >= 100 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: 'color-mix(in srgb, var(--color-rose) 15%, transparent)', color: 'var(--color-rose)' }}>
                                OVER BUDGET
                              </span>
                            )}
                            {pct >= 80 && pct < 100 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: 'color-mix(in srgb, var(--color-amber) 15%, transparent)', color: 'var(--color-amber)' }}>
                                NEAR LIMIT
                              </span>
                            )}
                          </div>
                          {/* Progress bar */}
                          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${Math.min(pct, 100)}%`, background: progressColor(pct) }} />
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="hidden sm:flex items-center gap-6 shrink-0 text-right">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Spent</p>
                            <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color: progressColor(pct) }}>${fmt(spent)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Budget</p>
                            <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color: 'var(--color-text-primary)' }}>${fmt(amount)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Remaining</p>
                            <p className="text-sm font-bold tabular-nums mt-0.5"
                              style={{ color: remaining < 0 ? 'var(--color-rose)' : 'var(--color-green)' }}>
                              {remaining < 0 ? '−' : '+'}${fmt(Math.abs(remaining))}
                            </p>
                          </div>
                          <div className="w-14">
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Usage</p>
                            <p className="text-lg font-black tabular-nums mt-0.5" style={{ color: progressColor(pct) }}>{pct}%</p>
                          </div>
                        </div>

                        {/* Edit/delete + chevron */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={e => { e.stopPropagation(); setFormKind('expense'); setEditingId(b.id); setForm({ categoryId: b.categoryId, amount: String(b.amount) }); setShowForm(true); }}
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] transition-colors text-xs"
                            style={{ color: 'var(--color-text-muted)' }}>✏️</button>
                          <button type="button" onClick={e => { e.stopPropagation(); handleDelete(b.id); }} disabled={deletingId === b.id}
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/20 transition-colors text-xs disabled:opacity-40"
                            style={{ color: 'var(--color-text-muted)' }}>{deletingId === b.id ? '…' : '🗑️'}</button>
                          <div className="w-6 h-6 flex items-center justify-center transition-transform duration-200"
                            style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', color: 'var(--color-text-muted)' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="6 9 12 15 18 9"/>
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ── Expanded: transaction detail ── */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid var(--color-border)' }}>

                        {/* Trend chart + stats */}
                        {txLoading ? (
                          <p className="text-xs p-4 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading transactions…</p>
                        ) : budgetTxs.length === 0 ? (
                          <div className="p-6 text-center">
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No {b.category?.name} transactions this month.</p>
                          </div>
                        ) : (
                          <>
                            {/* Mini header */}
                            <div className="px-5 py-3 flex items-center gap-6"
                              style={{ background: `linear-gradient(135deg, ${catColor}08 0%, transparent 100%)`, borderBottom: '1px solid var(--color-border)' }}>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Transactions</p>
                                <p className="text-lg font-black" style={{ color: catColor }}>{budgetTxs.length}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Total Spent</p>
                                <p className="text-lg font-black" style={{ color: 'var(--color-orange)' }}>
                                  ${fmt(budgetTxs.filter(t => Number(t.amount) < 0).reduce((s,t) => s + Math.abs(Number(t.amount)), 0))}
                                </p>
                              </div>
                              {spendTrend.length > 1 && (
                                <div className="flex-1 h-12">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={spendTrend}>
                                      <defs>
                                        <linearGradient id={`grad-${b.id}`} x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%"  stopColor={catColor} stopOpacity={0.3}/>
                                          <stop offset="95%" stopColor={catColor} stopOpacity={0}/>
                                        </linearGradient>
                                      </defs>
                                      <XAxis dataKey="date" hide />
                                      <Tooltip
                                        contentStyle={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text-primary)' }}
                                        formatter={(v: unknown) => [`$${fmt(Number(v))}`, 'Spent']} />
                                      <Area type="monotone" dataKey="total" stroke={catColor} strokeWidth={2} fill={`url(#grad-${b.id})`} dot={false} />
                                    </AreaChart>
                                  </ResponsiveContainer>
                                </div>
                              )}
                            </div>

                            {/* Transaction rows */}
                            <div className="flex flex-col max-h-64 overflow-y-auto">
                              {[...budgetTxs].sort((a, b) => b.date.localeCompare(a.date)).map((tx, i) => {
                                const amt   = Number(tx.amount);
                                const isInc = amt >= 0;
                                return (
                                  <div key={tx.id} className="flex items-center gap-3 px-5 py-3"
                                    style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : {}}>
                                    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0"
                                      style={{ background: `${catColor}18` }}>
                                      {b.category?.icon ?? '📦'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold truncate">{tx.name}</p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{fmtDate(tx.date)}</span>
                                        {tx.bankAccount && <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>· {tx.bankAccount.accountName}</span>}
                                      </div>
                                    </div>
                                    <span className="text-sm font-bold tabular-nums shrink-0"
                                      style={{ color: isInc ? 'var(--color-green)' : 'var(--color-text-primary)' }}>
                                      {isInc ? '+' : '−'}${fmt(Math.abs(amt))}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </div>{/* end budgets column */}

          {/* ── Targets column ── */}
          <div className="flex flex-col gap-3 order-first lg:order-none">
            {!loading && (
              <>
                <div className="flex items-center justify-between gap-2 min-h-[30px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-green)' }}>Income Targets</span>
                    {targets.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums"
                        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                        {targets.length}
                      </span>
                    )}
                  </div>
                  {targets.length > 0 && (
                    <button type="button"
                      onClick={() => { setFormKind('income'); setShowForm(true); setEditingId(null); setForm({ categoryId: '', amount: '' }); }}
                      className="px-3 py-1.5 text-[11px] font-semibold rounded-xl hover:brightness-110 transition-all text-white flex items-center gap-1"
                      style={{ background: 'var(--color-green)' }}>
                      <span className="text-sm leading-none">+</span> Add Target
                    </button>
                  )}
                </div>

                {targets.length === 0 ? (
                  <div className="px-6 py-8 rounded-2xl flex flex-col items-center text-center gap-3"
                    style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px dashed var(--color-border)' }}>
                    <span className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                      style={{
                        background: 'color-mix(in srgb, var(--color-green) 12%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--color-green) 30%, transparent)',
                      }}>💵</span>
                    <div>
                      <p className="text-sm font-semibold">No income targets yet</p>
                      <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                        Forecast what each income category should bring in, and watch it fill as the month unfolds.
                      </p>
                    </div>
                    <button type="button"
                      onClick={() => { setFormKind('income'); setShowForm(true); setEditingId(null); setForm({ categoryId: '', amount: '' }); }}
                      className="mt-1 px-4 py-2 text-xs font-semibold text-white rounded-xl hover:brightness-110 transition-all"
                      style={{ background: 'var(--color-green)' }}>
                      + Set your first target
                    </button>
                  </div>
                ) : targets.map(t => {
                  const earned  = Number(t.spent);
                  const goal    = Number(t.amount);
                  const pct     = t.percentage;
                  const reached = pct >= 100;
                  const tColor  = t.category?.color ?? 'var(--color-green)';
                  return (
                    <div key={t.id} className="p-4 rounded-2xl flex flex-col gap-2.5 relative overflow-hidden"
                      style={{
                        background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
                        border: reached ? '1px solid color-mix(in srgb, var(--color-green) 35%, transparent)' : '1px solid var(--color-border)',
                      }}>
                      <span className="absolute top-0 left-4 w-10 h-0.5 pointer-events-none"
                        style={{ background: reached ? 'var(--color-green)' : tColor, opacity: 0.9 }} />
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                            style={{ background: `${tColor}20`, border: `1px solid ${tColor}30` }}>
                            {t.category?.icon ?? '💼'}
                          </span>
                          <span className="text-sm font-semibold truncate">{t.category?.name ?? 'Unknown'}</span>
                          {reached && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0"
                              style={{ background: 'color-mix(in srgb, var(--color-green) 15%, transparent)', color: 'var(--color-green)' }}>
                              GOAL MET
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button type="button"
                            onClick={() => { setFormKind('income'); setEditingId(t.id); setForm({ categoryId: t.categoryId, amount: String(t.amount) }); setShowForm(true); }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] transition-colors text-xs"
                            style={{ color: 'var(--color-text-muted)' }}>✏️</button>
                          <button type="button" onClick={() => handleDelete(t.id)} disabled={deletingId === t.id}
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/20 transition-colors text-xs disabled:opacity-40"
                            style={{ color: 'var(--color-text-muted)' }}>{deletingId === t.id ? '…' : '🗑️'}</button>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-lg font-extrabold leading-none tabular-nums"
                          style={{ color: reached ? 'var(--color-green)' : 'var(--color-text-primary)' }}>${fmt(earned)}</span>
                        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>of ${fmt(goal)} expected</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(pct, 100)}%`, background: reached ? 'var(--color-green)' : tColor }} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold" style={{ color: reached ? 'var(--color-green)' : 'var(--color-text-muted)' }}>
                          {reached ? `+$${fmt(earned - goal)} above goal` : `$${fmt(goal - earned)} to go`}
                        </span>
                        <span className="text-[10px] font-bold tabular-nums" style={{ color: reached ? 'var(--color-green)' : 'var(--color-text-secondary)' }}>{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>{/* end targets column */}

          </div>{/* end columns grid */}
        </div>

        {/* ── Add / Edit modal ── */}
        {showForm && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null); setCatDropOpen(false); } }}>
            {(() => {
              const selCat = categories.find(c => c.id === form.categoryId);
              const accent = selCat?.color ?? 'var(--color-card-violet)';
              const accentHex = selCat?.color ?? '#818CF8';
              const amt    = parseFloat(form.amount) || 0;
              return (
                <form onSubmit={handleSubmit}
                  className="w-full max-w-sm flex flex-col rounded-2xl"
                  style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)' }}>

                  {/* Form header */}
                  <div className="px-5 py-4 flex items-center justify-between gap-3 rounded-t-2xl"
                    style={{ borderBottom: '1px solid var(--color-border)', background: `linear-gradient(135deg, ${accentHex}12 0%, transparent 60%)` }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${accentHex}22` }}>
                        {selCat?.icon ?? '🎯'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm">{selCat?.name ?? (editingId
                          ? (formKind === 'income' ? 'Edit Income Target' : 'Edit Budget')
                          : (formKind === 'income' ? 'New Income Target' : 'New Budget'))}</p>
                        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                          {amt > 0 ? `$${amt.toLocaleString()} / month` : monthLabel(month)}
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setCatDropOpen(false); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] shrink-0"
                      style={{ color: 'var(--color-text-muted)' }}>✕</button>
                  </div>

                  <div className="flex flex-col gap-4 px-5 py-4">
                    {/* Category picker */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Category</span>
                      <div style={{ position: 'relative' }}>
                        <button type="button" disabled={!!editingId} onClick={() => setCatDropOpen(o => !o)}
                          className="w-full px-3 py-2.5 text-sm flex items-center gap-2.5 rounded-xl outline-none text-left disabled:opacity-60"
                          style={{ background: 'var(--color-surface)', border: `1px solid ${selCat ? accentHex + '44' : 'var(--color-border)'}`, color: selCat ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                          {selCat ? (
                            <><span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${accentHex}20` }}>{selCat.icon}</span>
                            <span className="flex-1 font-medium" style={{ color: accentHex }}>{selCat.name}</span></>
                          ) : <span className="flex-1">Select a category…</span>}
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0, transform: catDropOpen ? 'rotate(180deg)' : undefined }}>
                            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        {catDropOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden overflow-y-auto"
                            style={{ background: 'var(--popover-bg)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)', zIndex: 10, maxHeight: '50vh' }}>
                            {available.map(c => (
                              <button key={c.id} type="button"
                                onClick={() => { setForm(f => ({ ...f, categoryId: c.id })); setCatDropOpen(false); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                style={{ background: form.categoryId === c.id ? `${c.color}18` : 'transparent', color: form.categoryId === c.id ? c.color : 'var(--color-text-primary)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = `${c.color}12`)}
                                onMouseLeave={e => (e.currentTarget.style.background = form.categoryId === c.id ? `${c.color}18` : 'transparent')}>
                                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${c.color}20` }}>{c.icon}</span>
                                <span className="font-medium">{c.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                        {formKind === 'income' ? 'Expected Income' : 'Monthly Limit'}
                      </span>
                      <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${amt > 0 ? accentHex + '55' : 'var(--color-border)'}` }}>
                        <span className="flex items-center px-3 text-sm font-semibold shrink-0"
                          style={{ background: 'var(--color-surface)', color: amt > 0 ? accentHex : 'var(--color-text-muted)', borderRight: '1px solid var(--color-border)' }}>$</span>
                        <input required type="number" step="0.01" min="1" placeholder="0.00" autoFocus={!!editingId}
                          value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                          className="flex-1 px-3 py-2.5 text-sm outline-none font-semibold"
                          style={{ background: 'var(--color-elevated)', color: 'var(--color-text-primary)' }} />
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[100,250,500,1000].map(q => (
                          <button key={q} type="button" onClick={() => setForm(f => ({ ...f, amount: String(q) }))}
                            className="py-1.5 rounded-lg text-xs font-semibold transition-all"
                            style={{
                              background: Number(form.amount) === q ? `${accentHex}22` : 'var(--color-surface)',
                              border: `1px solid ${Number(form.amount) === q ? accentHex + '44' : 'var(--color-border)'}`,
                              color: Number(form.amount) === q ? accentHex : 'var(--color-text-muted)',
                            }}>
                            ${q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setCatDropOpen(false); }}
                      className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)] transition-colors"
                      style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
                    <button type="submit"
                      className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all"
                      style={{ background: accent }}>
                      {editingId ? 'Save Changes' : (formKind === 'income' ? 'Create Target' : 'Create Budget')}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>,
          document.body
        )}

        {/* ── Import plan modal ── */}
        {importOpen && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setImportOpen(false); }}>
            <div className="w-full max-w-sm flex flex-col rounded-2xl"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)' }}>

              {/* Header */}
              <div className="px-5 py-4 flex items-center justify-between gap-3"
                style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div>
                  <p className="font-bold text-sm">Import budget plan</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    Pick a month to copy into <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{monthLabel(month)}</span> — replaces existing budgets.
                  </p>
                </div>
                <button type="button" onClick={() => setImportOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-surface)] shrink-0"
                  style={{ color: 'var(--color-text-muted)' }}>✕</button>
              </div>

              {/* Month list */}
              <div className="px-5 py-4 flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                {loadingMonths ? (
                  <p className="text-xs text-center py-6" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
                ) : monthList.length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: 'var(--color-text-muted)' }}>No other months with budgets found.</p>
                ) : monthList.map(m => {
                  const isSelected = importTarget === m.month;
                  return (
                    <button key={m.month} type="button" onClick={() => setImportTarget(m.month)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-all"
                      style={isSelected
                        ? { background: 'color-mix(in srgb, var(--color-card-violet) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 45%, transparent)' }
                        : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', cursor: 'pointer' }}>
                      <div className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
                        style={{ border: isSelected ? '2px solid var(--color-card-violet)' : '2px solid var(--color-border)', background: isSelected ? 'var(--color-card-violet)' : 'transparent' }}>
                        {isSelected && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: isSelected ? 'var(--color-card-violet)' : 'var(--color-text-primary)' }}>
                          {monthLabel(m.month)}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          {m.count} budget{m.count !== 1 ? 's' : ''} set
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums shrink-0"
                        style={{ color: isSelected ? 'var(--color-card-violet)' : 'var(--color-text-primary)' }}>
                        ${fmt(m.total)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button type="button" onClick={() => setImportOpen(false)}
                  className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-surface)] transition-colors"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
                <button type="button" onClick={handleImport} disabled={importing || !importTarget}
                  className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all disabled:opacity-40"
                  style={{ background: 'var(--color-card-violet)' }}>
                  {importing ? 'Importing…' : 'Import plan'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* ── Set-all budgets modal ── */}
        {setAllOpen && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget && !setAllSaving) setSetAllOpen(false); }}>
            <div className="w-full max-w-2xl flex flex-col rounded-2xl overflow-hidden"
              style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', maxHeight: '88vh' }}>

              {/* Header */}
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>Set monthly budgets</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {monthLabel(month)} · set every category at once. “Avg” is your typical spend over the last 3 months.
                </p>
              </div>

              {/* Toolbar */}
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <button type="button" onClick={fillAllFromAverage}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all hover:brightness-110 flex items-center gap-1.5"
                  style={{ background: 'color-mix(in srgb, var(--color-card-violet) 16%, transparent)', color: 'var(--color-card-violet)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 30%, transparent)' }}>
                  ✨ Fill all from average
                </button>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Budgeted&nbsp;
                  <strong className="tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                    ${fmt(setAllRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0))}
                  </strong>
                </span>
              </div>

              {/* Rows */}
              <div className="overflow-y-auto px-2 py-2" style={{ flex: 1 }}>
                {setAllRows.length === 0 ? (
                  <p className="text-xs text-center py-10" style={{ color: 'var(--color-text-muted)' }}>
                    No expense categories yet. Create categories first in Settings.
                  </p>
                ) : setAllRows.map((row) => {
                  const cat = categories.find((c) => c.id === row.categoryId);
                  const avg = setAllAvgs[row.categoryId];
                  const c   = cat?.color || 'var(--color-card-violet)';
                  return (
                    <div key={row.categoryId} className="flex items-center gap-3 px-3 py-2 rounded-xl transition-colors hover:bg-[var(--color-surface)]">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                        style={{ background: `color-mix(in srgb, ${c} 18%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)` }}>
                        {cat?.icon || '📁'}
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {cat?.name || 'Category'}
                      </span>
                      <button type="button"
                        onClick={() => { if (avg && avg > 0) setRowAmount(row.categoryId, String(Math.round(avg))); }}
                        disabled={!avg || avg <= 0}
                        title={avg && avg > 0 ? 'Use this average' : 'No recent spending'}
                        className="text-[11px] tabular-nums px-2 py-1 rounded-md transition-colors disabled:cursor-default hover:bg-[var(--color-elevated)]"
                        style={{ color: 'var(--color-text-muted)' }}>
                        {avg != null && avg > 0 ? `avg $${fmt(avg)}` : '—'}
                      </button>
                      <div className="flex items-center gap-1 shrink-0 px-2 rounded-lg"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>$</span>
                        <input value={row.amount} inputMode="decimal" placeholder="0"
                          onChange={(e) => setRowAmount(row.categoryId, e.target.value.replace(/[^0-9.]/g, ''))}
                          className="w-20 py-1.5 text-sm text-right tabular-nums bg-transparent outline-none"
                          style={{ color: 'var(--color-text-primary)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button type="button" onClick={() => setSetAllOpen(false)} disabled={setAllSaving}
                  className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-surface)] transition-colors disabled:opacity-50"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
                <button type="button" onClick={saveAllBudgets} disabled={setAllSaving}
                  className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all disabled:opacity-50"
                  style={{ background: 'var(--color-card-violet)' }}>
                  {setAllSaving ? 'Saving…' : 'Save all'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </main>
    </div>
  );
}
