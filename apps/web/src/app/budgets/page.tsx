'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: string;
}

interface BudgetWithSpent {
  id: string;
  categoryId: string;
  category: Category;
  amount: number;
  spent: number;
  percentage: number;
  remaining: number;
}

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

function progressColor(pct: number): string {
  if (pct >= 100) return '#FF4444';
  if (pct >= 80)  return '#F07A3E';
  if (pct >= 60)  return '#F5C842';
  return '#4FBF7F';
}

function monthLabel(m: string): string {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function prevMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function BudgetsPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ categoryId: '', amount: '' });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API}/budgets?month=${month}`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API}/categories`, { credentials: 'include' }).then((r) => r.json()),
    ]).then(([b, c]) => {
      setBudgets(b);
      setCategories(c);
    }).finally(() => setLoading(false));
  }, [month]);

  const usedCategoryIds = new Set(budgets.map((b) => b.categoryId));
  const availableCategories = categories.filter(
    (c) => c.type !== 'transfer' && c.type !== 'income' &&
           (!usedCategoryIds.has(c.id) || c.id === form.categoryId),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      const res = await fetch(`${API}/budgets/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount: parseFloat(form.amount) }),
      });
      const updated = await res.json();
      const spent = budgets.find((b) => b.id === editingId);
      setBudgets((prev) => prev.map((b) => b.id === editingId
        ? { ...updated, spent: spent?.spent ?? 0, percentage: Math.round(((spent?.spent ?? 0) / parseFloat(form.amount)) * 100), remaining: parseFloat(form.amount) - (spent?.spent ?? 0) }
        : b,
      ));
    } else {
      const res = await fetch(`${API}/budgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ categoryId: form.categoryId, amount: parseFloat(form.amount) }),
      });
      const created = await res.json();
      setBudgets((prev) => [...prev, { ...created, spent: 0, percentage: 0, remaining: parseFloat(form.amount) }]);
    }
    setShowForm(false);
    setEditingId(null);
    setForm({ categoryId: '', amount: '' });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`${API}/budgets/${id}`, { method: 'DELETE', credentials: 'include' });
    setBudgets((prev) => prev.filter((b) => b.id !== id));
    setDeletingId(null);
  }

  function startEdit(b: BudgetWithSpent) {
    setEditingId(b.id);
    setForm({ categoryId: b.categoryId, amount: String(b.amount) });
    setShowForm(true);
  }

  const totalBudget  = budgets.reduce((s, b) => s + Number(b.amount), 0);
  const totalSpent   = budgets.reduce((s, b) => s + b.spent, 0);
  const totalPct     = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const overBudget   = budgets.filter((b) => b.percentage >= 100);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

        {/* Header + month nav */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Budgets</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setMonth(prevMonth(month))}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
              style={{ border: '1px solid rgba(255,255,255,0.10)', color: 'var(--color-text-secondary)' }}>
              ‹
            </button>
            <span className="text-sm font-semibold px-3">{monthLabel(month)}</span>
            <button onClick={() => setMonth(nextMonth(month))}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
              style={{ border: '1px solid rgba(255,255,255,0.10)', color: 'var(--color-text-secondary)' }}>
              ›
            </button>
            {!showForm && (
              <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ categoryId: '', amount: '' }); }}
                className="ml-2 px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all hover:brightness-110"
                style={{ background: 'var(--color-card-violet)' }}>
                + Add Budget
              </button>
            )}
          </div>
        </div>

        {/* Monthly summary */}
        {budgets.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'TOTAL BUDGET', value: `$${totalBudget.toFixed(2)}`,  accent: '#9B6DFF' },
              { label: 'TOTAL SPENT',  value: `$${totalSpent.toFixed(2)}`,   accent: totalPct >= 100 ? '#FF4444' : '#F07A3E' },
              { label: 'REMAINING',    value: `$${(totalBudget - totalSpent).toFixed(2)}`, accent: '#4FBF7F' },
            ].map((s) => (
              <div key={s.label} className="p-4 relative overflow-hidden"
                style={{ ...glass, borderRadius: 'var(--radius-card)', border: `1px solid rgba(${hexToRgb(s.accent)},0.25)` }}>
                <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full pointer-events-none"
                  style={{ background: s.accent, opacity: 0.10, filter: 'blur(16px)' }} />
                <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: s.accent }}>{s.label}</p>
                <p className="text-2xl font-extrabold text-white mt-1">{s.value}</p>
                {s.label === 'TOTAL SPENT' && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{totalPct}% of budget</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Over-budget alert */}
        {overBudget.length > 0 && (
          <div className="px-4 py-3 rounded-xl flex items-center gap-3"
            style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.25)' }}>
            <span>⚠️</span>
            <p className="text-sm" style={{ color: '#FF8080' }}>
              <span className="font-semibold">{overBudget.length} {overBudget.length === 1 ? 'category' : 'categories'} over budget: </span>
              {overBudget.map((b) => `${b.category.icon} ${b.category.name}`).join(', ')}
            </p>
          </div>
        )}

        {/* Add/Edit form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
            <p className="font-semibold text-sm">{editingId ? 'Edit Budget' : 'New Budget'}</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Category</span>
                <select required value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                  disabled={!!editingId}
                  className="px-3 py-2.5 text-sm outline-none appearance-none" style={inputStyle}>
                  <option value="">Select a category</option>
                  {availableCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Monthly Limit</span>
                <div className="flex">
                  <span className="flex items-center px-3 text-sm rounded-l-[var(--radius-input)]"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', borderRight: 'none', color: 'var(--color-text-muted)' }}>
                    $
                  </span>
                  <input required type="number" step="0.01" min="1" placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    className="flex-1 px-3 py-2.5 text-sm outline-none"
                    style={{ ...inputStyle, borderRadius: '0 var(--radius-input) var(--radius-input) 0', borderLeft: 'none' }} />
                </div>
              </label>
            </div>

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }}
                className="px-4 py-2 text-sm font-medium rounded-xl"
                style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Cancel
              </button>
              <button type="submit"
                className="px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110"
                style={{ background: 'var(--color-card-violet)' }}>
                {editingId ? 'Save Changes' : 'Create Budget'}
              </button>
            </div>
          </form>
        )}

        {/* Budget cards */}
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading budgets…</p>
        ) : budgets.length === 0 && !showForm ? (
          <div className="p-10 flex flex-col items-center gap-3 text-center" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {budgets.map((b) => {
              const pct    = Math.min(b.percentage, 100);
              const color  = progressColor(b.percentage);
              const catColor = b.category?.color ?? '#9B6DFF';

              return (
                <div key={b.id} className="p-5 flex flex-col gap-4" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
                  {/* Top row */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{ background: `${catColor}22`, border: `1px solid ${catColor}44` }}>
                        {b.category?.icon ?? '📦'}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{b.category?.name ?? '—'}</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Monthly budget</p>
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <button onClick={() => startEdit(b)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
                        style={{ color: 'var(--color-text-muted)' }}>
                        ✏️
                      </button>
                      <button onClick={() => handleDelete(b.id)} disabled={deletingId === b.id}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/20 transition-colors disabled:opacity-40"
                        style={{ color: 'var(--color-text-muted)' }}>
                        {deletingId === b.id ? '…' : '🗑️'}
                      </button>
                    </div>
                  </div>

                  {/* Amounts */}
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Spent</p>
                      <p className="text-2xl font-extrabold" style={{ color }}>${b.spent.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Budget</p>
                      <p className="text-base font-bold text-white">${Number(b.amount).toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="w-full rounded-full overflow-hidden" style={{ height: '6px', background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}66` }} />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <p className="text-xs font-semibold" style={{ color }}>{b.percentage}%</p>
                      <p className="text-xs" style={{ color: b.remaining < 0 ? '#FF4444' : 'var(--color-text-muted)' }}>
                        {b.remaining < 0
                          ? `$${Math.abs(b.remaining).toFixed(2)} over`
                          : `$${b.remaining.toFixed(2)} left`}
                      </p>
                    </div>
                  </div>

                  {/* Status badge */}
                  {b.percentage >= 100 && (
                    <div className="px-3 py-1.5 rounded-lg text-center text-xs font-semibold"
                      style={{ background: 'rgba(255,68,68,0.12)', color: '#FF8080', border: '1px solid rgba(255,68,68,0.25)' }}>
                      ⚠️ Over budget by ${Math.abs(b.remaining).toFixed(2)}
                    </div>
                  )}
                  {b.percentage >= 80 && b.percentage < 100 && (
                    <div className="px-3 py-1.5 rounded-lg text-center text-xs font-semibold"
                      style={{ background: 'rgba(240,122,62,0.12)', color: '#F07A3E', border: '1px solid rgba(240,122,62,0.25)' }}>
                      🔶 Almost at limit
                    </div>
                  )}
                  {b.percentage < 60 && b.spent === 0 && (
                    <div className="px-3 py-1.5 rounded-lg text-center text-xs font-semibold"
                      style={{ background: 'rgba(79,191,127,0.08)', color: '#4FBF7F', border: '1px solid rgba(79,191,127,0.18)' }}>
                      ✅ No spending yet
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
