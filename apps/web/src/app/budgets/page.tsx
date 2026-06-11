'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';
const SLIDER_STEP = 25;
const SLIDER_BASE = 500; // default max; auto-extends in multiples of 500

interface Category { id: string; name: string; icon: string; color: string; type: string }
interface MonthSummary { month: string; total: number; count: number; }
interface BudgetWithSpent {
  id: string; categoryId: string; category: Category; month: string;
  amount: number; spent: number; percentage: number; remaining: number;
}
interface Transaction {
  id: string; name: string; amount: number; date: string;
  categoryRef: Category | null; bankAccount: { accountName: string; bankName: string } | null;
}

function progressColor(pct: number) {
  if (pct >= 100) return '#EF4444';
  if (pct >= 80)  return '#F59E0B';
  return '#22C55E';
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
function fmtShort(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n}`;
}

/* Smooth animated counter */
function useAnimatedNumber(target: number) {
  const [displayed, setDisplayed] = useState(target);
  const prevRef = useRef(target);
  const rafRef  = useRef<number | null>(null);
  useEffect(() => {
    const from = prevRef.current;
    const to   = target;
    if (Math.abs(from - to) < 0.005) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const dur   = 320;
    const start = performance.now();
    const tick  = (now: number) => {
      const t    = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const val  = from + (to - from) * ease;
      setDisplayed(val);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else { prevRef.current = to; setDisplayed(to); rafRef.current = null; }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target]);
  return displayed;
}

export default function BudgetsPage() {
  const [month, setMonth]           = useState(() => new Date().toISOString().slice(0, 7));
  const [budgets, setBudgets]       = useState<BudgetWithSpent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);

  /* Per-category slider values */
  const [sliderValues, setSliderValues] = useState<Record<string, number>>({});
  /* Per-category slider maxes (multiples of 500, auto-extend) */
  const [sliderMaxes, setSliderMaxes]   = useState<Record<string, number>>({});
  /* Which category IDs have unsaved changes */
  const [pendingIds, setPendingIds]     = useState<Set<string>>(new Set());

  /* Copy modal */
  const [copyOpen, setCopyOpen]         = useState(false);
  const [copyDir, setCopyDir]           = useState<'from' | 'to'>('from');
  const [copyTarget, setCopyTarget]     = useState('');
  const [copying, setCopying]           = useState(false);
  const [monthList, setMonthList]       = useState<MonthSummary[]>([]);
  const [loadingMonths, setLoadingMonths] = useState(false);

  useEffect(() => {
    if (!copyOpen) return;
    setLoadingMonths(true);
    fetch(`${API}/budgets/months`, { credentials: 'include' })
      .then(r => r.json())
      .then((data) => {
        const list: MonthSummary[] = Array.isArray(data) ? data : [];
        setMonthList(list);
        const firstPast = list.filter(m => m.month < month).sort((a, b) => b.month.localeCompare(a.month))[0];
        setCopyTarget(copyDir === 'from' ? (firstPast?.month ?? prevMonth(month)) : nextMonth(month));
      })
      .catch(() => setMonthList([]))
      .finally(() => setLoadingMonths(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyOpen]);

  const copyVisibleMonths: MonthSummary[] = (() => {
    if (copyDir === 'from') {
      return monthList.filter(m => m.month !== month).sort((a, b) => b.month.localeCompare(a.month));
    }
    const past = monthList.filter(m => m.month < month).sort((a, b) => b.month.localeCompare(a.month));
    const future: MonthSummary[] = [];
    let m = nextMonth(month);
    for (let i = 0; i < 4; i++) {
      future.push(monthList.find(ml => ml.month === m) ?? { month: m, total: 0, count: 0 });
      m = nextMonth(m);
    }
    return [...future, ...past];
  })();

  async function handleMonthChange(newMonth: string) {
    if (pendingIds.size > 0) await handleSaveAll();
    setMonth(newMonth);
  }

  function handleOpenCopy() {
    setCopyDir('from');
    setCopyTarget(prevMonth(month));
    setCopyOpen(true);
  }

  function handleCopyDir(dir: 'from' | 'to') {
    setCopyDir(dir);
    if (dir === 'from') {
      const first = monthList.filter(m => m.month < month).sort((a, b) => b.month.localeCompare(a.month))[0];
      setCopyTarget(first?.month ?? prevMonth(month));
    } else {
      setCopyTarget(nextMonth(month));
    }
  }

  async function handleCopy() {
    if (copyTarget === month) return;
    setCopying(true);
    try {
      const fromMonth = copyDir === 'from' ? copyTarget : month;
      const toMonth   = copyDir === 'from' ? month : copyTarget;
      await fetch(`${API}/budgets/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fromMonth, toMonth }),
      });
      if (toMonth === month) {
        const fresh = await fetch(`${API}/budgets?month=${month}`, { credentials: 'include' }).then(r => r.json());
        const bs: BudgetWithSpent[] = Array.isArray(fresh) ? fresh : [];
        setBudgets(bs);
        const initial: Record<string, number> = {};
        const maxes:   Record<string, number> = {};
        categories.filter(c => c.type === 'expense').forEach(cat => {
          const bud = bs.find(bd => bd.categoryId === cat.id);
          const amt = bud ? Number(bud.amount) : 0;
          initial[cat.id] = amt;
          maxes[cat.id]   = amt > 0 ? Math.ceil(amt / SLIDER_BASE) * SLIDER_BASE : SLIDER_BASE;
        });
        setSliderValues(initial);
        setSliderMaxes(maxes);
        setPendingIds(new Set());
      }
      setCopyOpen(false);
    } catch { /* ignore */ } finally { setCopying(false); }
  }

  /* Transaction detail */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [budgetTxs, setBudgetTxs]   = useState<Transaction[]>([]);
  const [txLoading, setTxLoading]   = useState(false);

  /* View filter */
  const [filter, setFilter] = useState<'all' | 'active' | 'none'>('all');

  const isCurrentMonth = month === new Date().toISOString().slice(0, 7);

  useEffect(() => {
    setLoading(true);
    // Ensure this month has budgets; if empty, API copies from the most recent prior month
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
        const bs: BudgetWithSpent[] = Array.isArray(b) ? b : [];
        const cs: Category[]        = Array.isArray(c) ? c : [];
        setBudgets(bs);
        setCategories(cs);
        const initial: Record<string, number> = {};
        const maxes:   Record<string, number> = {};
        cs.filter(cat => cat.type === 'expense').forEach(cat => {
          const bud = bs.find(bd => bd.categoryId === cat.id);
          const amt = bud ? Number(bud.amount) : 0;
          initial[cat.id] = amt;
          maxes[cat.id]   = amt > 0 ? Math.ceil(amt / SLIDER_BASE) * SLIDER_BASE : SLIDER_BASE;
        });
        setSliderValues(initial);
        setSliderMaxes(maxes);
        setPendingIds(new Set());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [month]);

  const expenseCategories = categories.filter(c => c.type === 'expense');
  const budgetMap         = Object.fromEntries(budgets.map(b => [b.categoryId, b]));

  /* Live derived stats */
  const totalBudget   = Object.values(sliderValues).reduce((s, v) => s + v, 0);
  const totalSpent    = budgets.reduce((s, b) => s + Number(b.spent), 0);
  const overallPct    = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;
  const activeCats    = expenseCategories.filter(c => (sliderValues[c.id] ?? 0) > 0);
  const noBudgetCats  = expenseCategories.filter(c => (sliderValues[c.id] ?? 0) === 0);
  const overCount     = activeCats.filter(c => (budgetMap[c.id]?.percentage ?? 0) >= 100).length;
  const nearCount     = activeCats.filter(c => { const p = budgetMap[c.id]?.percentage ?? 0; return p >= 80 && p < 100; }).length;

  const animTotal     = useAnimatedNumber(totalBudget);
  const animRemaining = useAnimatedNumber(totalBudget - totalSpent);

  /* Slider change handler — auto-extends max in 500-step increments */
  function handleSliderChange(catId: string, value: number) {
    setSliderValues(prev => ({ ...prev, [catId]: value }));
    setSliderMaxes(prev => {
      const current = prev[catId] ?? SLIDER_BASE;
      if (value >= current) return { ...prev, [catId]: current + SLIDER_BASE };
      return prev;
    });
    const orig    = budgets.find(b => b.categoryId === catId);
    const origAmt = orig ? Number(orig.amount) : 0;
    if (value !== origAmt) {
      setPendingIds(prev => new Set(prev).add(catId));
    } else {
      setPendingIds(prev => { const s = new Set(prev); s.delete(catId); return s; });
    }
  }

  /* Save all pending changes */
  async function handleSaveAll() {
    setSaving(true);
    try {
      const ops: Promise<Response>[] = [];
      for (const catId of pendingIds) {
        const newAmt   = sliderValues[catId] ?? 0;
        const existing = budgets.find(b => b.categoryId === catId);
        if (newAmt === 0 && existing) {
          ops.push(fetch(`${API}/budgets/${existing.id}`, { method: 'DELETE', credentials: 'include' }));
        } else if (newAmt > 0 && existing) {
          ops.push(fetch(`${API}/budgets/${existing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ amount: newAmt }) }));
        } else if (newAmt > 0 && !existing) {
          ops.push(fetch(`${API}/budgets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ categoryId: catId, amount: newAmt, month }) }));
        }
      }
      await Promise.all(ops);
      const fresh = await fetch(`${API}/budgets?month=${month}`, { credentials: 'include' }).then(r => r.json());
      setBudgets(Array.isArray(fresh) ? fresh : []);
      setPendingIds(new Set());
    } finally { setSaving(false); }
  }

  /* Transaction detail for expanded category */
  const expandedCat = expandedId ? expenseCategories.find(c => c.id === expandedId) ?? null : null;

  const loadTxs = useCallback(async () => {
    if (!expandedCat) return;
    setTxLoading(true);
    try {
      const res  = await fetch(`${API}/transactions?from=${monthFrom(month)}&to=${monthTo(month)}&limit=500`, { credentials: 'include' });
      const all: Transaction[] = await res.json();
      setBudgetTxs(Array.isArray(all) ? all.filter(t => t.categoryRef?.id === expandedCat.id) : []);
    } catch { setBudgetTxs([]); } finally { setTxLoading(false); }
  }, [expandedCat, month]);

  useEffect(() => { if (expandedId) loadTxs(); else setBudgetTxs([]); }, [loadTxs, expandedId]);

  const spendTrend = (() => {
    const byDay: Record<string, number> = {};
    budgetTxs.filter(t => Number(t.amount) < 0).forEach(t => {
      byDay[t.date] = (byDay[t.date] || 0) + Math.abs(Number(t.amount));
    });
    return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date: fmtDate(date), total: +total.toFixed(2) }));
  })();

  /* Filter — pending changes always stay visible */
  const filteredCats = expenseCategories.filter(c => {
    if (filter === 'all') return true;
    if (pendingIds.has(c.id)) return true;
    const hasLimit = (sliderValues[c.id] ?? 0) > 0;
    return filter === 'active' ? hasLimit : !hasLimit;
  });

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">

        {/* ── Slider CSS ── */}
        <style>{`
          .budget-slider { -webkit-appearance: none; appearance: none; outline: none; cursor: pointer; height: 6px; border-radius: 3px; }
          .budget-slider::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; }
          .budget-slider::-webkit-slider-thumb {
            -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; margin-top: -7px;
            background: var(--thumb-color, rgba(255,255,255,0.35));
            box-shadow: 0 0 0 3px rgba(0,0,0,0.5), 0 2px 10px var(--thumb-color, rgba(255,255,255,0.15));
            cursor: grab; transition: transform 0.12s, box-shadow 0.12s;
          }
          .budget-slider::-webkit-slider-thumb:hover { transform: scale(1.15); box-shadow: 0 0 0 3px rgba(0,0,0,0.5), 0 0 0 6px var(--thumb-glow, rgba(255,255,255,0.08)), 0 2px 10px var(--thumb-color, rgba(255,255,255,0.2)); }
          .budget-slider::-webkit-slider-thumb:active { cursor: grabbing; transform: scale(1.25); }
          .budget-slider::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; border: none; background: var(--thumb-color, rgba(255,255,255,0.35)); cursor: grab; }
          .budget-slider::-moz-range-track { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.08); }
          .budget-slider::-moz-range-progress { height: 6px; border-radius: 3px; background: var(--thumb-color, rgba(255,255,255,0.35)); }
        `}</style>

        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-20 px-6 pt-5 pb-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: 'var(--header-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Budgets</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Drag sliders to set monthly limits per category</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
              <button onClick={() => handleMonthChange(prevMonth(month))}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-150 hover:bg-white/10"
                style={{ color: 'var(--color-text-muted)', cursor: 'pointer' }}>‹</button>
              <span className="text-sm font-semibold px-2 min-w-36 text-center">{monthLabel(month)}</span>
              <button onClick={() => handleMonthChange(nextMonth(month))} disabled={isCurrentMonth}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-150 hover:bg-white/10 disabled:opacity-30"
                style={{ color: 'var(--color-text-muted)', cursor: isCurrentMonth ? 'default' : 'pointer' }}>›</button>
            </div>

            <button onClick={handleOpenCopy}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all duration-150 hover:bg-white/10"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
              Import plan
            </button>

            {pendingIds.size > 0 && (
              <button onClick={handleSaveAll} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-xl transition-all duration-150 disabled:opacity-60"
                style={{ background: '#22C55E', cursor: 'pointer', boxShadow: '0 4px 16px rgba(34,197,94,0.40)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {saving ? 'Saving…' : `Save ${pendingIds.size} change${pendingIds.size !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>

        <div className="p-6 flex flex-col gap-5">

          {/* ── Hero live summary ── */}
          {!loading && (
            <div className="rounded-2xl p-5 relative overflow-hidden"
              style={{
                background: 'var(--color-surface)',
                backdropFilter: 'var(--glass-blur)',
                WebkitBackdropFilter: 'var(--glass-blur)',
                border: '1px solid var(--color-border)',
                boxShadow: '0 4px 32px rgba(129,140,248,0.06)',
              }}>
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 15% 50%, rgba(129,140,248,0.07) 0%, transparent 55%), radial-gradient(ellipse at 85% 0%, rgba(34,197,94,0.05) 0%, transparent 50%)' }} />

              <div className="relative flex flex-col gap-4">
                {/* Numbers row */}
                <div className="flex items-start justify-between gap-6 flex-wrap">
                  {/* Total */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Monthly Budget</p>
                    <div className="flex items-baseline gap-2.5">
                      <span className="text-4xl font-black tabular-nums"
                        style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
                        ${animTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {pendingIds.size > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(245,200,66,0.12)', color: '#F5C842', border: '1px solid rgba(245,200,66,0.25)' }}>
                          {pendingIds.size} unsaved
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      {activeCats.length} limit{activeCats.length !== 1 ? 's' : ''} set
                      {noBudgetCats.length > 0 && <span className="ml-1.5 opacity-60">· {noBudgetCats.length} without limit</span>}
                    </p>
                  </div>

                  {/* Spent + Remaining */}
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Spent</p>
                      <p className="text-2xl font-black tabular-nums"
                        style={{ color: overallPct >= 100 ? '#EF4444' : '#F97316', letterSpacing: '-0.03em' }}>
                        ${fmt(totalSpent)}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{Math.round(overallPct)}% used</p>
                    </div>
                    <div className="w-px h-10 rounded-full" style={{ background: 'var(--color-border)' }} />
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Remaining</p>
                      <p className="text-2xl font-black tabular-nums"
                        style={{ color: animRemaining < 0 ? '#EF4444' : '#22C55E', letterSpacing: '-0.03em' }}>
                        {animRemaining < 0 ? '−' : '+'}${Math.abs(animRemaining).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>available</p>
                    </div>
                  </div>
                </div>

                {/* Segmented bars */}
                {totalBudget > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {/* Spend bar */}
                    <div className="h-3 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      {expenseCategories.filter(c => (sliderValues[c.id] ?? 0) > 0).map(c => {
                        const bud   = budgetMap[c.id];
                        const spent = bud ? Number(bud.spent) : 0;
                        const pct   = totalBudget > 0 ? (spent / totalBudget) * 100 : 0;
                        return pct > 0.1 ? (
                          <div key={c.id} className="h-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: c.color, minWidth: 3 }} />
                        ) : null;
                      })}
                    </div>
                    {/* Allocation bar */}
                    <div className="h-1 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      {expenseCategories.filter(c => (sliderValues[c.id] ?? 0) > 0).map(c => {
                        const alloc = totalBudget > 0 ? ((sliderValues[c.id] ?? 0) / totalBudget) * 100 : 0;
                        return (
                          <div key={c.id} className="h-full transition-all duration-300"
                            style={{ width: `${alloc}%`, background: c.color, opacity: 0.4 }} />
                        );
                      })}
                    </div>
                    {/* Legend */}
                    <div className="flex items-center justify-between text-[10px] mt-0.5">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1" style={{ color: '#22C55E' }}>
                          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#22C55E' }} />
                          {activeCats.filter(c => (budgetMap[c.id]?.percentage ?? 0) < 80).length} on track
                        </span>
                        {nearCount > 0 && (
                          <span className="flex items-center gap-1" style={{ color: '#F59E0B' }}>
                            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#F59E0B' }} />
                            {nearCount} near limit
                          </span>
                        )}
                        {overCount > 0 && (
                          <span className="flex items-center gap-1" style={{ color: '#EF4444' }}>
                            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#EF4444' }} />
                            {overCount} over budget
                          </span>
                        )}
                      </div>
                      <span style={{ color: 'var(--color-text-muted)' }}>${fmt(totalSpent)} of ${fmt(totalBudget)}</span>
                    </div>
                  </div>
                )}

                {totalBudget === 0 && !loading && expenseCategories.length > 0 && (
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    Drag sliders below to set monthly limits — the total updates live.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Filter tabs ── */}
          {!loading && expenseCategories.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                {([
                  ['all',    `All · ${expenseCategories.length}`],
                  ['active', `Budgeted · ${activeCats.length}`],
                  ['none',   `No Limit · ${noBudgetCats.length}`],
                ] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setFilter(k)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors duration-150"
                    style={filter === k
                      ? { background: 'var(--color-card-violet)', color: 'white' }
                      : { color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                    {l}
                  </button>
                ))}
              </div>
              <p className="hidden sm:block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                Click a card to see transactions
              </p>
            </div>
          )}

          {/* ── Category grid ── */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: 'var(--color-surface)' }} />
              ))}
            </div>
          ) : expenseCategories.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-4 text-center rounded-2xl"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <span className="text-5xl opacity-25">🗂️</span>
              <p className="font-semibold">No expense categories yet</p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Add categories in Transactions to start budgeting.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredCats.map(cat => {
                const budgetAmt  = sliderValues[cat.id] ?? 0;
                const bud        = budgetMap[cat.id];
                const spent      = bud ? Number(bud.spent) : 0;
                const pct        = budgetAmt > 0 ? Math.min((spent / budgetAmt) * 100, 100) : 0;
                const hasLimit   = budgetAmt > 0;
                const remaining  = budgetAmt - spent;
                const isPending  = pendingIds.has(cat.id);
                const isExpanded = expandedId === cat.id;
                const sliderMax  = sliderMaxes[cat.id] ?? SLIDER_BASE;
                const trackPct   = Math.min((budgetAmt / sliderMax) * 100, 100);

                return (
                  <div key={cat.id} className="rounded-2xl overflow-hidden transition-all duration-300"
                    style={{
                      background: hasLimit
                        ? `linear-gradient(135deg, ${cat.color}10 0%, var(--color-surface) 55%)`
                        : 'var(--color-surface)',
                      backdropFilter: 'var(--glass-blur)',
                      WebkitBackdropFilter: 'var(--glass-blur)',
                      border: hasLimit
                        ? `1px solid ${cat.color}40`
                        : isExpanded
                          ? '1px solid rgba(255,255,255,0.14)'
                          : '1px solid rgba(255,255,255,0.07)',
                      boxShadow: isExpanded && hasLimit ? `0 0 0 1px ${cat.color}18, 0 8px 32px ${cat.color}10` : 'none',
                    }}>

                    {/* ── Card body ── */}
                    <div className="p-4">

                      {/* Top: icon + info + expand */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 transition-all duration-300"
                          style={{
                            background: hasLimit ? `${cat.color}22` : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${hasLimit ? cat.color + '35' : 'rgba(255,255,255,0.09)'}`,
                          }}>
                          {cat.icon}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm">{cat.name}</span>
                            {isPending && (
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#F5C842' }} title="Unsaved" />
                            )}
                            {hasLimit && pct >= 100 && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: 'rgba(239,68,68,0.14)', color: '#EF4444' }}>OVER</span>
                            )}
                            {hasLimit && pct >= 80 && pct < 100 && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: 'rgba(245,158,11,0.14)', color: '#F59E0B' }}>NEAR</span>
                            )}
                          </div>

                          {hasLimit ? (
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-[11px]">
                              <span className="tabular-nums font-semibold" style={{ color: progressColor(pct) }}>
                                ${fmt(spent)}
                              </span>
                              <span style={{ color: 'var(--color-text-muted)' }}>of</span>
                              <span className="tabular-nums font-bold" style={{ color: cat.color }}>${fmt(budgetAmt)}</span>
                              <span style={{ color: 'var(--color-text-muted)' }}>·</span>
                              <span className="tabular-nums font-semibold"
                                style={{ color: remaining < 0 ? '#EF4444' : 'rgba(255,255,255,0.45)' }}>
                                {remaining < 0 ? `$${fmt(Math.abs(remaining))} over` : `$${fmt(remaining)} left`}
                              </span>
                            </div>
                          ) : (
                            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                              {spent > 0 ? `$${fmt(spent)} spent · no limit set` : 'No limit — slide to set'}
                            </p>
                          )}
                        </div>

                        {/* Expand button */}
                        <button
                          onClick={() => { setExpandedId(isExpanded ? null : cat.id); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 shrink-0 transition-all duration-200"
                          style={{ color: 'var(--color-text-muted)', cursor: 'pointer', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                      </div>

                      {/* ── Slider row ── */}
                      {(() => {
                        const fillPct   = Math.min((budgetAmt / sliderMax) * 100, 100);
                        return (
                          <div className="flex items-center gap-2.5 mt-1">
                            <span className="text-[10px] font-bold shrink-0 w-5 text-right" style={{ color: 'rgba(255,255,255,0.20)' }}>$0</span>
                            <div className="flex-1 relative">
                              <input
                                type="range"
                                min={0}
                                max={sliderMax}
                                step={SLIDER_STEP}
                                value={budgetAmt}
                                onChange={e => handleSliderChange(cat.id, Number(e.target.value))}
                                className="budget-slider w-full"
                                style={{
                                  '--thumb-color': hasLimit ? cat.color : 'rgba(255,255,255,0.30)',
                                  '--thumb-glow':  hasLimit ? cat.color + '22' : 'transparent',
                                  background: `linear-gradient(to right, ${hasLimit ? cat.color : 'rgba(255,255,255,0.22)'} 0%, ${hasLimit ? cat.color : 'rgba(255,255,255,0.22)'} ${fillPct}%, rgba(255,255,255,0.07) ${fillPct}%, rgba(255,255,255,0.07) 100%)`,
                                } as React.CSSProperties}
                              />
                              {/* Spend marker on track */}
                              {hasLimit && spent > 0 && (
                                <div className="absolute top-1/2 w-0.5 h-3 rounded-full -translate-y-1/2 pointer-events-none"
                                  style={{
                                    left: `calc(${Math.min((spent / sliderMax) * 100, 100)}% - 1px)`,
                                    background: progressColor(pct),
                                    opacity: 0.85,
                                    boxShadow: `0 0 4px ${progressColor(pct)}`,
                                  }} />
                              )}
                            </div>
                            {/* Editable amount */}
                            <input
                              type="number"
                              min={0}
                              step={SLIDER_STEP}
                              value={budgetAmt === 0 ? '' : budgetAmt}
                              placeholder="0"
                              onChange={e => {
                                const v = Math.max(0, Number(e.target.value) || 0);
                                handleSliderChange(cat.id, v);
                              }}
                              className="w-[68px] px-2 py-1 text-sm font-bold text-right outline-none rounded-lg tabular-nums shrink-0"
                              style={{
                                background: hasLimit ? `${cat.color}12` : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${hasLimit ? cat.color + '35' : 'rgba(255,255,255,0.09)'}`,
                                color: hasLimit ? cat.color : 'var(--color-text-muted)',
                              }}
                            />
                            <span className="text-[10px] shrink-0 w-6" style={{ color: 'rgba(255,255,255,0.18)' }}>
                              {fmtShort(sliderMax)}
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* ── Expanded: transactions ── */}
                    {isExpanded && (
                      <div style={{ borderTop: `1px solid ${hasLimit ? cat.color + '20' : 'var(--color-border)'}` }}>
                        {txLoading ? (
                          <p className="text-xs p-4 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
                        ) : budgetTxs.length === 0 ? (
                          <p className="text-xs p-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                            No {cat.name} transactions this month.
                          </p>
                        ) : (
                          <>
                            {/* Mini summary */}
                            <div className="flex items-center justify-between px-4 py-2.5"
                              style={{ background: hasLimit ? `${cat.color}08` : 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--color-border)' }}>
                              <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                                {budgetTxs.length} transaction{budgetTxs.length !== 1 ? 's' : ''}
                              </span>
                              <span className="text-[11px] font-bold tabular-nums" style={{ color: cat.color }}>
                                ${fmt(budgetTxs.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0))} total
                              </span>
                            </div>
                            {/* Trend chart */}
                            {spendTrend.length > 1 && (
                              <div className="h-16 px-1 pt-2 pb-0">
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={spendTrend}>
                                    <defs>
                                      <linearGradient id={`grad-${cat.id}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%"  stopColor={cat.color} stopOpacity={0.25}/>
                                        <stop offset="95%" stopColor={cat.color} stopOpacity={0}/>
                                      </linearGradient>
                                    </defs>
                                    <XAxis dataKey="date" hide />
                                    <Tooltip
                                      contentStyle={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, color: 'var(--color-text-primary)' }}
                                      formatter={(v: unknown) => [`$${fmt(Number(v))}`, 'Spent']} />
                                    <Area type="monotone" dataKey="total" stroke={cat.color} strokeWidth={2} fill={`url(#grad-${cat.id})`} dot={false} />
                                  </AreaChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                            {/* Transaction rows */}
                            <div className="flex flex-col max-h-52 overflow-y-auto">
                              {[...budgetTxs].sort((a, b) => b.date.localeCompare(a.date)).map((tx, i) => {
                                const amt = Number(tx.amount);
                                return (
                                  <div key={tx.id} className="flex items-center gap-3 px-4 py-2.5"
                                    style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : {}}>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold truncate">{tx.name}</p>
                                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                        {fmtDate(tx.date)}{tx.bankAccount ? ` · ${tx.bankAccount.accountName}` : ''}
                                      </p>
                                    </div>
                                    <span className="text-xs font-bold tabular-nums shrink-0"
                                      style={{ color: amt >= 0 ? '#22C55E' : 'var(--color-text-primary)' }}>
                                      {amt >= 0 ? '+' : '−'}${fmt(Math.abs(amt))}
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
      </main>

      {/* ── Import budget plan modal ── */}
      {copyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
          onClick={() => setCopyOpen(false)}>
          <div className="w-full max-w-sm mx-4 rounded-2xl p-5 flex flex-col gap-4"
            style={{ background: 'rgba(15,15,24,0.97)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 32px 100px rgba(0,0,0,0.7)' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold">Import budget plan</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Pick a month to import into <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{monthLabel(month)}</span>
                </p>
              </div>
              <button onClick={() => setCopyOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 shrink-0"
                style={{ color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Month list */}
            {loadingMonths ? (
              <div className="h-32 flex items-center justify-center">
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</span>
              </div>
            ) : copyVisibleMonths.filter(m => m.count > 0).length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: 'var(--color-text-muted)' }}>
                No other months with budgets found.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto"
                style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                {copyVisibleMonths.filter(m => m.count > 0).map(m => {
                  const isSelected = copyTarget === m.month;
                  return (
                    <button key={m.month} onClick={() => setCopyTarget(m.month)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-all duration-100"
                      style={isSelected
                        ? { background: 'rgba(155,109,255,0.18)', border: '1px solid rgba(155,109,255,0.5)' }
                        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}>
                      {/* Selection indicator */}
                      <div className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
                        style={{ border: isSelected ? '2px solid #9B6DFF' : '2px solid rgba(255,255,255,0.2)', background: isSelected ? '#9B6DFF' : 'transparent' }}>
                        {isSelected && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: isSelected ? '#9B6DFF' : 'var(--color-text-primary)' }}>
                          {monthLabel(m.month)}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          {m.count} limit{m.count !== 1 ? 's' : ''} set
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums shrink-0"
                        style={{ color: isSelected ? '#9B6DFF' : 'var(--color-text-primary)' }}>
                        ${fmt(m.total)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={() => setCopyOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:bg-white/10"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleCopy} disabled={copying || !copyTarget || copyTarget === month}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-150 disabled:opacity-40"
                style={{ background: 'var(--color-card-violet)', cursor: copying || !copyTarget || copyTarget === month ? 'default' : 'pointer', boxShadow: '0 4px 16px rgba(155,109,255,0.3)' }}>
                {copying ? 'Importing…' : 'Import plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
