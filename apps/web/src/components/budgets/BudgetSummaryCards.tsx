'use client';

import { memo } from 'react';
import StatTile from '@/components/StatTile';
import type { Plan } from '@/lib/budgets/calculations';
import { formatMoney } from '@/lib/budgets/money';
import { Icon, useFlash, type IconName } from './ui';

function pctOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part * 1000) / whole) / 10 : null;
}

interface CardProps {
  label: string; icon: IconName; accent: string;
  value: number; valueTone?: string;
  sub: React.ReactNode; right?: string | null;
  bar: { pct: number; color: string } | null;
  delta?: number; deltaGoodWhenUp?: boolean;
  /** Shown instead of the amount when the metric isn't meaningful yet. */
  empty?: boolean;
}

/* One of the four plan figures on the shared StatTile: the value flashes when a draft
   edit changes it, the delta chip is the change from the saved plan, the bar is the
   share the sub line describes. */
function SummaryCard({ label, icon, accent, value, valueTone, sub, right, bar, delta = 0, deltaGoodWhenUp = true, empty = false }: CardProps) {
  const flash = useFlash(value);
  return (
    <StatTile label={label} accent={accent} icon={<Icon name={icon} size={18} />}
      value={empty ? '—' : formatMoney(value)}
      valueTone={empty ? 'var(--color-text-muted)' : valueTone} valueClassName={flash} live
      delta={empty ? null : { value: delta, unit: 'money', inverse: !deltaGoodWhenUp, format: (n) => formatMoney(n, { sign: true }) }}
      deltaTitle="Change from saved plan"
      sub={sub} right={right}
      trend={{ kind: 'bar', pct: bar?.pct ?? 0, color: bar?.color }} />
  );
}

function BudgetSummaryCards({ plan, categoryCount }: { plan: Plan; categoryCount: number }) {
  const income = plan.expectedIncomeCents;
  const receivedPct = pctOf(plan.incomeTargetReceivedCents, income);
  const budgetPctIncome = pctOf(plan.totalBudgetCents, income);
  const spentPctIncome = pctOf(plan.totalSpentCents, income);
  const savingsPctIncome = pctOf(plan.plannedSavingsCents, income);
  const spentPctBudget = pctOf(plan.totalSpentCents, plan.totalBudgetCents) ?? (plan.totalSpentCents > 0 ? 100 : 0);
  const under = plan.underBudgetCents;
  const ofIncome = (p: number | null) => (p == null ? null : `${p}% of income`);

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
      <SummaryCard label="Income (Expected)" icon="income" accent="var(--color-green)" value={income}
        sub={income > 0
          ? <>{Math.min(100, receivedPct ?? 0)}% received · {formatMoney(Math.max(0, income - plan.incomeTargetReceivedCents))} pending</>
          : 'No income targets set'}
        bar={income > 0 ? { pct: receivedPct ?? 0, color: 'var(--color-green)' } : null} />
      <SummaryCard label="Total Budgeted" icon="target" accent="var(--color-violet)" value={plan.totalBudgetCents}
        sub={`${categoryCount} categor${categoryCount === 1 ? 'y' : 'ies'}`} right={ofIncome(budgetPctIncome)}
        bar={income > 0 ? { pct: budgetPctIncome ?? 0, color: 'var(--color-violet)' } : null}
        delta={plan.budgetDifferenceCents} deltaGoodWhenUp={false} />
      <SummaryCard label="Total Spent" icon="receipt" accent="var(--color-orange)" value={plan.totalSpentCents}
        sub={<span style={{ color: under >= 0 ? 'var(--color-amber)' : 'var(--color-rose)' }}>
          {formatMoney(Math.abs(under))} {under >= 0 ? 'under' : 'over'} budget
        </span>}
        right={ofIncome(spentPctIncome)}
        bar={{ pct: spentPctBudget, color: spentPctBudget >= 100 ? 'var(--color-rose)' : spentPctBudget >= 80 ? 'var(--color-amber)' : 'var(--color-orange)' }} />
      <SummaryCard label="Planned Savings" icon="savings" accent="var(--color-sky)" value={plan.plannedSavingsCents}
        valueTone={plan.plannedSavingsCents < 0 ? 'var(--color-rose)' : undefined} empty={income === 0}
        sub={income === 0 ? 'Add an income target to plan savings' : <>{formatMoney(plan.projectedSavingsCents)} projected</>}
        right={ofIncome(savingsPctIncome)}
        bar={{ pct: savingsPctIncome ?? 0, color: 'var(--color-sky)' }}
        delta={plan.savingsImpactCents} />
    </div>
  );
}

export default memo(BudgetSummaryCards);
