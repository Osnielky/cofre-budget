'use client';

function fmt(n: number) { return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }
function money(n: number) { return `${n < 0 ? '−' : ''}$${fmt(n)}`; }

interface PlanFlowProps {
  totalTarget: number; totalEarned: number; earnPct: number;
  totalBudget: number; spendingCount: number;
  combinedSpent: number; budgetedSpent: number; unbudgetedTotal: number;
  plannedSavings: number; actualSoFar: number; projectedSavings: number;
}

/** One headline figure, as a card with a tinted icon tile and an optional meter. */
function StatCard({ label, color, icon, value, sub, pct }: {
  label: string; color: string; icon: React.ReactNode;
  value: string; sub: React.ReactNode; pct?: number;
}) {
  return (
    <div className="flex-1 min-w-56 flex items-start gap-3 p-4 rounded-2xl"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
      <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-bold uppercase tracking-widest" style={{ color }}>{label}</p>
        <p className="font-extrabold tabular-nums leading-none mt-1" style={{ fontSize: 25, color: 'var(--color-text-primary)' }}>{value}</p>
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>
        {pct !== undefined && (
          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color }} />
          </div>
        )}
      </div>
    </div>
  );
}

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export default function PlanFlow({
  totalTarget, totalEarned, earnPct, totalBudget, spendingCount,
  combinedSpent, budgetedSpent, unbudgetedTotal, plannedSavings, actualSoFar, projectedSavings,
}: PlanFlowProps) {
  const overPlan = combinedSpent - totalBudget;

  return (
    <div className="flex gap-3 flex-wrap">
      <StatCard
        label="Income expected" color="var(--color-green)"
        icon={<svg width="18" height="18" viewBox="0 0 24 24" {...ICON}><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>}
        value={totalTarget > 0 ? money(totalTarget) : '—'}
        sub={totalTarget > 0 ? `${earnPct}% received` : 'no targets set'}
        pct={totalTarget > 0 ? earnPct : undefined}
      />
      <StatCard
        label="Budgeted" color="var(--color-card-violet)"
        icon={<svg width="18" height="18" viewBox="0 0 24 24" {...ICON}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>}
        value={spendingCount > 0 ? money(totalBudget) : '—'}
        sub={spendingCount > 0 ? `${spendingCount} categor${spendingCount === 1 ? 'y' : 'ies'}` : 'no budgets set'}
      />
      <StatCard
        label="Spent" color="var(--color-amber)"
        icon={<svg width="18" height="18" viewBox="0 0 24 24" {...ICON}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>}
        value={money(combinedSpent)}
        sub={overPlan > 0
          ? <span style={{ color: 'var(--color-rose)' }}>{money(overPlan)} over plan</span>
          : unbudgetedTotal > 0
            ? <>{money(budgetedSpent)} in budget · <span style={{ color: 'var(--color-amber)' }}>{money(unbudgetedTotal)} outside</span></>
            : 'all inside budget'}
      />
      <StatCard
        label="Planned savings" color="var(--color-card-sky)"
        icon={<svg width="18" height="18" viewBox="0 0 24 24" {...ICON}><path d="M3 17l6-6 4 4 7-7" /><path d="M14 8h6v6" /></svg>}
        value={money(plannedSavings)}
        sub={<><span style={{ color: projectedSavings >= 0 ? 'var(--color-green)' : 'var(--color-rose)' }}>{money(projectedSavings)}</span> projected</>}
      />
    </div>
  );
}
