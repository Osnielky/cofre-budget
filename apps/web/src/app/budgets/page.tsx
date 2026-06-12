'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Sidebar from '@/components/Sidebar';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Category { id: string; name: string; icon: string; color: string; type: string }
interface BudgetWithSpent {
  id: string; categoryId: string; category: Category;
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

  /* Expanded budget detail */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [budgetTxs, setBudgetTxs]   = useState<Transaction[]>([]);
  const [txLoading, setTxLoading]   = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API}/budgets?month=${month}`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${API}/categories`, { credentials: 'include' }).then(r => r.json()),
    ]).then(([b, c]) => {
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

  /* Derived stats */
  const totalBudget  = budgets.reduce((s, b) => s + Number(b.amount), 0);
  const totalSpent   = budgets.reduce((s, b) => s + Number(b.spent), 0);
  const overBudget   = budgets.filter(b => b.percentage >= 100);
  const nearBudget   = budgets.filter(b => b.percentage >= 80 && b.percentage < 100);
  const onTrack      = budgets.filter(b => b.percentage < 80);
  const overallPct   = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;
  const isCurrentMonth = month === new Date().toISOString().slice(0, 7);

  const sorted = [...budgets].sort((a, b) => {
    if (sort === 'pct')   return b.percentage - a.percentage;
    if (sort === 'spent') return Number(b.spent) - Number(a.spent);
    return (a.category?.name ?? '').localeCompare(b.category?.name ?? '');
  });

  const usedIds   = new Set(budgets.map(b => b.categoryId));
  const available = categories.filter(c => c.type !== 'transfer' && c.type !== 'income' && (!usedIds.has(c.id) || c.id === form.categoryId));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (editingId) {
      await fetch(`${API}/budgets/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ amount: amt }) });
      const prev = budgets.find(b => b.id === editingId);
      const spentAmt = prev?.spent ?? 0;
      setBudgets(bs => bs.map(b => b.id === editingId ? { ...b, amount: amt, percentage: amt > 0 ? Math.round((spentAmt / amt) * 100) : 0, remaining: amt - spentAmt } : b));
    } else {
      const res = await fetch(`${API}/budgets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ categoryId: form.categoryId, amount: amt }) });
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
      <main className="flex-1 overflow-y-auto">

        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-20 px-6 pt-5 pb-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: 'var(--header-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Budgets</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Spending limits by category</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Month nav */}
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
              <button onClick={() => setMonth(prevMonth(month))} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] transition-colors" style={{ color: 'var(--color-text-muted)' }}>‹</button>
              <span className="text-sm font-semibold px-2 min-w-36 text-center">{monthLabel(month)}</span>
              <button onClick={() => setMonth(nextMonth(month))} disabled={isCurrentMonth} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] transition-colors disabled:opacity-30" style={{ color: 'var(--color-text-muted)' }}>›</button>
            </div>
            <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ categoryId: '', amount: '' }); }}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all flex items-center gap-1.5"
              style={{ background: 'var(--color-card-violet)' }}>
              <span className="text-base leading-none">+</span> Add Budget
            </button>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-5">

          {/* ── KPI cards ── */}
          {!loading && budgets.length > 0 && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                { label: 'Total Budget', value: `$${fmt(totalBudget)}`, sub: `${budgets.length} categories`, color: 'var(--color-card-violet)', icon: '🎯' },
                { label: 'Total Spent',  value: `$${fmt(totalSpent)}`,  sub: `${Math.round(overallPct)}% used`, color: overallPct >= 100 ? 'var(--color-rose)' : 'var(--color-orange)', icon: '💸' },
                { label: 'Remaining',    value: `${totalBudget - totalSpent < 0 ? '−' : '+'}$${fmt(Math.abs(totalBudget - totalSpent))}`, sub: totalBudget - totalSpent >= 0 ? 'available' : 'over budget', color: totalBudget - totalSpent < 0 ? 'var(--color-rose)' : 'var(--color-green)', icon: '💰' },
                { label: 'Health',       value: `${onTrack.length}/${budgets.length}`, sub: `${overBudget.length} over · ${nearBudget.length} near limit`, color: overBudget.length > 0 ? 'var(--color-rose)' : nearBudget.length > 0 ? 'var(--color-amber)' : 'var(--color-green)', icon: overBudget.length > 0 ? '⚠️' : '✅' },
              ].map(s => (
                <div key={s.label} className="p-4 rounded-2xl flex flex-col gap-1.5 relative overflow-hidden"
                  style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: s.color }}>{s.label}</span>
                    <span className="text-base">{s.icon}</span>
                  </div>
                  <span className="text-xl font-extrabold leading-none tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{s.value}</span>
                  <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{s.sub}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Overall progress bar ── */}
          {!loading && budgets.length > 0 && (
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

          {/* ── Budget list ── */}
          {loading ? (
            <p className="text-xs text-center py-12" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : budgets.length === 0 ? (
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
                <p className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>{budgets.length} budget{budgets.length !== 1 ? 's' : ''}</p>
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
                    <button type="button" className="w-full text-left p-5"
                      onClick={() => setExpandedId(isExpanded ? null : b.id)}>

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
                          <button type="button" onClick={e => { e.stopPropagation(); setEditingId(b.id); setForm({ categoryId: b.categoryId, amount: String(b.amount) }); setShowForm(true); }}
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
                    </button>

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
                  className="w-full max-w-sm flex flex-col rounded-2xl overflow-hidden"
                  style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)' }}>

                  {/* Form header */}
                  <div className="px-5 py-4 flex items-center justify-between gap-3"
                    style={{ borderBottom: '1px solid var(--color-border)', background: `linear-gradient(135deg, ${accentHex}12 0%, transparent 60%)` }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${accentHex}22` }}>
                        {selCat?.icon ?? '🎯'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm">{selCat?.name ?? (editingId ? 'Edit Budget' : 'New Budget')}</p>
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
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Monthly Limit</span>
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
                      {editingId ? 'Save Changes' : 'Create Budget'}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>,
          document.body
        )}
      </main>
    </div>
  );
}
