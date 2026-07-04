'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { useUser } from '@/components/UserProvider';
import { useThemeColors } from '@/components/ThemeProvider';
import { useDashboardData } from '@/hooks/useDashboardData';
import { isLiability } from '@/lib/accountTypes';
import {
  monthlyCashFlow, trendSeries, categoryTotals, foldOther, txInMonth,
  calendarDays, spendingPace, fixedVariable, savingsSeries, netWorthBreakdown,
  expenseChanges, topMerchants, isTransfer, inCashFlow, dailyCumulative,
} from '@/lib/dashboard/derive';
import type { Budget } from '@/lib/dashboard/types';
import StatCardsRow, { type StatCardDef } from '@/components/dashboard/StatCardsRow';
import IncomeExpensesPanel from '@/components/dashboard/panels/IncomeExpensesPanel';
import CashFlowTrendPanel from '@/components/dashboard/panels/CashFlowTrendPanel';
import CategoryDonutPanel from '@/components/dashboard/panels/CategoryDonutPanel';
import CategoryRankingPanel from '@/components/dashboard/panels/CategoryRankingPanel';
import BudgetActualPanel from '@/components/dashboard/panels/BudgetActualPanel';
import SpendingCalendarPanel from '@/components/dashboard/panels/SpendingCalendarPanel';
import SpendingPacePanel from '@/components/dashboard/panels/SpendingPacePanel';
import FixedVariablePanel from '@/components/dashboard/panels/FixedVariablePanel';
import RecurringTimelinePanel from '@/components/dashboard/panels/RecurringTimelinePanel';
import SavingsGrowthPanel from '@/components/dashboard/panels/SavingsGrowthPanel';
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
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { month, setMonth, transactions, yearTx, accounts, budgets, projects, debts, loading } = useDashboardData();
  const { user, refetch } = useUser();
  const tc = useThemeColors();
  const now = new Date();

  const d = useMemo(() => {
    const monthTx = txInMonth(yearTx, month);
    const goal = user?.savingsGoal != null ? Number(user.savingsGoal) : null;
    const expenseSlices = categoryTotals(monthTx, 'expense');
    const incomeSlices = categoryTotals(yearTx, 'income');
    return {
      cashFlow: monthlyCashFlow(yearTx, now),
      trend: trendSeries(yearTx, now),
      expenseDonut: foldOther(expenseSlices, 7),
      expenseTotal: expenseSlices.reduce((s, x) => s + x.value, 0),
      ranking: expenseSlices.slice(0, 7),
      incomeSlices: foldOther(incomeSlices, 6),
      incomeTotal: incomeSlices.reduce((s, x) => s + x.value, 0),
      calendar: calendarDays(yearTx, month),
      pace: spendingPace(budgets, yearTx, month, now),
      fixedVar: fixedVariable(yearTx, month),
      savings: savingsSeries(yearTx, now, goal),
      netWorth: netWorthBreakdown(accounts, debts, yearTx, month),
      changes: expenseChanges(yearTx, month),
      merchants: topMerchants(monthTx),
      daily: dailyCumulative(yearTx, month, now),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearTx, month, budgets, accounts, debts, user?.savingsGoal]);

  /* ── Stat-card derivations (ported verbatim from the pre-refactor page) ── */
  const isDebtAcc    = (a: (typeof accounts)[number]) => isLiability(a.accountType);
  const income       = transactions.filter(t => Number(t.amount) > 0  && inCashFlow(t)).reduce((s,t) => s + Number(t.amount), 0);
  const expenses     = transactions.filter(t => Number(t.amount) < 0  && inCashFlow(t)).reduce((s,t) => s + Math.abs(Number(t.amount)), 0);
  const net          = income - expenses;
  const savingsRate  = income > 0 ? (net / income * 100) : 0;
  const isIncomeBudget  = (b: Budget) => b.category?.type === 'income' || !!b.projectCategoryId;
  const spendingBudgets = budgets.filter(b => !isIncomeBudget(b));
  const incomeTargets   = budgets.filter(isIncomeBudget);
  const incomeTarget    = incomeTargets.reduce((s,b) => s + Number(b.amount), 0) || null;
  const targetPct       = incomeTarget ? Math.round((income / incomeTarget) * 100) : null;
  const totalBalance = accounts.reduce((s,a) => s + (isDebtAcc(a) ? -Math.abs(Number(a.balance||0)) : Number(a.balance||0)), 0);
  /* Money others still owe you = a receivable asset (open debts' remaining). */
  const receivables  = debts.filter(dbt => dbt.status === 'open').reduce((s,dbt) => s + Number(dbt.remaining || 0), 0);
  const netWorth     = totalBalance + receivables;
  const isCurrentMonth = month === currentMonth();
  const isEarliestMonth = month <= `${new Date().getFullYear()}-01`;

  /* Prev month comparison from yearTx */
  const prevM    = prevMonth(month);
  const prevInc  = yearTx.filter(t => t.date.startsWith(prevM) && Number(t.amount) > 0  && !isTransfer(t)).reduce((s,t) => s + Number(t.amount), 0);
  const prevExp  = yearTx.filter(t => t.date.startsWith(prevM) && Number(t.amount) < 0  && !isTransfer(t)).reduce((s,t) => s + Math.abs(Number(t.amount)), 0);
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
    { label: 'Total Balance',    value: money(netWorth), delta: d.netWorth.deltaPct, sub: receivables > 0 ? `incl. ${money(receivables)} owed to you` : 'vs last month',
      accent: tc.sky, icon: 'wallet', spark: d.daily.map(p => balanceBase + p.net) },
    { label: 'Monthly Income',   value: money(income), delta: incDelta, sub: targetPct != null ? `${targetPct}% of ${money(incomeTarget!)} target` : `vs ${monthShort(prevM)}: ${money(prevInc)}`,
      accent: tc.green, icon: 'trendup', spark: d.daily.map(p => p.income) },
    { label: 'Monthly Expenses', value: money(expenses), delta: expDelta, inverseDelta: true, sub: `vs ${monthShort(prevM)}: ${money(prevExp)}`,
      accent: tc.orange, icon: 'trenddn', spark: d.daily.map(p => p.expenses) },
    { label: 'Monthly Savings',  value: money(net), delta: savDelta, sub: income > 0 ? `${savingsRate.toFixed(1)}% savings rate` : 'vs last month',
      accent: tc.violet, icon: 'savings', spark: d.daily.map(p => p.net) },
    { label: 'Budget Remaining', value: money(budgetRemaining), delta: null, sub: totalBudgeted > 0 ? `of ${money(totalBudgeted)} budgeted` : 'no budgets set',
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

  const pillBase: React.CSSProperties = { padding: '14px 26px', letterSpacing: '0.18em' };

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="px-6 md:px-8 py-6 flex flex-col gap-4 max-w-[1800px]">

          {/* ── Topbar ── */}
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <h1 className="font-bold tracking-tight" style={{ fontSize: 'clamp(36px, 3.6vw, 48px)', lineHeight: 1.08 }}>
                {greeting()}{user?.name ? <>, <span style={{ color: 'var(--color-primary)' }}>{user.name.split(' ')[0]}</span></> : ''}
              </h1>
              <div className="rounded-full" style={{ width: 56, height: 3, background: 'var(--color-primary)', margin: '18px 0 14px' }} />
              <p style={{ fontSize: 17, fontWeight: 300, color: 'var(--color-text-secondary)', maxWidth: 520, lineHeight: 1.65 }}>
                {healthLine} {attentionLine}
              </p>
            </div>
            <div className="flex items-center gap-3.5 pb-2 flex-wrap">
              {loading && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-green)' }} />}
              <div className="flex items-center gap-0.5 rounded-full px-1.5 py-1.5" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                <button onClick={() => !isEarliestMonth && setMonth(prevMonth)} disabled={isEarliestMonth} aria-label="Previous month" className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-[rgba(128,128,128,0.15)] disabled:opacity-30 disabled:cursor-not-allowed" style={{ color: 'var(--color-text-secondary)' }}>‹</button>
                <span className="text-[12.5px] font-semibold uppercase px-1 min-w-28 text-center" style={{ letterSpacing: '0.12em' }}>{monthLabel(month)}</span>
                <button onClick={() => setMonth(nextMonth)} disabled={isCurrentMonth} aria-label="Next month" className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-[rgba(128,128,128,0.15)] disabled:opacity-30 disabled:cursor-default" style={{ color: 'var(--color-text-secondary)' }}>›</button>
              </div>
              <Link href="/budgets"
                className="inline-flex items-center justify-center rounded-full text-[12.5px] font-semibold uppercase no-underline transition-all hover:brightness-125"
                style={{ ...pillBase, background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)' }}>
                View Reports
              </Link>
              <Link href="/transactions"
                className="btn-gold inline-flex items-center justify-center rounded-full text-[12.5px] font-semibold uppercase no-underline transition-all"
                style={pillBase}>
                Add Transaction
              </Link>
            </div>
          </div>

          {/* ── Stat cards ── */}
          <StatCardsRow cards={statCards} loading={loading} />

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            <IncomeExpensesPanel data={d.cashFlow} loading={loading} />
            <CashFlowTrendPanel data={d.trend} loading={loading} />
            <CategoryDonutPanel title="Expenses by Category" subtitle="This month"
              slices={d.expenseDonut} total={d.expenseTotal} loading={loading} />
            <CategoryRankingPanel slices={d.ranking} loading={loading} />

            <BudgetActualPanel budgets={spendingBudgets} loading={loading} />
            <SpendingCalendarPanel cells={d.calendar} monthLabel={monthLabel(month)} loading={loading} />
            <SpendingPacePanel pace={d.pace} loading={loading} />
            <CategoryDonutPanel title="Income Sources" subtitle="Year to date"
              slices={d.incomeSlices} total={d.incomeTotal} loading={loading} />

            <FixedVariablePanel split={d.fixedVar} loading={loading} />
            <RecurringTimelinePanel />
            <SavingsGrowthPanel stats={d.savings} loading={loading} onGoalSaved={refetch} />
            <NetWorthPanel data={d.netWorth} loading={loading} />

            <ExpenseChangePanel changes={d.changes.changes} unchanged={d.changes.unchanged} loading={loading} />
            <TopMerchantsPanel merchants={d.merchants} loading={loading} />
            <SubscriptionsPanel />

            <ProjectsPanel projects={projects} loading={loading} />
            <AccountsPanel accounts={accounts} netWorth={d.netWorth.total} loading={loading} />
            <RecentTransactionsPanel transactions={transactions} loading={loading} />
          </div>
        </div>
      </main>
    </div>
  );
}
