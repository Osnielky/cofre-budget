'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useBudgetScenario, API } from '@/hooks/useBudgetScenario';
import { dailySeries, isIncomeBudget, monthsBack, shiftMonth, TREND_MONTHS } from '@/lib/budgets/assemble';
import { categoryTotals, foldOther, inCashFlow, txInMonth } from '@/lib/dashboard/derive';
import { dayOfMonth, daysInMonth, elapsedPct, roundUp50, unbudgetedSpending } from '@/lib/budgets/derive';
import type { BudgetWithSpent } from '@/lib/budgets/types';
import type { DerivedRow } from '@/lib/budgets/calculations';
import { toCents } from '@/lib/budgets/money';
import BudgetSummaryCards from '@/components/budgets/BudgetSummaryCards';
import BudgetVsActualChart from '@/components/budgets/BudgetVsActualChart';
import SpendingDistributionChart from '@/components/budgets/SpendingDistributionChart';
import CategoryBudgetEditor from '@/components/budgets/CategoryBudgetEditor';
import { BudgetHealth, BudgetQuickAdjust, BudgetSavingsImpact } from '@/components/budgets/BudgetTools';
import { BudgetScenarioToolbar, ConfirmDialog, NoticeToast } from '@/components/budgets/BudgetScenarioToolbar';
import BudgetFormModal, { type BudgetFormRequest } from '@/components/budgets/BudgetFormModal';
import ImportPlanModal from '@/components/budgets/ImportPlanModal';
import SetAllModal from '@/components/budgets/SetAllModal';
import ActionsPanel from '@/components/budgets/ActionsPanel';
import TargetsPanel from '@/components/budgets/TargetsPanel';
import PlanHistory from '@/components/budgets/PlanHistory';
import BudgetRowDetail from '@/components/budgets/BudgetRowDetail';
import { Icon } from '@/components/budgets/ui';

function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
function lastDayLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, daysInMonth(m)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const headerBtn = 'px-3 py-2 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 hover:bg-[var(--color-surface)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';
const headerBtnStyle = { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' };

export default function BudgetsPage() {
  const s = useBudgetScenario();
  const { plan, dispatch, month } = s;
  const router = useRouter();

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [formReq, setFormReq] = useState<BudgetFormRequest | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [setAllOpen, setSetAllOpen] = useState(false);
  const [pending, setPending] = useState<{ kind: 'month'; month: string } | { kind: 'nav'; href: string } | null>(null);

  // A new month is a new scenario: drop per-row UI state.
  useEffect(() => { setSelected(new Set()); setExpanded(new Set()); }, [month]);

  /* ── Derived view data ── */
  const monthTxs = useMemo(() => txInMonth(s.txs, month), [s.txs, month]);
  const slices = useMemo(() => foldOther(categoryTotals(monthTxs, 'expense'), 7), [monthTxs]);
  const trendLabels = useMemo(() => monthsBack(month, TREND_MONTHS).map((m) => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1).toLocaleString('en-US', { month: 'short' });
  }), [month]);
  const points = useMemo(
    () => dailySeries(s.txs, month, s.now, plan.totalBudgetCents, plan.expectedIncomeCents),
    [s.txs, month, s.now, plan.totalBudgetCents, plan.expectedIncomeCents],
  );
  const todayDay = s.isCurrentMonth ? s.now.getDate() : null;
  const targets = useMemo(() => s.budgets.filter(isIncomeBudget).sort((a, b) => b.percentage - a.percentage), [s.budgets]);
  const budgetCount = plan.rows.filter((r) => r.budgetId).length;

  // The existing panels (actions, row detail) read server-shaped budgets; feed
  // them the draft amounts so their advice always matches what's on screen.
  const draftedSpending = useMemo<BudgetWithSpent[]>(() => {
    const byId = new Map(plan.rows.filter((r) => r.budgetId).map((r) => [r.budgetId as string, r]));
    return s.budgets.filter((b) => !isIncomeBudget(b)).flatMap((b) => {
      const r = byId.get(b.id);
      if (!r) return [];
      return [{
        ...b, amount: r.budgetCents / 100, spent: r.spentCents / 100, remaining: r.remainingCents / 100,
        percentage: r.usagePct == null ? 0 : Math.round(r.usagePct),
      }];
    });
  }, [s.budgets, plan.rows]);
  const unbudgeted = useMemo(() => unbudgetedSpending(monthTxs.filter(inCashFlow), s.budgets), [monthTxs, s.budgets]);
  const dLeft = daysInMonth(month) - dayOfMonth(month, s.now);
  const remaining = plan.underBudgetCents / 100;
  const totalTarget = plan.expectedIncomeCents / 100;
  const totalEarned = plan.incomeTargetReceivedCents / 100;

  /* ── Row handlers (stable, so memoized rows don't re-render) ── */
  const onToggleSelect = useCallback((key: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  }), []);
  const onSelectMany = useCallback((keys: string[], on: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    for (const k of keys) { if (on) next.add(k); else next.delete(k); }
    return next;
  }), []);
  const onToggleExpand = useCallback((key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  }), []);
  const budgetsRef = s.budgets;
  const onEditDetails = useCallback((key: string) => {
    const b = budgetsRef.find((x) => x.id === key);
    if (b) setFormReq({ kind: 'expense', editing: b });
  }, [budgetsRef]);
  const { refresh, setNotice } = s;
  const onDelete = useCallback(async (key: string) => {
    setDeletingKey(key);
    try {
      const res = await fetch(`${API}/budgets/${key}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      await refresh();
    } catch {
      setNotice({ tone: 'error', text: 'Couldn’t delete that budget. Try again.' });
    } finally {
      setDeletingKey(null);
    }
  }, [refresh, setNotice]);

  /* ── Alerts → scroll to, highlight and focus the row ── */
  const onReveal = useCallback((key: string) => {
    setRevealKey(`${key}#${Date.now()}`);
    setFlashKey(key);
    window.setTimeout(() => {
      const el = document.getElementById(`budget-row-${key}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.querySelector<HTMLInputElement>('[data-budget-input]')?.focus({ preventScroll: true });
    }, 80);
    window.setTimeout(() => setFlashKey((k) => (k === key ? null : k)), 1900);
  }, []);

  /* ── Panel actions edit the draft instead of saving immediately ── */
  const onRaise = useCallback((b: BudgetWithSpent, newAmount: number) => {
    dispatch({ type: 'checkpoint' });
    dispatch({ type: 'set', key: b.id, cents: toCents(newAmount) });
    onReveal(b.id);
  }, [dispatch, onReveal]);
  const rowKeys = useMemo(() => new Set(plan.rows.map((r) => r.key)), [plan.rows]);
  const onSetUnbudgeted = useCallback((categoryId: string) => {
    const key = `new:${categoryId}`;
    if (rowKeys.has(key)) onReveal(key);
    else setFormReq({ kind: 'expense', editing: null, presetCategoryId: categoryId });
  }, [rowKeys, onReveal]);
  const renderDetail = useCallback((r: DerivedRow) => {
    const b = r.budgetId ? draftedSpending.find((x) => x.id === r.budgetId) : undefined;
    if (!b) return null;
    const raiseTo = roundUp50(Math.max(r.spentCents, r.budgetCents) / 100);
    return (
      <BudgetRowDetail budget={b} txs={monthTxs.filter((t) => t.categoryRef?.id === r.categoryId && inCashFlow(t))}
        avg3mo={r.categoryId ? s.categoryAverages[r.categoryId] : undefined} raiseTo={raiseTo}
        onRaise={() => onRaise(b, raiseTo)} onDelete={() => onDelete(b.id)} deleting={deletingKey === b.id} />
    );
  }, [draftedSpending, monthTxs, s.categoryAverages, onRaise, onDelete, deletingKey]);

  /* ── Unsaved-changes guards ── */
  const changeMonth = (m: string) => {
    if (s.dirty) setPending({ kind: 'month', month: m });
    else s.setMonth(m);
  };
  useEffect(() => {
    if (!s.dirty) return;
    // Intercept in-app link clicks (sidebar etc.) so drafts aren't lost silently.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.origin !== window.location.origin) return;
      if (a.pathname === window.location.pathname) return;
      e.preventDefault();
      setPending({ kind: 'nav', href: a.pathname + a.search + a.hash });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [s.dirty]);
  const confirmPending = () => {
    if (!pending) return;
    if (pending.kind === 'month') { dispatch({ type: 'resetAll' }); s.setMonth(pending.month); }
    else router.push(pending.href);
    setPending(null);
  };
  const cancelPending = useCallback(() => setPending(null), []);

  // Ctrl/Cmd+S saves the scenario.
  const { save, dirty, saving } = s;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && dirty) {
        e.preventDefault();
        if (!saving) save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, saving, save]);

  const setAllCurrent = useMemo(
    () => new Map(plan.rows.filter((r) => r.categoryId).map((r) => [r.categoryId!, { budgetId: r.budgetId, amount: r.budgetCents / 100 }])),
    [plan.rows],
  );

  const addBudgetBtn = (
    <button type="button" onClick={() => setFormReq({ kind: 'expense', editing: null })}
      className="px-4 py-2 text-xs font-bold text-white rounded-xl hover:brightness-110 transition-all flex items-center gap-1.5 cursor-pointer"
      style={{ background: 'var(--color-violet)' }}>
      <Icon name="plus" size={13} strokeWidth={2.4} /> Add budget
    </button>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto pt-14 md:pt-0 flex flex-col">

        {/* ── Header ── */}
        <header className="relative md:sticky md:top-0 z-20 px-4 sm:px-6 pt-5 pb-4 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: 'var(--header-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderBottom: '1px solid var(--color-border)' }}>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Budgets</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Adjust your budgets and see the impact instantly across your entire plan.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
              <button type="button" onClick={() => changeMonth(shiftMonth(month, -1))} aria-label="Previous month"
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--color-surface)] cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
                <Icon name="chevL" size={14} strokeWidth={2.2} />
              </button>
              <span className="text-sm font-semibold px-2 min-w-36 text-center flex items-center justify-center gap-1.5">
                <Icon name="calendar" size={13} /> {monthLabel(month)}
              </span>
              <button type="button" onClick={() => changeMonth(shiftMonth(month, 1))} disabled={s.isCurrentMonth} aria-label="Next month"
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--color-surface)] disabled:opacity-30 cursor-pointer disabled:cursor-default" style={{ color: 'var(--color-text-muted)' }}>
                <Icon name="chevR" size={14} strokeWidth={2.2} />
              </button>
            </div>
            <button type="button" onClick={() => setImportOpen(true)} disabled={s.dirty} className={headerBtn} style={headerBtnStyle}
              title={s.dirty ? 'Save or discard your draft changes before importing a plan' : 'Copy another month’s plan into this month'}>
              <Icon name="layers" size={13} /> Import plan
            </button>
            <button type="button" onClick={() => setSetAllOpen(true)} className={headerBtn} style={headerBtnStyle}>
              <Icon name="list" size={13} /> Set all
            </button>
            {addBudgetBtn}
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
              Day {dayOfMonth(month, s.now)} of {daysInMonth(month)}
            </span>
          </div>
        </header>

        <div className="flex-1 px-4 sm:px-6 py-5 flex flex-col gap-4 sm:gap-5">
          {s.loadError && (
            <div role="alert" className="px-4 py-3 rounded-xl text-xs flex items-center gap-2"
              style={{ background: 'color-mix(in srgb, var(--color-rose) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 40%, transparent)' }}>
              <Icon name="alert" size={14} /> Couldn’t load budget data. Check your connection and reload the page.
            </div>
          )}

          {s.loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" aria-busy="true" aria-label="Loading budgets">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
              ))}
              <div className="col-span-full h-72 rounded-2xl animate-pulse" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
            </div>
          ) : (
            <>
              {/* A — Summary */}
              <BudgetSummaryCards plan={plan} categoryCount={budgetCount} />

              {/* B — Visualizations */}
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)] gap-4 sm:gap-5">
                <BudgetVsActualChart points={points} todayDay={todayDay} hasIncome={plan.expectedIncomeCents > 0} />
                <SpendingDistributionChart slices={slices} totalCents={plan.totalSpentCents} />
              </div>

              {/* C — Editor + tools */}
              <div className="grid grid-cols-1 desk:grid-cols-[minmax(0,1fr)_300px] gap-4 sm:gap-5 items-start">
                <div className="min-w-0 order-2 desk:order-1 flex flex-col gap-4 sm:gap-5">
                  <CategoryBudgetEditor rows={plan.rows} health={plan.health} monthTxs={monthTxs} trendLabels={trendLabels}
                    selected={selected} expanded={expanded} flashKey={flashKey} deletingKey={deletingKey} revealKey={revealKey}
                    onSelectMany={onSelectMany} emptyAction={addBudgetBtn} renderDetail={renderDetail}
                    dispatch={dispatch} onToggleSelect={onToggleSelect} onToggleExpand={onToggleExpand}
                    onEditDetails={onEditDetails} onDelete={onDelete} />
                  {/* Income targets (feed Expected Income) + plan history */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 items-start">
                    <TargetsPanel targets={targets} projects={s.projects} totalTarget={totalTarget} totalEarned={totalEarned}
                      earnPct={totalTarget > 0 ? Math.round((totalEarned / totalTarget) * 100) : 0} lastDayLabel={lastDayLabel(month)}
                      onAdd={() => setFormReq({ kind: 'income', editing: null })}
                      onEdit={(t) => setFormReq({ kind: 'income', editing: t })}
                      onDelete={onDelete} deletingId={deletingKey} />
                    <PlanHistory history={s.history} currentMonth={month} elapsedPct={elapsedPct(month, s.now)}
                      onImport={() => { if (!s.dirty) setImportOpen(true); }} onSetAll={() => setSetAllOpen(true)} />
                  </div>
                </div>
                <aside aria-label="Budget tools"
                  className="order-1 desk:order-2 grid grid-cols-1 md:grid-cols-2 desk:grid-cols-1 gap-4">
                  <BudgetQuickAdjust rows={plan.rows} draft={s.draft} dispatch={dispatch} selected={selected}
                    canUndo={s.canUndo} modifiedCount={plan.modifiedCount} />
                  <BudgetSavingsImpact plan={plan} />
                  <BudgetHealth plan={plan} uncategorizedCents={s.assembled.uncategorizedCents} onReveal={onReveal} />
                  <ActionsPanel spending={draftedSpending} unbudgeted={unbudgeted} month={month} now={s.now}
                    daysLeft={dLeft} totalRemaining={remaining} budgetPerDay={dLeft > 0 ? +(remaining / dLeft).toFixed(2) : 0}
                    onRaise={onRaise} onSetUnbudgeted={onSetUnbudgeted} />
                </aside>
              </div>

            </>
          )}
        </div>

        <BudgetScenarioToolbar plan={plan} saving={s.saving} onSave={s.save} onDiscard={() => dispatch({ type: 'resetAll' })} />
      </main>

      <NoticeToast notice={s.notice} onClose={() => s.setNotice(null)} />

      <ConfirmDialog open={!!pending} title="Discard unsaved changes?"
        body={<>You have {plan.modifiedCount} unsaved budget change{plan.modifiedCount === 1 ? '' : 's'}. {pending?.kind === 'month' ? 'Switching months' : 'Leaving this page'} will discard them.</>}
        confirmLabel="Discard changes" onConfirm={confirmPending} onCancel={cancelPending} />

      {formReq && (
        <BudgetFormModal request={formReq} month={month} categories={s.categories} projects={s.projects} budgets={s.budgets} wideTxs={s.txs}
          onClose={() => setFormReq(null)} onSaved={refresh} />
      )}
      {importOpen && <ImportPlanModal month={month} onClose={() => setImportOpen(false)} onImported={refresh} />}
      {setAllOpen && (
        <SetAllModal month={month} categories={s.categories} current={setAllCurrent} onClose={() => setSetAllOpen(false)}
          onSaved={(n) => { refresh(); setNotice({ tone: 'success', text: `Saved ${n} budget${n === 1 ? '' : 's'}.` }); }} />
      )}
    </div>
  );
}
