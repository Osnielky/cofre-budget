'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { useUser } from '@/components/UserProvider';
import { useThemeColors } from '@/components/ThemeProvider';
import { useDashboardData } from '@/hooks/useDashboardData';
import { usePanelMonth, useMonthBudgets } from '@/hooks/usePanelMonth';
import { monthOptionKeys } from '@/lib/dashboard/panelMonth';
import PeriodSelect from '@/components/dashboard/PeriodSelect';
import { isLiability } from '@/lib/accountTypes';
import {
  monthlyCashFlow, trendSeries, categoryTotals, categoryMonthly, categoryTrendGroups, foldOther, txInMonth,
  fixedVariable, netWorthBreakdown,
  expenseChanges, topMerchants, inCashFlow, savedTotal, dailyCumulative,
} from '@/lib/dashboard/derive';
import type { Budget } from '@/lib/dashboard/types';
import StatCardsRow, { type StatCardDef } from '@/components/dashboard/StatCardsRow';
import IncomeExpensesPanel from '@/components/dashboard/panels/IncomeExpensesPanel';
import CashFlowTrendPanel from '@/components/dashboard/panels/CashFlowTrendPanel';
import CategoryDonutPanel from '@/components/dashboard/panels/CategoryDonutPanel';
import CategoryRankingPanel from '@/components/dashboard/panels/CategoryRankingPanel';
import BudgetActualPanel from '@/components/dashboard/panels/BudgetActualPanel';
// Hidden for now in favour of CategoryTrendPanel — restore with the JSX below.
// import SpendingCalendarPanel from '@/components/dashboard/panels/SpendingCalendarPanel';
// import SpendingPacePanel from '@/components/dashboard/panels/SpendingPacePanel';
import CategoryTrendPanel from '@/components/dashboard/panels/CategoryTrendPanel';
import FixedVariablePanel from '@/components/dashboard/panels/FixedVariablePanel';
import RecurringTimelinePanel from '@/components/dashboard/panels/RecurringTimelinePanel';
import NetWorthGoalPanel from '@/components/dashboard/panels/NetWorthGoalPanel';
import NetWorthPanel from '@/components/dashboard/panels/NetWorthPanel';
import ExpenseChangePanel from '@/components/dashboard/panels/ExpenseChangePanel';
import TopMerchantsPanel from '@/components/dashboard/panels/TopMerchantsPanel';
import SubscriptionsPanel from '@/components/dashboard/panels/SubscriptionsPanel';
import ProjectsPanel from '@/components/dashboard/panels/ProjectsPanel';
import AccountsPanel from '@/components/dashboard/panels/AccountsPanel';
import RecentTransactionsPanel from '@/components/dashboard/panels/RecentTransactionsPanel';

function currentMonth() { return new Date().toISOString().slice(0, 7); }
function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
function monthShort(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'short' });
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
function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2 }); }
/** 'ytd' or a YYYY-MM key -> the label shown as the panel subtitle. */
function periodLabel(p: string): string {
  if (p === 'ytd') return 'Year to date';
  const [y, m] = p.split('-').map(Number);
  return new Date(y, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { month, setMonth, transactions, yearTx, accounts, budgets, projects, debts, loading, error, reload } = useDashboardData();
  const { user } = useUser();
  const tc = useThemeColors();
  const now = new Date();

  // Each donut filters independently, so income and expenses can be compared
  // across different periods. 'ytd' is the default.
  const [incomePeriod, setIncomePeriod] = useState('ytd');
  const [expensePeriod, setExpensePeriod] = useState('ytd');

  // Only offer months that actually have transactions. yearTx starts at Jan 1,
  // so earlier months are not selectable without a wider fetch.
  const periodOptions = useMemo(() => {
    const months = [...new Set(yearTx.map((t) => t.date.slice(0, 7)))].sort().reverse();
    return [{ value: 'ytd', label: 'Year to date' }, ...months.map((m) => ({ value: m, label: periodLabel(m) }))];
  }, [yearTx]);

  // Ranking and budget panels each pick their own month; they follow the
  // header month until the user chooses another one.
  const [rankMonth, setRankMonth] = usePanelMonth(month);
  const [budgetMonth, setBudgetMonth] = usePanelMonth(month);
  const budgetPanel = useMonthBudgets(budgetMonth, month, budgets);
  // Hidden with the calendar and pace panels:
  // const [calMonth, setCalMonth] = usePanelMonth(month);
  // const [paceMonth, setPaceMonth] = usePanelMonth(month);
  // const pacePanel = useMonthBudgets(paceMonth, month, budgets);

  // Category trends: null means "the biggest category of that kind this year".
  const [incomeTrendCat, setIncomeTrendCat] = useState<string | null>(null);
  const [trendCat, setTrendCat] = useState<string | null>(null);
  const monthPicker = (value: string, onChange: (m: string) => void, panel: string) => (
    <PeriodSelect value={value} onChange={onChange} ariaLabel={`${panel} month`}
      options={monthOptionKeys(yearTx.map((t) => t.date), month, value).map((m) => ({ value: m, label: periodLabel(m) }))} />
  );

  const d = useMemo(() => {
    const monthTx = txInMonth(yearTx, month);
    const rankSlices = categoryTotals(txInMonth(yearTx, rankMonth), 'expense', projects);
    const forPeriod = (p: string) => (p === 'ytd' ? yearTx : txInMonth(yearTx, p));
    const incomeSlices = categoryTotals(forPeriod(incomePeriod), 'income', projects);
    const yearExpenseSlices = categoryTotals(forPeriod(expensePeriod), 'expense', projects);
    const trendFor = (dir: 'income' | 'expense', picked: string | null) => {
      const groups = categoryTrendGroups(yearTx, projects, dir);
      const options = groups.flatMap((g) => g.options);
      const id = picked && options.some((c) => c.id === picked) ? picked : options[0]?.id ?? '';
      return { groups, id, data: id ? categoryMonthly(yearTx, id, now, projects, dir) : [] };
    };
    return {
      cashFlow: monthlyCashFlow(yearTx, now),
      trend: trendSeries(yearTx, now, 12),   // full YTD; the panel slices per selected range
      expenseDonut: foldOther(yearExpenseSlices, 7),
      expenseTotal: yearExpenseSlices.reduce((s, x) => s + x.value, 0),
      ranking: rankSlices.slice(0, 7),
      incomeSlices: foldOther(incomeSlices, 6),
      incomeTotal: incomeSlices.reduce((s, x) => s + x.value, 0),
      incomeTrend: trendFor('income', incomeTrendCat),
      expenseTrend: trendFor('expense', trendCat),
      fixedVar: fixedVariable(yearTx, month, projects),
      netWorth: netWorthBreakdown(accounts, debts, yearTx, month),
      changes: expenseChanges(yearTx, month, projects),
      merchants: topMerchants(monthTx),
      daily: dailyCumulative(yearTx, month, now),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearTx, month, budgets, accounts, debts, projects, incomePeriod, expensePeriod, rankMonth, incomeTrendCat, trendCat]);

  /* ── Stat-card derivations (ported verbatim from the pre-refactor page) ── */
  const isDebtAcc    = (a: (typeof accounts)[number]) => isLiability(a.accountType);
  const income       = transactions.filter(t => Number(t.amount) > 0  && inCashFlow(t)).reduce((s,t) => s + Number(t.amount), 0);
  const expenses     = transactions.filter(t => Number(t.amount) < 0  && inCashFlow(t)).reduce((s,t) => s + Math.abs(Number(t.amount)), 0);
  const net          = income - expenses;
  const invested     = savedTotal(transactions);
  const savingsRate  = income > 0 ? (net / income * 100) : 0;
  const isIncomeBudget  = (b: Budget) => b.category?.type === 'income' || !!b.projectCategoryId;
  const spendingBudgets = budgets.filter(b => !isIncomeBudget(b));
  const incomeTargets   = budgets.filter(isIncomeBudget);
  const incomeTarget    = incomeTargets.reduce((s,b) => s + Number(b.amount), 0) || null;
  const targetPct       = incomeTarget ? Math.round((income / incomeTarget) * 100) : null;
  const totalBalance = accounts.reduce((s,a) => s + (isDebtAcc(a) ? -Math.abs(Number(a.balance||0)) : Number(a.balance||0)), 0);
  /* Open debts split by direction: money others owe you is a receivable asset; money you owe them is a liability. */
  const openDebts    = debts.filter(dbt => dbt.status === 'open');
  const receivables  = openDebts.filter(dbt => dbt.direction === 'lent').reduce((s,dbt) => s + Number(dbt.remaining || 0), 0);
  const payables     = openDebts.filter(dbt => dbt.direction === 'owed').reduce((s,dbt) => s + Number(dbt.remaining || 0), 0);
  const netWorth     = totalBalance + receivables - payables;
  const isCurrentMonth = month === currentMonth();
  const isEarliestMonth = month <= `${new Date().getFullYear()}-01`;

  /* Prev month comparison from yearTx */
  const prevM    = prevMonth(month);
  const prevInc  = yearTx.filter(t => t.date.startsWith(prevM) && Number(t.amount) > 0  && inCashFlow(t)).reduce((s,t) => s + Number(t.amount), 0);
  const prevExp  = yearTx.filter(t => t.date.startsWith(prevM) && Number(t.amount) < 0  && inCashFlow(t)).reduce((s,t) => s + Math.abs(Number(t.amount)), 0);
  const incDelta = prevInc > 0 ? ((income - prevInc) / prevInc * 100) : 0;
  const expDelta = prevExp > 0 ? ((expenses - prevExp) / prevExp * 100) : 0;
  const prevNet  = prevInc - prevExp;
  const savDelta = prevNet !== 0 ? ((net - prevNet) / Math.abs(prevNet) * 100) : null;

  /* ── Stat cards (reference design: icon chip · value · delta · sparkline) ── */
  const totalBudgeted   = spendingBudgets.reduce((s,b) => s + Number(b.amount), 0);
  const totalSpent      = spendingBudgets.reduce((s,b) => s + Number(b.spent), 0);
  const budgetRemaining = totalBudgeted - totalSpent;
  const balanceBase     = netWorth - (d.daily.at(-1)?.net ?? 0);
  const money           = (n: number) => `${n < 0 ? '-' : ''}$${fmt(Math.abs(n))}`;
  const statCards: StatCardDef[] = [
    { label: 'Total Balance',    short: 'Balance', value: money(netWorth), delta: d.netWorth.deltaPct,
      sub: receivables > 0 ? `incl. ${money(receivables)} owed to you` : payables > 0 ? `incl. ${money(payables)} you owe` : 'vs last month',
      accent: tc.sky, icon: 'wallet', spark: d.daily.map(p => balanceBase + p.net) },
    { label: 'Monthly Income',   short: 'Income', value: money(income), delta: incDelta, sub: targetPct != null ? `${targetPct}% of ${money(incomeTarget!)} target` : `vs ${monthShort(prevM)}: ${money(prevInc)}`,
      accent: tc.green, icon: 'trendup', spark: d.daily.map(p => p.income) },
    { label: 'Monthly Expenses', short: 'Expenses', value: money(expenses), delta: expDelta, inverseDelta: true, sub: `vs ${monthShort(prevM)}: ${money(prevExp)}`,
      accent: tc.orange, icon: 'trenddn', spark: d.daily.map(p => p.expenses) },
    { label: 'Monthly Savings',  short: 'Savings', value: money(net), delta: savDelta, sub: [income > 0 ? `${savingsRate.toFixed(1)}% savings rate` : null, invested > 0 ? `${money(invested)} invested` : null].filter(Boolean).join(' · ') || 'vs last month',
      accent: tc.violet, icon: 'savings', spark: d.daily.map(p => p.net) },
    { label: 'Budget Remaining', short: 'Budget left', value: money(budgetRemaining), delta: null, sub: totalBudgeted > 0 ? `of ${money(totalBudgeted)} budgeted` : 'no budgets set',
      accent: tc.amber, icon: 'budget', spark: totalBudgeted > 0 ? d.daily.map(p => totalBudgeted - p.expenses) : [] },
  ];

  /* ── Topbar summary line ── */
  const NUM_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const budgetsOver = spendingBudgets.filter(b => Number(b.amount) > 0 && Number(b.spent) / Number(b.amount) >= 0.8).length;
  const monthName   = monthLabel(month).split(' ')[0];
  const healthLine  = loading ? 'Loading your financial snapshot…'
    : net >= 0 ? 'Your portfolio of accounts is in excellent shape.'
    : 'Spending is running ahead of income this month.';
  const attentionLine = loading ? ''
    : spendingBudgets.length === 0 ? 'Set up budgets to keep your spending on track.'
    : budgetsOver === 0 ? `All budgets are on track for ${monthName}.`
    : `${NUM_WORDS[budgetsOver] ?? budgetsOver} budget${budgetsOver === 1 ? '' : 's'} need${budgetsOver === 1 ? 's' : ''} attention before the end of ${monthName}.`;

  /* Pill CTAs: roomy on desktop, compact on phones so the three controls share a row. */
  const pill = 'items-center justify-center rounded-full text-[11.5px] sm:text-[12.5px] font-semibold uppercase no-underline transition-all px-4 py-2.5 sm:px-[26px] sm:py-3.5 tracking-[0.12em] sm:tracking-[0.18em] whitespace-nowrap';

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="px-4 sm:px-6 md:px-8 py-4 sm:py-6 flex flex-col gap-3 sm:gap-4">

          {/* ── Topbar. Phones: smaller greeting, one status sentence, no rule, icon buttons;
                 the full pills and the two-sentence line return from sm. ── */}
          <div className="flex items-end justify-between gap-3 sm:gap-6 flex-wrap">
            <div className="min-w-0">
              <h1 className="font-bold tracking-tight" style={{ fontSize: 'clamp(26px, 3.6vw, 48px)', lineHeight: 1.08 }}>
                {greeting()}{user?.name ? <>, <span style={{ color: 'var(--color-primary)' }}>{user.name.split(' ')[0]}</span></> : ''}
              </h1>
              <div className="hidden sm:block rounded-full sm:mt-[18px] sm:mb-3.5" style={{ width: 56, height: 3, background: 'var(--color-primary)' }} />
              <p className="mt-1.5 sm:mt-0 text-[13px] sm:text-[17px]" style={{ fontWeight: 300, color: 'var(--color-text-secondary)', maxWidth: 520, lineHeight: 1.5 }}>
                <span className="hidden sm:inline">{healthLine} </span>{attentionLine}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3.5 pb-0 sm:pb-2 flex-wrap">
              {loading && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-green)' }} />}
              <div className="flex items-center gap-0.5 rounded-full px-1.5 py-1" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                <button onClick={() => !isEarliestMonth && setMonth(prevMonth)} disabled={isEarliestMonth} aria-label="Previous month" className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-[rgba(128,128,128,0.15)] disabled:opacity-30 disabled:cursor-not-allowed" style={{ color: 'var(--color-text-secondary)' }}>‹</button>
                <span className="text-[11.5px] sm:text-[12.5px] font-semibold uppercase px-1 min-w-24 sm:min-w-28 text-center tracking-[0.08em] sm:tracking-[0.12em]">{monthLabel(month)}</span>
                <button onClick={() => setMonth(nextMonth)} disabled={isCurrentMonth} aria-label="Next month" className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-[rgba(128,128,128,0.15)] disabled:opacity-30 disabled:cursor-default" style={{ color: 'var(--color-text-secondary)' }}>›</button>
              </div>
              <Link href="/reports"
                className={`hidden sm:inline-flex ${pill} hover:brightness-125`}
                style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)' }}>
                View Reports
              </Link>
              <Link href="/transactions" className={`hidden sm:inline-flex btn-gold ${pill}`}>
                Add Transaction
              </Link>
              {/* Phone-only icon buttons: same destinations, one row with the month picker. */}
              <Link href="/reports" aria-label="View reports" title="View reports"
                className="sm:hidden w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
              </Link>
              <Link href="/transactions" aria-label="Add transaction" title="Add transaction"
                className="sm:hidden btn-gold w-10 h-10 rounded-full flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              </Link>
            </div>
          </div>

          {/* ── Error banner ── */}
          {error && (
            <div className="flex items-center justify-between gap-4 rounded-2xl px-5 py-3.5 flex-wrap"
              style={{ background: 'rgba(255, 107, 107, 0.08)', border: '1px solid rgba(255, 107, 107, 0.25)' }}>
              <span className="text-sm" style={{ color: 'var(--color-rose)' }}>{error}</span>
              <button onClick={reload} className="text-xs font-semibold uppercase cursor-pointer" style={{ color: 'var(--color-rose)', letterSpacing: '0.1em' }}>
                Retry
              </button>
            </div>
          )}

          {/* ── Stat cards ── */}
          <StatCardsRow cards={statCards} loading={loading} />

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
            <IncomeExpensesPanel data={d.cashFlow} loading={loading} />
            <CashFlowTrendPanel data={d.trend} loading={loading} />
            <CategoryDonutPanel title="Income Sources" subtitle={periodLabel(incomePeriod)} colSpan={2}
              slices={d.incomeSlices} total={d.incomeTotal} loading={loading}
              period={incomePeriod} periodOptions={periodOptions} onPeriodChange={setIncomePeriod} />
            <CategoryDonutPanel title="Expenses by Category" subtitle={periodLabel(expensePeriod)} colSpan={2}
              slices={d.expenseDonut} total={d.expenseTotal} loading={loading}
              period={expensePeriod} periodOptions={periodOptions} onPeriodChange={setExpensePeriod} />

            {/* Income left, expenses right; each spans the full row below xl. */}
            <div className="md:col-span-2 min-w-0 flex flex-col [&>*]:flex-1">
              <CategoryTrendPanel kind="income" groups={d.incomeTrend.groups} selectedId={d.incomeTrend.id} onSelect={setIncomeTrendCat}
                data={d.incomeTrend.data}
                budget={(() => { const b = incomeTargets.find((x) => x.category?.id === d.incomeTrend.id || (!!x.projectCategoryId && `proj:${x.projectCategoryId}` === d.incomeTrend.id)); return b ? Number(b.amount) : null; })()}
                loading={loading} />
            </div>
            <div className="md:col-span-2 min-w-0 flex flex-col [&>*]:flex-1">
              <CategoryTrendPanel kind="expense" groups={d.expenseTrend.groups} selectedId={d.expenseTrend.id} onSelect={setTrendCat}
                data={d.expenseTrend.data}
                budget={(() => { const b = spendingBudgets.find((x) => x.category?.id === d.expenseTrend.id); return b ? Number(b.amount) : null; })()}
                loading={loading} />
            </div>

            <CategoryRankingPanel slices={d.ranking} monthLabel={monthLabel(rankMonth)}
              picker={monthPicker(rankMonth, setRankMonth, 'Category ranking')} loading={loading} />
            <BudgetActualPanel budgets={budgetPanel.budgets.filter((b) => !isIncomeBudget(b))} monthLabel={monthLabel(budgetMonth)}
              picker={monthPicker(budgetMonth, setBudgetMonth, 'Budget vs actual')} loading={loading || budgetPanel.loading} />
            {/* Hidden for now — Daily Spending calendar and Spending Pace.
            <SpendingCalendarPanel cells={d.calendar} monthLabel={monthLabel(calMonth)}
              picker={monthPicker(calMonth, setCalMonth, 'Daily spending')} loading={loading} />
            <SpendingPacePanel pace={d.pace} monthLabel={monthLabel(paceMonth)}
              picker={monthPicker(paceMonth, setPaceMonth, 'Spending pace')} loading={loading || pacePanel.loading} />
            */}
            <FixedVariablePanel split={d.fixedVar} monthLabel={monthLabel(month)} loading={loading} />
            <RecurringTimelinePanel />

            <NetWorthGoalPanel />
            <NetWorthPanel data={d.netWorth} loading={loading} />
            <ExpenseChangePanel changes={d.changes.changes} unchanged={d.changes.unchanged}
              monthLabel={monthLabel(month)} prevMonthLabel={monthLabel(prevM)} loading={loading} />
            <TopMerchantsPanel merchants={d.merchants} loading={loading} />

            <SubscriptionsPanel />
            <ProjectsPanel projects={projects} loading={loading} />

            {/* Two halves at xl so the last row has no empty cells. */}
            <div className="xl:col-span-2 min-w-0 flex flex-col [&>*]:flex-1">
              <AccountsPanel accounts={accounts} netWorth={d.netWorth.total} loading={loading} />
            </div>
            <div className="xl:col-span-2 min-w-0 flex flex-col [&>*]:flex-1">
              <RecentTransactionsPanel transactions={transactions} loading={loading} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
