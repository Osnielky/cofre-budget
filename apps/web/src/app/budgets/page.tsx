'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Sidebar from '@/components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Category { id: string; name: string; icon: string; color: string; type: string }
interface BudgetWithSpent {
  id: string; categoryId: string; category: Category;
  amount: number; spent: number; percentage: number; remaining: number;
}

const glass: React.CSSProperties = {
  background: 'rgba(35,35,47,0.50)', backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
};

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
function progressColor(pct: number) {
  if (pct >= 100) return '#FF4444';
  if (pct >= 80)  return '#F07A3E';
  if (pct >= 60)  return '#F5C842';
  return '#4FBF7F';
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

export default function BudgetsPage() {
  const [month, setMonth]       = useState(() => new Date().toISOString().slice(0, 7));
  const [budgets, setBudgets]   = useState<BudgetWithSpent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm]         = useState({ categoryId: '', amount: '' });
  const [sort, setSort]         = useState<'pct' | 'spent' | 'name'>('pct');
  const [catDropOpen, setCatDropOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API}/budgets?month=${month}`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API}/categories`, { credentials: 'include' }).then((r) => r.json()),
    ]).then(([b, c]) => { setBudgets(Array.isArray(b) ? b : []); setCategories(Array.isArray(c) ? c : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [month]);

  const usedIds = new Set(budgets.map((b) => b.categoryId));
  const available = categories.filter(
    (c) => c.type !== 'transfer' && c.type !== 'income' &&
           (!usedIds.has(c.id) || c.id === form.categoryId),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (editingId) {
      await fetch(`${API}/budgets/${editingId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ amount: amt }),
      });
      const prev = budgets.find((b) => b.id === editingId);
      const spentAmt = prev?.spent ?? 0;
      setBudgets((bs) => bs.map((b) => b.id === editingId
        ? { ...b, amount: amt, percentage: amt > 0 ? Math.round((spentAmt / amt) * 100) : 0, remaining: amt - spentAmt }
        : b,
      ));
    } else {
      const res = await fetch(`${API}/budgets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ categoryId: form.categoryId, amount: amt }),
      });
      const created = await res.json();
      const cat = categories.find((c) => c.id === form.categoryId);
      setBudgets((bs) => [...bs, { ...created, category: cat ?? created.category, amount: amt, spent: 0, percentage: 0, remaining: amt }]);
    }
    setShowForm(false); setEditingId(null); setForm({ categoryId: '', amount: '' });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`${API}/budgets/${id}`, { method: 'DELETE', credentials: 'include' });
    setBudgets((bs) => bs.filter((b) => b.id !== id));
    setDeletingId(null);
  }

  function startEdit(b: BudgetWithSpent) {
    setEditingId(b.id); setForm({ categoryId: b.categoryId, amount: String(b.amount) }); setShowForm(true);
  }

  /* ── derived stats ── */
  const totalBudget   = budgets.reduce((s, b) => s + Number(b.amount), 0);
  const totalSpent    = budgets.reduce((s, b) => s + Number(b.spent), 0);
  const totalRemaining = totalBudget - totalSpent;
  const overBudget    = budgets.filter((b) => b.percentage >= 100);
  const nearBudget    = budgets.filter((b) => b.percentage >= 80 && b.percentage < 100);
  const onTrack       = budgets.filter((b) => b.percentage < 80);
  const avgPct        = budgets.length > 0 ? Math.round(budgets.reduce((s, b) => s + b.percentage, 0) / budgets.length) : 0;
  const biggestSpend  = [...budgets].sort((a, b) => Number(b.spent) - Number(a.spent))[0];
  const overallPct    = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;

  const sorted = [...budgets].sort((a, b) => {
    if (sort === 'pct')   return b.percentage - a.percentage;
    if (sort === 'spent') return Number(b.spent) - Number(a.spent);
    return (a.category?.name ?? '').localeCompare(b.category?.name ?? '');
  });

  const isCurrentMonth = month === new Date().toISOString().slice(0, 7);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">

        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-20 px-6 pt-5 pb-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: 'rgba(15,15,26,0.88)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Budgets</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Spending limits by category
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Month nav */}
            <div className="flex items-center gap-1 p-1 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <button onClick={() => setMonth(prevMonth(month))}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors text-sm"
                style={{ color: 'var(--color-text-muted)' }}>‹</button>
              <span className="text-sm font-semibold px-2 min-w-36 text-center">{monthLabel(month)}</span>
              <button onClick={() => setMonth(nextMonth(month))} disabled={isCurrentMonth}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors text-sm disabled:opacity-30"
                style={{ color: 'var(--color-text-muted)' }}>›</button>
            </div>
            <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ categoryId: '', amount: '' }); }}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all hover:brightness-110"
              style={{ background: 'var(--color-card-violet)' }}>
              + Add Budget
            </button>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-5">

          {/* ── Stats ── */}
          {!loading && budgets.length > 0 && (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                  { label: 'TOTAL BUDGET',   value: `$${totalBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,    accent: '#9B6DFF', icon: '🎯', sub: `${budgets.length} categories` },
                  { label: 'TOTAL SPENT',    value: `$${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,     accent: totalSpent > totalBudget ? '#FF4444' : '#F07A3E', icon: '💸', sub: `${Math.round(overallPct)}% of budget` },
                  { label: 'REMAINING',      value: `$${Math.abs(totalRemaining).toLocaleString('en-US', { minimumFractionDigits: 2 })}${totalRemaining < 0 ? ' over' : ''}`, accent: totalRemaining < 0 ? '#FF4444' : '#4FBF7F', icon: '💰', sub: totalRemaining >= 0 ? 'available to spend' : 'exceeded budget' },
                  { label: 'AVG USAGE',      value: `${avgPct}%`, accent: avgPct >= 100 ? '#FF4444' : avgPct >= 80 ? '#F07A3E' : '#F5C842', icon: '📊', sub: `${overBudget.length} over · ${nearBudget.length} near limit` },
                ].map((s) => (
                  <div key={s.label} className="p-5 flex flex-col gap-2 relative overflow-hidden rounded-2xl"
                    style={{ background: `rgba(${hexToRgb(s.accent)},0.10)`, border: `1px solid rgba(${hexToRgb(s.accent)},0.22)`, boxShadow: `0 4px 24px rgba(${hexToRgb(s.accent)},0.08)` }}>
                    <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full pointer-events-none"
                      style={{ background: s.accent, opacity: 0.10, filter: 'blur(24px)' }} />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: s.accent }}>{s.label}</span>
                      <span className="text-xl">{s.icon}</span>
                    </div>
                    <span className="text-2xl font-extrabold text-white leading-none">{s.value}</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.sub}</span>
                  </div>
                ))}
              </div>

              {/* Overall progress bar + health summary */}
              <div className="p-5 rounded-2xl flex flex-col gap-4" style={glass}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="font-bold text-sm">Overall Budget Health</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{monthLabel(month)}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-semibold flex-wrap">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                      style={{ background: 'rgba(79,191,127,0.10)', color: '#4FBF7F' }}>
                      ✓ {onTrack.length} on track
                    </span>
                    {nearBudget.length > 0 && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                        style={{ background: 'rgba(240,122,62,0.10)', color: '#F07A3E' }}>
                        ⚡ {nearBudget.length} near limit
                      </span>
                    )}
                    {overBudget.length > 0 && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                        style={{ background: 'rgba(255,68,68,0.10)', color: '#FF6B6B' }}>
                        ⚠ {overBudget.length} over budget
                      </span>
                    )}
                  </div>
                </div>

                {/* Segmented bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                    <span>${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2 })} spent</span>
                    <span>{Math.round(overallPct)}% · ${totalBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })} budgeted</span>
                  </div>
                  <div className="w-full h-3 rounded-full overflow-hidden flex"
                    style={{ background: 'rgba(255,255,255,0.07)' }}>
                    {sorted.filter(b => Number(b.spent) > 0).map((b) => {
                      const w = totalBudget > 0 ? (Number(b.spent) / totalBudget * 100) : 0;
                      const c = b.category?.color ?? progressColor(b.percentage);
                      return <div key={b.id} className="h-full transition-all" style={{ width: `${w}%`, background: c, minWidth: w > 0 ? '2px' : 0 }} />;
                    })}
                  </div>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
                    {sorted.filter(b => Number(b.spent) > 0).slice(0, 8).map((b) => (
                      <div key={b.id} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: b.category?.color ?? '#9B6DFF' }} />
                        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                          {b.category?.name ?? 'Unknown'}
                        </span>
                        <span className="text-[10px] font-semibold" style={{ color: b.category?.color ?? '#9B6DFF' }}>
                          ${Number(b.spent).toFixed(0)}
                        </span>
                      </div>
                    ))}
                    {biggestSpend && (
                      <div className="ml-auto text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        Top: <span className="font-semibold text-white">{biggestSpend.category?.name ?? '—'}</span> ${Number(biggestSpend.spent).toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Over-budget alert ── */}
          {overBudget.length > 0 && (
            <div className="px-4 py-3 rounded-xl flex items-center gap-3"
              style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.25)' }}>
              <span className="text-lg shrink-0">⚠️</span>
              <p className="text-sm" style={{ color: '#FF8080' }}>
                <span className="font-semibold">{overBudget.length} {overBudget.length === 1 ? 'category' : 'categories'} over budget: </span>
                {overBudget.map((b) => `${b.category?.icon ?? ''} ${b.category?.name ?? '—'}`).join(', ')}
              </p>
            </div>
          )}


          {/* ── Budget list ── */}
          {loading ? (
            <p className="text-sm py-10 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading budgets…</p>
          ) : budgets.length === 0 && !showForm ? (
            <div className="p-12 flex flex-col items-center gap-3 text-center rounded-2xl" style={glass}>
              <span className="text-4xl">🎯</span>
              <p className="font-semibold">No budgets for {monthLabel(month)}</p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Set spending limits per category to track where your money goes.
              </p>
              <button onClick={() => setShowForm(true)}
                className="mt-2 px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110"
                style={{ background: 'var(--color-card-violet)' }}>
                + Add Your First Budget
              </button>
            </div>
          ) : budgets.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-2xl overflow-hidden" style={glass}>
              {/* Table header */}
              <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-3 border-b"
                style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <p className="font-bold text-sm">Categories</p>
                <div className="flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase"
                  style={{ color: 'var(--color-text-muted)' }}>
                  Sort:
                  {([['pct', 'Usage'], ['spent', 'Spent'], ['name', 'Name']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setSort(k)}
                      className="px-2.5 py-1 rounded-lg transition-colors"
                      style={sort === k ? { background: 'rgba(155,109,255,0.18)', color: '#9B6DFF' } : { color: 'var(--color-text-muted)' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {sorted.map((b, i) => {
                const pct      = Math.min(b.percentage, 100);
                const color    = progressColor(b.percentage);
                const catColor = b.category?.color ?? '#9B6DFF';
                const spent    = Number(b.spent);
                const amount   = Number(b.amount);
                const remaining = amount - spent;
                const isOver   = b.percentage >= 100;
                const isNear   = b.percentage >= 80 && b.percentage < 100;

                return (
                  <div key={b.id}
                    className="px-5 py-4 flex flex-col gap-3 transition-colors hover:bg-white/[0.02]"
                    style={i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.05)' } : {}}>

                    {/* Top row */}
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Icon */}
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                        style={{ background: `${catColor}22`, border: `1px solid ${catColor}33` }}>
                        {b.category?.icon ?? '📦'}
                      </div>

                      {/* Name + status */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{b.category?.name ?? 'Unknown Category'}</p>
                          {isOver && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ background: 'rgba(255,68,68,0.15)', color: '#FF6B6B' }}>
                              OVER BUDGET
                            </span>
                          )}
                          {isNear && !isOver && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ background: 'rgba(240,122,62,0.15)', color: '#F07A3E' }}>
                              NEAR LIMIT
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] mt-0.5 capitalize" style={{ color: 'var(--color-text-muted)' }}>
                          {b.category?.type ?? 'expense'} · Monthly budget
                        </p>
                      </div>

                      {/* Numbers */}
                      <div className="flex items-center gap-6 shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Spent</p>
                          <p className="text-sm font-bold tabular-nums" style={{ color }}>
                            ${spent.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="text-right hidden md:block">
                          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Budget</p>
                          <p className="text-sm font-bold tabular-nums text-white">
                            ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="text-right hidden lg:block">
                          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Remaining</p>
                          <p className="text-sm font-bold tabular-nums"
                            style={{ color: remaining < 0 ? '#FF4444' : '#4FBF7F' }}>
                            {remaining < 0 ? '-' : '+'}${Math.abs(remaining).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="text-right w-12">
                          <p className="text-sm font-extrabold tabular-nums" style={{ color }}>{b.percentage}%</p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => startEdit(b)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors text-xs"
                            style={{ color: 'var(--color-text-muted)' }} title="Edit">
                            ✏️
                          </button>
                          <button onClick={() => handleDelete(b.id)} disabled={deletingId === b.id}
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/20 transition-colors text-xs disabled:opacity-40"
                            style={{ color: 'var(--color-text-muted)' }} title="Delete">
                            {deletingId === b.id ? '…' : '🗑️'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div>
                      <div className="w-full h-2 rounded-full overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.07)' }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}55` }} />
                      </div>
                      <div className="flex justify-between mt-1 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        <span className="sm:hidden">
                          ${spent.toFixed(2)} spent · ${amount.toFixed(2)} budget
                        </span>
                        <span className="hidden sm:block">
                          ${spent.toFixed(2)} of ${amount.toFixed(2)}
                        </span>
                        <span style={{ color: remaining < 0 ? '#FF4444' : 'var(--color-text-muted)' }}>
                          {remaining < 0
                            ? `$${Math.abs(remaining).toFixed(2)} over`
                            : `$${remaining.toFixed(2)} left`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* ── Add / Edit modal ── */}
        {showForm && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null); setCatDropOpen(false); } }}>
            {(() => {
              const selCat   = categories.find((c) => c.id === form.categoryId);
              const accent   = selCat?.color ?? '#9B6DFF';
              const amt      = parseFloat(form.amount) || 0;
              const quickAmts = [100, 250, 500, 1000];
              return (
                <form onSubmit={handleSubmit}
                  className="w-full max-w-md flex flex-col rounded-2xl"
                  style={{ background: 'rgba(18,18,30,0.99)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 32px 80px rgba(0,0,0,0.8)' }}>

                  {/* Preview header */}
                  <div className="px-5 py-4 flex items-center justify-between gap-3 rounded-t-2xl overflow-hidden"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: `linear-gradient(135deg, ${accent}12 0%, transparent 60%)` }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{ background: `${accent}22`, boxShadow: `0 0 0 1px ${accent}44` }}>
                        {selCat?.icon ?? '🎯'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm" style={{ color: selCat ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                          {selCat?.name ?? (editingId ? 'Edit Budget' : 'New Budget')}
                        </p>
                        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                          {amt > 0 ? `$${amt.toLocaleString()} / month · ${monthLabel(month)}` : monthLabel(month)}
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setCatDropOpen(false); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 shrink-0"
                      style={{ color: 'var(--color-text-muted)' }}>✕</button>
                  </div>

                  <div className="flex flex-col gap-4 px-5 py-4">

                    {/* Category picker */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Category</span>
                      <div style={{ position: 'relative' }}>
                        <button type="button" disabled={!!editingId}
                          onClick={() => setCatDropOpen((o) => !o)}
                          className="w-full px-3 py-2.5 text-sm flex items-center gap-2.5 rounded-xl outline-none text-left disabled:opacity-60"
                          style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${selCat ? accent + '44' : 'rgba(255,255,255,0.10)'}`, color: selCat ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                          {selCat ? (
                            <>
                              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                                style={{ background: `${accent}20` }}>{selCat.icon}</span>
                              <span className="flex-1 font-medium" style={{ color: accent }}>{selCat.name}</span>
                            </>
                          ) : (
                            <span className="flex-1">Select a category…</span>
                          )}
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0, transition: 'transform .15s', transform: catDropOpen ? 'rotate(180deg)' : undefined }}>
                            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        {catDropOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden overflow-y-auto"
                            style={{ background: 'rgba(18,18,30,0.99)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 10, maxHeight: '50vh' }}>
                            {available.map((c) => (
                              <button key={c.id} type="button"
                                onClick={() => { setForm((f) => ({ ...f, categoryId: c.id })); setCatDropOpen(false); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                style={{ background: form.categoryId === c.id ? `${c.color}18` : 'transparent', color: form.categoryId === c.id ? c.color : 'var(--color-text-primary)' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = `${c.color}12`)}
                                onMouseLeave={(e) => (e.currentTarget.style.background = form.categoryId === c.id ? `${c.color}18` : 'transparent')}>
                                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                                  style={{ background: `${c.color}20` }}>{c.icon}</span>
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
                      <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${amt > 0 ? accent + '55' : 'rgba(255,255,255,0.10)'}`, transition: 'border-color .2s' }}>
                        <span className="flex items-center px-3 text-sm font-semibold shrink-0"
                          style={{ background: 'rgba(255,255,255,0.06)', color: amt > 0 ? accent : 'var(--color-text-muted)', borderRight: '1px solid rgba(255,255,255,0.08)', transition: 'color .2s' }}>$</span>
                        <input required type="number" step="0.01" min="1" placeholder="0.00"
                          autoFocus={!!editingId}
                          value={form.amount}
                          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                          className="flex-1 px-3 py-2.5 text-sm outline-none font-semibold"
                          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-primary)' }} />
                      </div>
                      {/* Quick amounts */}
                      <div className="flex gap-1.5">
                        {quickAmts.map((q) => (
                          <button key={q} type="button"
                            onClick={() => setForm((f) => ({ ...f, amount: String(q) }))}
                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                            style={{
                              background: Number(form.amount) === q ? `${accent}22` : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${Number(form.amount) === q ? accent + '44' : 'rgba(255,255,255,0.08)'}`,
                              color: Number(form.amount) === q ? accent : 'var(--color-text-muted)',
                            }}>
                            ${q}
                          </button>
                        ))}
                      </div>
                    </div>

                  </div>

                  {/* Footer */}
                  <div className="flex gap-2 justify-end px-5 py-4 rounded-b-2xl overflow-hidden"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setCatDropOpen(false); }}
                      className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-white/10 transition-colors"
                      style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
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
