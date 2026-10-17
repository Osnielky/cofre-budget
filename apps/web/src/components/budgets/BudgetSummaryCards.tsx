'use client';

import { memo } from 'react';
import type { Plan } from '@/lib/budgets/calculations';
import { formatMoney } from '@/lib/budgets/money';
import { glass, Icon, useFlash, type IconName } from './ui';

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

function SummaryCard({ label, icon, accent, value, valueTone, sub, right, bar, delta = 0, deltaGoodWhenUp = true, empty = false }: CardProps) {
  const flash = useFlash(value);
  const good = deltaGoodWhenUp ? delta > 0 : delta < 0;
  return (
    <div className="rounded-2xl p-4 flex gap-3.5 min-w-0 overflow-hidden"
      style={{ ...glass, background: `linear-gradient(140deg, color-mix(in srgb, ${accent} 10%, transparent), var(--color-surface) 62%)` }}>
      <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `color-mix(in srgb, ${accent} 20%, transparent)`, color: accent, border: `1px solid color-mix(in srgb, ${accent} 35%, transparent)` }}>
        <Icon name={icon} size={20} />
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <p className="text-[11.5px] font-semibold truncate" style={{ color: accent }}>{label}</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className={`text-[22px] sm:text-2xl font-extrabold leading-none tabular-nums ${flash}`} style={valueTone && !empty ? { color: valueTone } : empty ? { color: 'var(--color-text-muted)' } : undefined}
            aria-live="polite">
            {empty ? '—' : formatMoney(value)}
          </p>
          {delta !== 0 && !empty && (
            <span className="text-[10.5px] font-bold tabular-nums px-1.5 py-0.5 rounded-md"
              style={{ color: good ? 'var(--color-green)' : 'var(--color-rose)', background: `color-mix(in srgb, ${good ? 'var(--color-green)' : 'var(--color-rose)'} 14%, transparent)` }}
              title="Change from saved plan">
              {formatMoney(delta, { sign: true })}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
          <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{sub}</span>
          {right && <span className="shrink-0 tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{right}</span>}
        </div>
        <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: 'color-mix(in srgb, var(--color-text-muted) 18%, transparent)' }}>
          {bar && <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, Math.max(0, bar.pct))}%`, background: bar.color }} />}
        </div>
      </div>
    </div>
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
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
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
