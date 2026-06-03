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

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
function progressColor(pct: number) {
  if (pct >= 100) return '#FF4444';
  if (pct >= 80)  return '#F5C842';
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
function monthFrom(m: string) { return `${m}-01`; }
function monthTo(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).toISOString().slice(0, 10);
}
function fmt(n: number) { return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const glass: React.CSSProperties = {
  background: 'rgba(22,22,36,0.60)', backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)',
};

export default function BudgetsPage() {
  const [month, setMonth]         = useState(() => new Date().toISOString().slice(0, 7));
  const [budgets, setBudgets]     = useState<BudgetWithSpent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm]           = useState({ categoryId: '', amount: '' });
  const [sort, setSort]           = useState<'pct' | 'spent' | 'name'>('pct');
  const [catDropOpen, setCatDropOpen] = useState(false);

  // Selected budget + transactions panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [txFrom, setTxFrom]         = useState(() => monthFrom(new Date().toISOString().slice(0, 7)));
  const [txTo, setTxTo]             = useState(() => monthTo(new Date().toISOString().slice(0, 7)));
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

  // Sync default date range when month changes
  useEffect(() => {
    setTxFrom(monthFrom(month));
    setTxTo(monthTo(month));
  }, [month]);

  const selectedBudget = budgets.find(b => b.id === selectedId);

  const loadBudgetTxs = useCallback(async () => {
    if (!selectedBudget) return;
    setTxLoading(true);
    try {
      const res = await fetch(`${API}/transactions?from=${txFrom}&to=${txTo}&limit=500`, { credentials: 'include' });
      const all: Transaction[] = await res.json();
      setBudgetTxs(Array.isArray(all) ? all.filter(t => t.categoryRef?.id === selectedBudget.categoryId) : []);
    } catch {} finally { setTxLoading(false); }
  }, [selectedBudget, txFrom, txTo]);

  useEffect(() => { if (selectedId) loadBudgetTxs(); }, [loadBudgetTxs, selectedId]);

  // Derived stats
  const totalBudget    = budgets.reduce((s, b) => s + Number(b.amount), 0);
  const totalSpent     = budgets.reduce((s, b) => s + Number(b.spent), 0);
  const overBudget     = budgets.filter(b => b.percentage >= 100);
  const nearBudget     = budgets.filter(b => b.percentage >= 80 && b.percentage < 100);
  const onTrack        = budgets.filter(b => b.percentage < 80);
  const overallPct     = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;
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
    if (selectedId === id) setSelectedId(null);
    setDeletingId(null);
  }

  // Spending trend chart data for selected budget
  const spendTrend = (() => {
    if (!budgetTxs.length) return [];
    const byDay: Record<string, number> = {};
    budgetTxs.filter(t => Number(t.amount) < 0).forEach(t => {
      byDay[t.date] = (byDay[t.date] || 0) + Math.abs(Number(t.amount));
    });
    return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({
      date: fmtDate(date), total: +total.toFixed(2),
    }));
  })();

  const txIncome   = budgetTxs.filter(t => Number(t.amount) > 0).reduce((s,t) => s + Number(t.amount), 0);
  const txExpenses = budgetTxs.filter(t => Number(t.amount) < 0).reduce((s,t) => s + Math.abs(Number(t.amount)), 0);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">

        {/* ── Header ── */}
        <div className="shrink-0 px-6 pt-5 pb-4 flex items-center justify-between gap-4 flex-wrap z-10"
          style={{ background: 'rgba(15,15,24,0.92)', backdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Budgets</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Spending limits by category</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <button onClick={() => setMonth(prevMonth(month))} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors" style={{ color: 'var(--color-text-muted)' }}>‹</button>
              <span className="text-sm font-semibold px-2 min-w-32 text-center">{monthLabel(month)}</span>
              <button onClick={() => setMonth(nextMonth(month))} disabled={isCurrentMonth} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-30" style={{ color: 'var(--color-text-muted)' }}>›</button>
            </div>
            <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ categoryId: '', amount: '' }); }}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all"
              style={{ background: 'var(--color-card-violet)' }}>
              + Add Budget
            </button>
          </div>
        </div>

        {/* ── Stat cards ── */}
        {!loading && budgets.length > 0 && (
          <div className="shrink-0 px-6 py-4 grid grid-cols-2 xl:grid-cols-4 gap-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {[
              { label: 'Total Budget',  value: `$${fmt(totalBudget)}`,                                                                               accent: '#9B6DFF', icon: '🎯', sub: `${budgets.length} categories` },
              { label: 'Total Spent',   value: `$${fmt(totalSpent)}`,                                                                                accent: totalSpent > totalBudget ? '#FF4444' : '#F07A3E', icon: '💸', sub: `${Math.round(overallPct)}% of budget` },
              { label: 'Remaining',     value: `${Math.abs(totalBudget - totalSpent) < 0.005 ? '$0.00' : (totalBudget - totalSpent < 0 ? '-' : '') + '$' + fmt(Math.abs(totalBudget - totalSpent))}`, accent: totalBudget - totalSpent < 0 ? '#FF4444' : '#4FBF7F', icon: '💰', sub: totalBudget - totalSpent >= 0 ? 'available to spend' : 'exceeded budget' },
              { label: 'Avg Usage',     value: `${budgets.length > 0 ? Math.round(budgets.reduce((s,b) => s + b.percentage, 0) / budgets.length) : 0}%`, accent: overBudget.length > 0 ? '#FF4444' : nearBudget.length > 0 ? '#F5C842' : '#4FBF7F', icon: '📊', sub: `${overBudget.length} over · ${nearBudget.length} near limit` },
            ].map(s => (
              <div key={s.label} className="p-4 rounded-2xl flex flex-col gap-1.5 relative overflow-hidden"
                style={{ background: `rgba(${hexToRgb(s.accent)},0.08)`, border: `1px solid rgba(${hexToRgb(s.accent)},0.20)` }}>
                <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full pointer-events-none"
                  style={{ background: s.accent, opacity: 0.08, filter: 'blur(20px)' }} />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: s.accent }}>{s.label}</span>
                  <span className="text-base">{s.icon}</span>
                </div>
                <span className="text-xl font-extrabold leading-none" style={{ color: 'var(--color-text-primary)' }}>{s.value}</span>
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{s.sub}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Two-column body ── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ── Full-width segmented progress bar ── */}
          {!loading && budgets.length > 0 && (
            <div className="shrink-0 px-6 py-3 flex items-center gap-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(15,15,24,0.4)' }}>
              <span className="text-[11px] shrink-0 tabular-nums" style={{ color: 'var(--color-text-muted)' }}>${fmt(totalSpent)} spent</span>
              <div className="flex-1 h-2 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.07)' }}>
                {sorted.filter(b => Number(b.spent) > 0).map(b => (
                  <div key={b.id} className="h-full transition-all" style={{ width: `${totalBudget > 0 ? Number(b.spent)/totalBudget*100 : 0}%`, background: b.category?.color ?? '#9B6DFF', minWidth: 3 }} />
                ))}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[11px] tabular-nums font-semibold" style={{ color: overallPct >= 100 ? '#FF4444' : overallPct >= 80 ? '#F5C842' : '#4FBF7F' }}>
                  {Math.round(overallPct)}% of ${fmt(totalBudget)}
                </span>
                <span className="text-[10px] font-bold" style={{ color: '#4FBF7F' }}>{onTrack.length} ✓</span>
                {nearBudget.length > 0 && <span className="text-[10px] font-bold" style={{ color: '#F5C842' }}>{nearBudget.length} ⚡</span>}
                {overBudget.length > 0 && <span className="text-[10px] font-bold" style={{ color: '#FF4444' }}>{overBudget.length} ⚠</span>}
              </div>
            </div>
          )}

          {/* ── LEFT: Budget list ── */}
          <div className={selectedId ? 'w-96 shrink-0 flex flex-col overflow-hidden border-r' : 'flex-1 flex flex-col overflow-hidden'} style={{ borderColor: 'rgba(255,255,255,0.06)' }}>

            {/* Sort + scroll list */}
            <div className="shrink-0 px-4 py-2 flex items-center justify-between border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                {budgets.length} budgets
              </p>
              <div className="flex gap-0.5">
                {([['pct','%'],['spent','$'],['name','A-Z']] as const).map(([k,l]) => (
                  <button key={k} onClick={() => setSort(k)}
                    className="px-2 py-1 rounded-lg text-[10px] font-bold transition-colors"
                    style={sort === k ? { background: 'rgba(155,109,255,0.18)', color: '#9B6DFF' } : { color: 'var(--color-text-muted)' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="text-xs p-6 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
              ) : budgets.length === 0 ? (
                <div className="p-8 flex flex-col items-center gap-3 text-center">
                  <span className="text-3xl">🎯</span>
                  <p className="text-sm font-semibold">No budgets yet</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Set spending limits to track where your money goes.</p>
                  <button onClick={() => setShowForm(true)} className="mt-1 px-4 py-2 text-xs font-semibold text-white rounded-xl hover:brightness-110" style={{ background: 'var(--color-card-violet)' }}>
                    + Add Your First Budget
                  </button>
                </div>
              ) : (
                <div className="flex flex-col">
                  {sorted.map((b, i) => {
                    const pct      = b.percentage;
                    const color    = progressColor(pct);
                    const catColor = b.category?.color ?? '#9B6DFF';
                    const spent    = Number(b.spent);
                    const amount   = Number(b.amount);
                    const remaining = amount - spent;
                    const isActive = selectedId === b.id;
                    const isCompact = !!selectedId; // compact when split view active

                    return (
                      <button key={b.id} type="button"
                        onClick={() => setSelectedId(isActive ? null : b.id)}
                        className="w-full text-left flex flex-col gap-2.5 transition-all"
                        style={{
                          padding: isCompact ? '12px 16px' : '16px 24px',
                          borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : undefined,
                          background: isActive ? `${catColor}10` : 'transparent',
                          borderLeft: isActive ? `3px solid ${catColor}` : '3px solid transparent',
                        }}>

                        <div className="flex items-center gap-3 min-w-0">
                          {/* Icon */}
                          <div className={`rounded-xl flex items-center justify-center text-lg shrink-0 ${isCompact ? 'w-8 h-8' : 'w-10 h-10'}`}
                            style={{ background: `${catColor}20`, border: `1px solid ${catColor}30` }}>
                            {b.category?.icon ?? '📦'}
                          </div>

                          {/* Name + badges */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className={`font-semibold truncate ${isCompact ? 'text-xs' : 'text-sm'}`}>{b.category?.name ?? 'Unknown'}</p>
                              {pct >= 100 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(255,68,68,0.18)', color: '#FF6B6B' }}>OVER</span>}
                              {pct >= 80 && pct < 100 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(245,200,66,0.15)', color: '#F5C842' }}>NEAR</span>}
                            </div>
                            {isCompact ? (
                              <p className="text-[10px] mt-0.5 tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                                ${fmt(spent)} of ${fmt(amount)}
                              </p>
                            ) : (
                              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                Monthly budget · {b.category?.type ?? 'expense'}
                              </p>
                            )}
                          </div>

                          {/* Full-width: spent / budget / remaining columns */}
                          {!isCompact && (
                            <div className="flex items-center gap-8 shrink-0">
                              <div className="text-right">
                                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Spent</p>
                                <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color }}>${fmt(spent)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Budget</p>
                                <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color: 'var(--color-text-primary)' }}>${fmt(amount)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Remaining</p>
                                <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color: remaining < 0 ? '#FF4444' : '#4FBF7F' }}>
                                  {remaining < 0 ? '−' : '+'}${fmt(Math.abs(remaining))}
                                </p>
                              </div>
                              <div className="text-right w-14">
                                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Usage</p>
                                <p className="text-sm font-black tabular-nums mt-0.5" style={{ color }}>{pct}%</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button type="button" onClick={e => { e.stopPropagation(); setEditingId(b.id); setForm({ categoryId: b.categoryId, amount: String(b.amount) }); setShowForm(true); }}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors text-xs"
                                  style={{ color: 'var(--color-text-muted)' }}>✏️</button>
                                <button type="button" onClick={e => { e.stopPropagation(); handleDelete(b.id); }} disabled={deletingId === b.id}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/20 transition-colors text-xs disabled:opacity-40"
                                  style={{ color: 'var(--color-text-muted)' }}>{deletingId === b.id ? '…' : '🗑️'}</button>
                              </div>
                            </div>
                          )}

                          {/* Compact: just % */}
                          {isCompact && (
                            <div className="text-right shrink-0">
                              <p className="text-sm font-black tabular-nums" style={{ color }}>{pct}%</p>
                              <p className="text-[10px] tabular-nums" style={{ color: remaining < 0 ? '#FF4444' : 'var(--color-text-muted)' }}>
                                {remaining < 0 ? `−$${fmt(Math.abs(remaining))}` : `$${fmt(remaining)} left`}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Progress bar */}
                        <div className="w-full rounded-full overflow-hidden" style={{ height: isCompact ? 4 : 6, background: 'rgba(255,255,255,0.07)' }}>
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(pct, 100)}%`, background: color, boxShadow: pct >= 100 ? `0 0 6px ${color}88` : undefined }} />
                        </div>

                        {/* Compact edit/delete inline */}
                        {isActive && isCompact && (
                          <div className="flex gap-1.5 justify-end">
                            <button type="button" onClick={e => { e.stopPropagation(); setEditingId(b.id); setForm({ categoryId: b.categoryId, amount: String(b.amount) }); setShowForm(true); }}
                              className="px-2.5 py-1 text-[10px] font-semibold rounded-lg hover:bg-white/10 transition-colors"
                              style={{ color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.10)' }}>Edit</button>
                            <button type="button" onClick={e => { e.stopPropagation(); handleDelete(b.id); }} disabled={deletingId === b.id}
                              className="px-2.5 py-1 text-[10px] font-semibold rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-40"
                              style={{ color: '#FF6B6B', border: '1px solid rgba(255,107,107,0.20)' }}>
                              {deletingId === b.id ? '…' : 'Delete'}
                            </button>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Transaction detail panel ── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedBudget ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: 'rgba(155,109,255,0.12)', border: '1px solid rgba(155,109,255,0.20)' }}>👆</div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Select a budget</p>
                <p className="text-xs max-w-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Click any category on the left to see its transactions, spending trend, and details.
                </p>
              </div>
            ) : (
              <>
                {/* Right panel header */}
                <div className="shrink-0 px-6 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: `linear-gradient(135deg, ${selectedBudget.category?.color ?? '#9B6DFF'}10 0%, transparent 50%)` }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{ background: `${selectedBudget.category?.color ?? '#9B6DFF'}22` }}>
                        {selectedBudget.category?.icon ?? '📦'}
                      </div>
                      <div>
                        <p className="font-bold text-base">{selectedBudget.category?.name ?? 'Unknown'}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            ${fmt(Number(selectedBudget.spent))} spent of ${fmt(Number(selectedBudget.amount))} budget
                          </span>
                          <span className="text-xs font-bold" style={{ color: progressColor(selectedBudget.percentage) }}>
                            {selectedBudget.percentage}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Date range picker */}
                    <div className="flex items-center gap-2 shrink-0">
                      <input type="date" value={txFrom} onChange={e => setTxFrom(e.target.value)}
                        className="px-2.5 py-1.5 text-xs rounded-lg outline-none"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--color-text-primary)', colorScheme: 'dark' }} />
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>→</span>
                      <input type="date" value={txTo} onChange={e => setTxTo(e.target.value)}
                        className="px-2.5 py-1.5 text-xs rounded-lg outline-none"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--color-text-primary)', colorScheme: 'dark' }} />
                      <button onClick={() => { setTxFrom(monthFrom(month)); setTxTo(monthTo(month)); }}
                        className="px-2.5 py-1.5 text-[10px] font-semibold rounded-lg hover:bg-white/10 transition-colors"
                        style={{ color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        This month
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(selectedBudget.percentage, 100)}%`, background: progressColor(selectedBudget.percentage) }} />
                    </div>
                  </div>
                </div>

                {/* Mini stats + trend chart */}
                {(budgetTxs.length > 0 || txLoading) && (
                  <div className="shrink-0 px-6 py-3 border-b flex items-center gap-6" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Transactions</p>
                      <p className="text-lg font-black" style={{ color: selectedBudget.category?.color ?? '#9B6DFF' }}>{budgetTxs.length}</p>
                    </div>
                    {txExpenses > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Total Spent</p>
                        <p className="text-lg font-black" style={{ color: '#F07A3E' }}>−${fmt(txExpenses)}</p>
                      </div>
                    )}
                    {txIncome > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Income</p>
                        <p className="text-lg font-black" style={{ color: '#4FBF7F' }}>+${fmt(txIncome)}</p>
                      </div>
                    )}
                    {spendTrend.length > 1 && (
                      <div className="flex-1 h-10">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={spendTrend}>
                            <defs>
                              <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={selectedBudget.category?.color ?? '#9B6DFF'} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={selectedBudget.category?.color ?? '#9B6DFF'} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="date" hide />
                            <Tooltip contentStyle={{ background: 'rgba(18,18,30,0.97)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, fontSize: 11 }}
                              formatter={(v: number) => [`$${fmt(v)}`, 'Spent']} />
                            <Area type="monotone" dataKey="total" stroke={selectedBudget.category?.color ?? '#9B6DFF'} strokeWidth={1.5} fill="url(#txGrad)" dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}

                {/* Transaction list */}
                <div className="flex-1 overflow-y-auto">
                  {txLoading ? (
                    <p className="text-xs p-6 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading transactions…</p>
                  ) : budgetTxs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center h-full">
                      <span className="text-3xl opacity-40">🔍</span>
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>No transactions found</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        No {selectedBudget.category?.name} transactions between {txFrom} and {txTo}.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col px-6">
                      {[...budgetTxs].sort((a, b) => b.date.localeCompare(a.date)).map((tx, i) => {
                        const amt    = Number(tx.amount);
                        const isInc  = amt >= 0;
                        const color  = selectedBudget.category?.color ?? '#9B6DFF';
                        return (
                          <div key={tx.id} className="flex items-center gap-3 py-3"
                            style={i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.05)' } : {}}>
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0"
                              style={{ background: `${color}15` }}>
                              {selectedBudget.category?.icon ?? (isInc ? '↓' : '↑')}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate">{tx.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{fmtDate(tx.date)}</span>
                                {tx.bankAccount && (
                                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>· {tx.bankAccount.accountName}</span>
                                )}
                              </div>
                            </div>
                            <span className="text-sm font-bold tabular-nums shrink-0"
                              style={{ color: isInc ? '#4FBF7F' : 'var(--color-text-primary)' }}>
                              {isInc ? '+' : '−'}${fmt(Math.abs(amt))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* ── Add / Edit modal ── */}
      {showForm && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null); setCatDropOpen(false); } }}>
          {(() => {
            const selCat = categories.find(c => c.id === form.categoryId);
            const accent = selCat?.color ?? '#9B6DFF';
            const amt    = parseFloat(form.amount) || 0;
            return (
              <form onSubmit={handleSubmit}
                className="w-full max-w-sm flex flex-col rounded-2xl"
                style={{ background: 'rgba(18,18,30,0.99)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 32px 80px rgba(0,0,0,0.8)' }}>
                <div className="px-5 py-4 flex items-center justify-between gap-3 rounded-t-2xl overflow-hidden"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: `linear-gradient(135deg, ${accent}12 0%, transparent 60%)` }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${accent}22` }}>
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
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 shrink-0" style={{ color: 'var(--color-text-muted)' }}>✕</button>
                </div>
                <div className="flex flex-col gap-4 px-5 py-4">
                  {/* Category */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Category</span>
                    <div style={{ position: 'relative' }}>
                      <button type="button" disabled={!!editingId} onClick={() => setCatDropOpen(o => !o)}
                        className="w-full px-3 py-2.5 text-sm flex items-center gap-2.5 rounded-xl outline-none text-left disabled:opacity-60"
                        style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${selCat ? accent + '44' : 'rgba(255,255,255,0.10)'}`, color: selCat ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                        {selCat ? (
                          <><span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${accent}20` }}>{selCat.icon}</span>
                          <span className="flex-1 font-medium" style={{ color: accent }}>{selCat.name}</span></>
                        ) : <span className="flex-1">Select a category…</span>}
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0, transform: catDropOpen ? 'rotate(180deg)' : undefined }}>
                          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      {catDropOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden overflow-y-auto"
                          style={{ background: 'rgba(18,18,30,0.99)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 10, maxHeight: '50vh' }}>
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
                    <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${amt > 0 ? accent + '55' : 'rgba(255,255,255,0.10)'}` }}>
                      <span className="flex items-center px-3 text-sm font-semibold shrink-0"
                        style={{ background: 'rgba(255,255,255,0.06)', color: amt > 0 ? accent : 'var(--color-text-muted)', borderRight: '1px solid rgba(255,255,255,0.08)' }}>$</span>
                      <input required type="number" step="0.01" min="1" placeholder="0.00" autoFocus={!!editingId}
                        value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                        className="flex-1 px-3 py-2.5 text-sm outline-none font-semibold"
                        style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-primary)' }} />
                    </div>
                    <div className="flex gap-1.5">
                      {[100,250,500,1000].map(q => (
                        <button key={q} type="button" onClick={() => setForm(f => ({ ...f, amount: String(q) }))}
                          className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                          style={{ background: Number(form.amount) === q ? `${accent}22` : 'rgba(255,255,255,0.04)', border: `1px solid ${Number(form.amount) === q ? accent + '44' : 'rgba(255,255,255,0.08)'}`, color: Number(form.amount) === q ? accent : 'var(--color-text-muted)' }}>
                          ${q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 justify-end px-5 py-4 rounded-b-2xl overflow-hidden" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setCatDropOpen(false); }}
                    className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-white/10 transition-colors" style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
                  <button type="submit" className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all" style={{ background: accent }}>
                    {editingId ? 'Save Changes' : 'Create Budget'}
                  </button>
                </div>
              </form>
            );
          })()}
        </div>,
        document.body
      )}
    </div>
  );
}
