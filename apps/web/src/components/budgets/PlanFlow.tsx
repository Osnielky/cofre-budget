'use client';

function fmt(n: number) { return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }
function money(n: number) { return `${n < 0 ? '−' : ''}$${fmt(n)}`; }

interface PlanFlowProps {
  totalTarget: number; totalEarned: number; earnPct: number;
  totalBudget: number; spendingCount: number;
  combinedSpent: number; budgetedSpent: number; unbudgetedTotal: number;
  plannedSavings: number; actualSoFar: number; projectedSavings: number;
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="shrink-0 hidden sm:block" style={{ opacity: 0.5 }}>
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function Block({ label, color, value, sub }: { label: string; color: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0 flex-1">
      <span className="text-[10.5px] font-bold uppercase tracking-widest" style={{ color }}>{label}</span>
      <span className="font-extrabold tabular-nums leading-none" style={{ fontSize: 27, color: 'var(--color-text-primary)' }}>{value}</span>
      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{sub}</span>
    </div>
  );
}

export default function PlanFlow({
  totalTarget, totalEarned, earnPct, totalBudget, spendingCount,
  combinedSpent, budgetedSpent, unbudgetedTotal, plannedSavings, actualSoFar, projectedSavings,
}: PlanFlowProps) {
  return (
    <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
      <Block label="Income expected" color="var(--color-green)"
        value={totalTarget > 0 ? money(totalTarget) : '—'}
        sub={totalTarget > 0 ? <>{money(totalEarned)} in · {earnPct}%</> : 'no targets set'} />
      <Arrow />
      <Block label="Budgeted to spend" color="var(--color-card-violet)"
        value={spendingCount > 0 ? money(totalBudget) : '—'}
        sub={spendingCount > 0 ? `across ${spendingCount} categor${spendingCount === 1 ? 'y' : 'ies'}` : 'no budgets set'} />
      <Arrow />
      <Block label="Spent so far" color="var(--color-orange)"
        value={money(combinedSpent)}
        sub={unbudgetedTotal > 0
          ? <>{money(budgetedSpent)} in budget · <span style={{ color: 'var(--color-amber)' }}>{money(unbudgetedTotal)} outside</span></>
          : 'all inside budget'} />
      <Arrow />
      <Block label="Saving, planned vs real" color="var(--color-card-sky)"
        value={money(plannedSavings)}
        sub={<>{money(actualSoFar)} so far · projected <span style={{ color: projectedSavings >= 0 ? 'var(--color-green)' : 'var(--color-rose)' }}>{money(projectedSavings)}</span></>} />
    </div>
  );
}
