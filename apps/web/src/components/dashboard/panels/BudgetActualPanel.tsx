'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { Budget } from '@/lib/dashboard/types';

export default function BudgetActualPanel({ budgets, monthLabel, loading }: {
  budgets: Budget[]; monthLabel: string; loading: boolean;
}) {
  const tc = useThemeColors();
  return (
    <Panel title="Budget vs Actual" subtitle={monthLabel} loading={loading}>
      {budgets.length === 0 ? <PanelEmpty message="No budgets set. Create budgets to track spending against targets." /> : (
        <ul className="flex flex-col gap-2.5">
          {budgets.map((b) => {
            const amount = Number(b.amount), spent = Number(b.spent);
            const pct = amount > 0 ? (spent / amount) * 100 : 0;
            const tone = pct > 100 ? tc.rose : pct >= 80 ? tc.amber : tc.green;
            return (
              <li key={b.id} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
                  {b.category?.name ?? '—'}
                </span>
                <span className="w-14 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>${fmt(amount)}</span>
                <span className="w-14 text-right tabular-nums font-semibold">${fmt(spent)}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, currentColor 6%, transparent)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: tone }} />
                </div>
                <span className="w-10 text-right tabular-nums font-bold" style={{ color: tone }}>{pct.toFixed(0)}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
