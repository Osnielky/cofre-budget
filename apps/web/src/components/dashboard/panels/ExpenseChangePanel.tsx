'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { ExpenseChange } from '@/lib/dashboard/derive';

export default function ExpenseChangePanel({ changes, unchanged, monthLabel, prevMonthLabel, loading }: {
  changes: ExpenseChange[]; unchanged: number; monthLabel: string; prevMonthLabel: string; loading: boolean;
}) {
  const tc = useThemeColors();
  const max = Math.max(1, ...changes.map((c) => Math.abs(c.delta)));
  return (
    <Panel title="Expense Change" subtitle={`${monthLabel} vs ${prevMonthLabel}`} loading={loading}>
      {changes.length === 0 ? <PanelEmpty message="Spending is steady — no meaningful category changes vs last month." /> : (
        <ul className="flex flex-col gap-2 text-xs">
          {changes.slice(0, 7).map((c) => {
            const up = c.delta > 0; // spent more = bad for expenses
            return (
              <li key={c.id} className="flex items-center gap-2">
                <span className="w-20 truncate shrink-0" style={{ color: 'var(--color-text-secondary)' }}>{c.name}</span>
                <div className="flex-1 h-2.5 flex">
                  <div className="w-1/2 flex justify-end">
                    {!up && <div className="h-full rounded-l-md" style={{ width: `${(Math.abs(c.delta) / max) * 100}%`, background: tc.green, opacity: 0.85 }} />}
                  </div>
                  <div className="w-px shrink-0" style={{ background: tc.border }} />
                  <div className="w-1/2">
                    {up && <div className="h-full rounded-r-md" style={{ width: `${(c.delta / max) * 100}%`, background: tc.rose, opacity: 0.85 }} />}
                  </div>
                </div>
                <span className="w-20 text-right tabular-nums font-semibold shrink-0" style={{ color: up ? tc.rose : tc.green }}>
                  {up ? '↑' : '↓'} ${fmt(Math.abs(c.delta))}{c.pct != null ? ` · ${Math.abs(c.pct).toFixed(0)}%` : ' · new'}
                </span>
              </li>
            );
          })}
          {unchanged > 0 && (
            <li className="text-[10px] pt-1" style={{ color: 'var(--color-text-muted)' }}>
              {unchanged} categor{unchanged === 1 ? 'y' : 'ies'} unchanged
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}
