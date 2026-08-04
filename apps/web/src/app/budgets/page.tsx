'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Sidebar from '@/components/Sidebar';
import {
  daysInMonth, dayOfMonth, elapsedPct, splitBudgets, monthTotals,
  unbudgetedSpending, burnSeries, categoryTrend,
} from '@/lib/budgets/derive';
import type { CategoryTrendPoint } from '@/lib/budgets/derive';
import type { Category, Project, BudgetWithSpent, Transaction, MonthSummary, HistoryPoint } from '@/lib/budgets/types';
import PlanFlow from '@/components/budgets/PlanFlow';
import BurnChart from '@/components/budgets/BurnChart';
import ActionsPanel from '@/components/budgets/ActionsPanel';
import BudgetTable from '@/components/budgets/BudgetTable';
import type { SortKey } from '@/components/budgets/BudgetTable';
import TargetsPanel from '@/components/budgets/TargetsPanel';
import PlanHistory from '@/components/budgets/PlanHistory';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

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
function monthsAgoKey(m: string, n: number) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthFrom(m: string) { return `${m}-01`; }
function monthTo(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).toISOString().slice(0, 10);
}
function fmt(n: number) { return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }
function lastDayLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, daysInMonth(m)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function BudgetsPage() {
  const now = useMemo(() => new Date(), []);
  const [month, setMonth]           = useState(() => new Date().toISOString().slice(0, 7));
  const [budgets, setBudgets]       = useState<BudgetWithSpent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects]     = useState<Project[]>([]);
  const [loading, setLoading]       = useState(true);

  const [wideTxs, setWideTxs]       = useState<Transaction[]>([]);
  const [history, setHistory]       = useState<HistoryPoint[]>([]);
  const [categoryAverages, setCategoryAverages] = useState<Record<string, number>>({});

  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm]             = useState({ categoryId: '', amount: '', projectId: '', projectCategoryId: '' });
  const [sort, setSort]             = useState<SortKey>('risk');
  const [catDropOpen, setCatDropOpen] = useState(false);
  const [projectDropOpen, setProjectDropOpen] = useState(false);
  const [formKind, setFormKind]     = useState<'expense' | 'income'>('expense');
  const [formError, setFormError]   = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [importOpen, setImportOpen]       = useState(false);
  const [importTarget, setImportTarget]   = useState('');
  const [importing, setImporting]         = useState(false);
  const [monthList, setMonthList]         = useState<MonthSummary[]>([]);
  const [loadingMonths, setLoadingMonths] = useState(false);

  const [setAllOpen, setSetAllOpen]     = useState(false);
  const [setAllRows, setSetAllRows]     = useState<{ categoryId: string; amount: string }[]>([]);
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
    setSetAllOpen(true);
  }

  function setRowAmount(categoryId: string, amount: string) {
    setSetAllRows((rows) => rows.map((r) => (r.categoryId === categoryId ? { ...r, amount } : r)));
  }

  function fillAllFromAverage() {
    setSetAllRows((rows) => rows.map((r) => {
      const avg = categoryAverages[r.categoryId];
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
        fetch(`${API}/projects`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/transactions?from=${monthFrom(monthsAgoKey(month, 5))}&to=${monthTo(month)}&limit=3000`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/budgets/history?months=6`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API}/budgets/category-averages?months=3`, { credentials: 'include' }).then((r): Promise<Record<string, number>> => (r.ok ? r.json() : Promise.resolve({}))),
      ]))
      .then(([b, c, p, tx, h, avgs]) => {
        setBudgets(Array.isArray(b) ? b : []);
        setCategories(Array.isArray(c) ? c : []);
        setProjects(Array.isArray(p) ? p : []);
        setWideTxs(Array.isArray(tx) ? tx : []);
        setHistory(Array.isArray(h) ? h : []);
        setCategoryAverages(avgs && typeof avgs === 'object' ? avgs : {});
      }).catch(() => {}).finally(() => setLoading(false));
  }, [month]);

  /* ── Derived data ── */
  const { spending, targets } = useMemo(() => splitBudgets(budgets), [budgets]);
  const monthTxs = useMemo(() => wideTxs.filter((t) => t.date.startsWith(month)), [wideTxs, month]);
  const unbudgeted = useMemo(() => unbudgetedSpending(monthTxs, budgets), [monthTxs, budgets]);
  const burn = useMemo(() => burnSeries(monthTxs, budgets, month, now), [monthTxs, budgets, month, now]);
  const totals = useMemo(() => monthTotals(spending, month, now), [spending, month, now]);

  const txsByCategory = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of monthTxs) {
      const id = t.categoryRef?.id;
      if (!id) continue;
      const list = map.get(id) ?? [];
      list.push(t);
      map.set(id, list);
    }
    return map;
  }, [monthTxs]);

  const trendByCategory = useMemo(() => {
    const map = new Map<string, CategoryTrendPoint[]>();
    for (const b of spending) {
      if (!b.categoryId || map.has(b.categoryId)) continue;
      map.set(b.categoryId, categoryTrend(wideTxs, b.categoryId, month, 6));
    }
    return map;
  }, [spending, wideTxs, month]);

  const unbudgetedTotal = +unbudgeted.reduce((s, u) => s + u.total, 0).toFixed(2);
  const combinedSpent = +(totals.totalSpent + unbudgetedTotal).toFixed(2);
  const combinedRemaining = +(totals.totalBudget - combinedSpent).toFixed(2);
  const dLeft = daysInMonth(month) - dayOfMonth(month, now);
  const combinedPerDay = dLeft > 0 ? +(combinedRemaining / dLeft).toFixed(2) : 0;

  const totalTarget = targets.reduce((s, b) => s + Number(b.amount), 0);
  const totalEarned = targets.reduce((s, b) => s + Number(b.spent), 0);
  const earnPct = totalTarget > 0 ? Math.round((totalEarned / totalTarget) * 100) : 0;
  const plannedSavings = totalTarget - totals.totalBudget;
  const actualSoFar = totalEarned - combinedSpent;
  const projectedSavings = totalTarget - (totals.totalProjected + unbudgetedTotal);

  const isCurrentMonth = month === new Date().toISOString().slice(0, 7);

  const usedIds   = new Set(budgets.map(b => b.categoryId));
  const available = categories.filter(c => (formKind === 'income'
    ? c.type === 'income'
    : c.type !== 'transfer' && c.type !== 'income')
    && (!usedIds.has(c.id) || c.id === form.categoryId));

  function openAddBudget(prefillCategoryId?: string) {
    setFormKind('expense'); setEditingId(null); setFormError(null);
    setForm({ categoryId: prefillCategoryId ?? '', amount: '', projectId: '', projectCategoryId: '' });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    setFormError(null);

    const selProj = projects.find(p => p.id === form.projectId);
    const isProjectCatMode = !!selProj && formKind === 'income';
    if (!editingId) {
      if (isProjectCatMode && !form.projectCategoryId) {
        setFormError('Please select a project category.');
        return;
      }
      if (!isProjectCatMode && !form.categoryId) {
        setFormError('Please select a category.');
        return;
      }
    }

    setFormSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`${API}/budgets/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ amount: amt, projectId: form.projectId || null }) });
        if (!res.ok) throw new Error('Failed to update budget');
        const prev = budgets.find(b => b.id === editingId);
        const spentAmt = prev?.spent ?? 0;
        setBudgets(bs => bs.map(b => b.id === editingId ? { ...b, amount: amt, projectId: form.projectId || null, project: projects.find(p => p.id === form.projectId) ?? null, percentage: amt > 0 ? Math.round((spentAmt / amt) * 100) : 0, remaining: amt - spentAmt } : b));
      } else {
        const body = form.projectCategoryId
          ? { projectCategoryId: form.projectCategoryId, amount: amt, month, projectId: form.projectId || null }
          : { categoryId: form.categoryId, amount: amt, month, projectId: form.projectId || null };
        const res = await fetch(`${API}/budgets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        if (!res.ok) throw new Error('Failed to save budget');
        const created = await res.json();
        const cat = categories.find(c => c.id === form.categoryId);
        const selProj2 = projects.find(p => p.id === form.projectId);
        setBudgets(bs => [...bs, { ...created, category: cat ?? created.category, project: selProj2 ?? null, amount: amt, spent: 0, percentage: 0, remaining: amt }]);
      }
      setShowForm(false); setEditingId(null); setProjectDropOpen(false); setForm({ categoryId: '', amount: '', projectId: '', projectCategoryId: '' });
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`${API}/budgets/${id}`, { method: 'DELETE', credentials: 'include' });
    setBudgets(bs => bs.filter(b => b.id !== id));
    if (expandedId === id) setExpandedId(null);
    setDeletingId(null);
  }

  async function handleRaise(b: BudgetWithSpent, newAmount: number) {
    const res = await fetch(`${API}/budgets/${b.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ amount: newAmount, projectId: b.projectId ?? null }),
    });
    if (!res.ok) return;
    const spentAmt = Number(b.spent);
    setBudgets(bs => bs.map(x => x.id === b.id
      ? { ...x, amount: newAmount, percentage: newAmount > 0 ? Math.round((spentAmt / newAmount) * 100) : 0, remaining: newAmount - spentAmt }
      : x));
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">

        {/* ── Sticky header ── */}
        <div className="sticky top-14 md:top-0 z-20 px-6 pt-5 pb-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: 'var(--header-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Budgets &amp; Targets</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Day {dayOfMonth(month, now)} of {daysInMonth(month)} · {spending.length} spending budget{spending.length === 1 ? '' : 's'} · {targets.length} income target{targets.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            <button onClick={() => openAddBudget()}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all flex items-center gap-1.5"
              style={{ background: 'var(--color-card-violet)' }}>
              <span className="text-base leading-none">+</span> Add Budget
            </button>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {loading ? (
            <p className="text-xs text-center py-12" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 items-start">

              {/* Row 1, left — plan flow + burn chart */}
              <div className="flex flex-col gap-4 p-5 rounded-2xl"
                style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-[10.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>The plan, and where it stands</span>
                  <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>every figure below is for {monthLabel(month).split(' ')[0]}</span>
                </div>
                <PlanFlow
                  totalTarget={totalTarget} totalEarned={totalEarned} earnPct={earnPct}
                  totalBudget={totals.totalBudget} spendingCount={spending.length}
                  combinedSpent={combinedSpent} budgetedSpent={totals.totalSpent} unbudgetedTotal={unbudgetedTotal}
                  plannedSavings={plannedSavings} actualSoFar={actualSoFar} projectedSavings={projectedSavings} />
                <BurnChart month={month} now={now} series={burn}
                  totalBudget={totals.totalBudget} overallPct={totals.overallPct} totalProjected={totals.totalProjected} />
              </div>

              {/* Row 1, right — actions */}
              <ActionsPanel spending={spending} unbudgeted={unbudgeted} month={month} now={now}
                daysLeft={dLeft} totalRemaining={combinedRemaining} budgetPerDay={combinedPerDay}
                onRaise={handleRaise} onSetUnbudgeted={(categoryId) => openAddBudget(categoryId)} />

              {/* Row 2, left — table */}
              <BudgetTable spending={spending} unbudgeted={unbudgeted} month={month} now={now}
                sort={sort} onSortChange={setSort} expandedId={expandedId} onToggleExpand={(id) => setExpandedId((cur) => cur === id ? null : id)}
                txsByCategory={txsByCategory} trendByCategory={trendByCategory} categoryAverages={categoryAverages}
                onEdit={(b) => { setFormKind('expense'); setEditingId(b.id); setForm({ categoryId: b.categoryId ?? '', amount: String(b.amount), projectId: b.projectId ?? '', projectCategoryId: '' }); setShowForm(true); }}
                onDelete={handleDelete} onRaise={handleRaise} deletingId={deletingId}
                onSetUnbudgeted={(categoryId) => openAddBudget(categoryId)} />

              {/* Row 2, right rail */}
              <div className="flex flex-col gap-4">
                <TargetsPanel targets={targets} projects={projects} totalTarget={totalTarget} totalEarned={totalEarned} earnPct={earnPct}
                  lastDayLabel={lastDayLabel(month)}
                  onAdd={() => { setFormKind('income'); setEditingId(null); setFormError(null); setForm({ categoryId: '', amount: '', projectId: '', projectCategoryId: '' }); setShowForm(true); }}
                  onEdit={(t) => { setFormKind('income'); setEditingId(t.id); setFormError(null); setForm({ categoryId: t.categoryId ?? '', amount: String(t.amount), projectId: t.projectId ?? '', projectCategoryId: t.projectCategoryId ?? '' }); setShowForm(true); }}
                  onDelete={handleDelete} deletingId={deletingId} />
                <PlanHistory history={history} currentMonth={month} elapsedPct={elapsedPct(month, now)}
                  onImport={() => setImportOpen(true)} onSetAll={openSetAll} />
              </div>
            </div>
          )}
        </div>

        {/* ── Add / Edit modal ── */}
        {showForm && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null); setCatDropOpen(false); setProjectDropOpen(false); setForm({ categoryId: '', amount: '', projectId: '', projectCategoryId: '' }); } }}>
            {(() => {
              const selProj = projects.find(p => p.id === form.projectId);
              const selCat = categories.find(c => c.id === form.categoryId)
                ?? (form.projectCategoryId ? selProj?.categories?.find(c => c.id === form.projectCategoryId) : undefined);
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
                    <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setCatDropOpen(false); setProjectDropOpen(false); setForm({ categoryId: '', amount: '', projectId: '', projectCategoryId: '' }); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] shrink-0"
                      style={{ color: 'var(--color-text-muted)' }}>✕</button>
                  </div>

                  <div className="flex flex-col gap-4 px-5 py-4">
                    {/* Project picker — income targets only, shown FIRST */}
                    {formKind === 'income' && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                          Project <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                        </span>
                        <div style={{ position: 'relative' }}>
                          {(() => {
                            const selProj2 = projects.find(p => p.id === form.projectId);
                            const projColor = selProj2?.color ?? '#9B6DFF';
                            return (
                              <>
                                <button type="button" onClick={() => setProjectDropOpen(o => !o)}
                                  className="w-full px-3 py-2.5 text-sm flex items-center gap-2.5 rounded-xl outline-none text-left"
                                  style={{ background: 'var(--color-surface)', border: `1px solid ${selProj2 ? projColor + '44' : 'var(--color-border)'}`, color: selProj2 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                                  {selProj2 ? (
                                    <><span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${projColor}20` }}>{selProj2.icon}</span>
                                    <span className="flex-1 font-medium" style={{ color: projColor }}>{selProj2.name}</span></>
                                  ) : <span className="flex-1">Select a project…</span>}
                                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0, transform: projectDropOpen ? 'rotate(180deg)' : undefined }}>
                                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                                {projectDropOpen && (
                                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden overflow-y-auto"
                                    style={{ background: 'var(--popover-bg)', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)', zIndex: 10, maxHeight: '50vh' }}>
                                    <button type="button"
                                      onClick={() => { setForm(f => ({ ...f, projectId: '', categoryId: '' })); setProjectDropOpen(false); }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                      style={{ background: form.projectId === '' ? 'rgba(155,109,255,0.08)' : 'transparent', color: form.projectId === '' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
                                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(155,109,255,0.06)')}
                                      onMouseLeave={e => (e.currentTarget.style.background = form.projectId === '' ? 'rgba(155,109,255,0.08)' : 'transparent')}>
                                      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: 'rgba(155,109,255,0.12)' }}>—</span>
                                      <span className="font-medium">None</span>
                                    </button>
                                    {projects.filter(p => p.status === 'active').map(p => {
                                      const pc = p.color ?? '#9B6DFF';
                                      return (
                                        <button key={p.id} type="button"
                                          onClick={() => { setForm(f => ({ ...f, projectId: p.id, categoryId: '' })); setProjectDropOpen(false); }}
                                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                          style={{ background: form.projectId === p.id ? `${pc}18` : 'transparent', color: form.projectId === p.id ? pc : 'var(--color-text-primary)' }}
                                          onMouseEnter={e => (e.currentTarget.style.background = `${pc}12`)}
                                          onMouseLeave={e => (e.currentTarget.style.background = form.projectId === p.id ? `${pc}18` : 'transparent')}>
                                          <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${pc}20` }}>{p.icon}</span>
                                          <span className="font-medium">{p.name}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Category picker */}
                    {(() => {
                      const selProj2 = formKind === 'income' ? projects.find(p => p.id === form.projectId) : null;
                      const projCats = selProj2?.categories ?? [];
                      const catList: { id: string; name: string; icon: string; color: string }[] =
                        selProj2 ? projCats : available;
                      const isProjectCatMode = !!selProj2 && formKind === 'income';
                      const activeCatId = isProjectCatMode ? form.projectCategoryId : form.categoryId;
                      return (
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
                            {catList.length === 0 && (
                              <p className="px-3 py-2.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>No categories available</p>
                            )}
                            {catList.map(c => (
                              <button key={c.id} type="button"
                                onClick={() => {
                                  if (isProjectCatMode) {
                                    setForm(f => ({ ...f, projectCategoryId: c.id, categoryId: '' }));
                                  } else {
                                    setForm(f => ({ ...f, categoryId: c.id, projectCategoryId: '' }));
                                  }
                                  setCatDropOpen(false);
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors"
                                style={{ background: activeCatId === c.id ? `${c.color}18` : 'transparent', color: activeCatId === c.id ? c.color : 'var(--color-text-primary)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = `${c.color}12`)}
                                onMouseLeave={e => (e.currentTarget.style.background = activeCatId === c.id ? `${c.color}18` : 'transparent')}>
                                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${c.color}20` }}>{c.icon}</span>
                                <span className="font-medium">{c.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                      );
                    })()}

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

                  <div className="flex flex-col gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                    {formError && (
                      <p className="text-xs font-medium text-center" style={{ color: 'var(--color-rose)' }}>{formError}</p>
                    )}
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setCatDropOpen(false); setProjectDropOpen(false); setForm({ categoryId: '', amount: '', projectId: '', projectCategoryId: '' }); setFormError(null); }}
                        className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-[var(--color-elevated)] transition-colors"
                        style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
                      <button type="submit" disabled={formSaving}
                        className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 transition-all disabled:opacity-60"
                        style={{ background: accent }}>
                        {formSaving ? 'Saving…' : editingId ? 'Save Changes' : (formKind === 'income' ? 'Create Target' : 'Create Budget')}
                      </button>
                    </div>
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

              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>Set monthly budgets</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {monthLabel(month)} · set every category at once. “Avg” is your typical spend over the last 3 months.
                </p>
              </div>

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

              <div className="overflow-y-auto px-2 py-2" style={{ flex: 1 }}>
                {setAllRows.length === 0 ? (
                  <p className="text-xs text-center py-10" style={{ color: 'var(--color-text-muted)' }}>
                    No expense categories yet. Create categories first in Settings.
                  </p>
                ) : setAllRows.map((row) => {
                  const cat = categories.find((c) => c.id === row.categoryId);
                  const avg = categoryAverages[row.categoryId];
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
