'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { FixedVariableSplit } from '@/lib/dashboard/derive';

export default function FixedVariablePanel({ split, monthLabel, loading }: {
  split: FixedVariableSplit; monthLabel: string; loading: boolean;
}) {
  const tc = useThemeColors();
  const total = split.fixedTotal + split.variableTotal;
  return (
    <Panel title="Fixed vs Variable" subtitle={monthLabel} loading={loading}>
      {total === 0 ? <PanelEmpty message="No expenses this month. Mark categories as fixed in Settings → Categories." /> : (
        <div className="flex flex-col gap-3">
          <div className="flex h-9 rounded-xl overflow-hidden text-[10px] font-bold">
            {split.fixedTotal > 0 && (
              <div className="flex flex-col items-center justify-center" style={{ width: `${split.fixedPct}%`, background: `color-mix(in srgb, ${tc.violet} 45%, transparent)`, minWidth: 54 }}>
                <span>Fixed {split.fixedPct.toFixed(0)}%</span>
                <span className="font-medium opacity-80">${fmt(split.fixedTotal)}</span>
              </div>
            )}
            {split.variableTotal > 0 && (
              <div className="flex flex-col items-center justify-center" style={{ flex: 1, background: `color-mix(in srgb, ${tc.sky} 30%, transparent)`, minWidth: 54 }}>
                <span>Variable {(100 - split.fixedPct).toFixed(0)}%</span>
                <span className="font-medium opacity-80">${fmt(split.variableTotal)}</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[{ label: 'Fixed', list: split.fixed }, { label: 'Variable', list: split.variable }].map((col) => (
              <ul key={col.label} className="flex flex-col gap-1.5">
                {col.list.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>{s.name}</span>
                    <span className="tabular-nums font-semibold">${fmt(s.value)}</span>
                  </li>
                ))}
                {col.list.length === 0 && <li style={{ color: 'var(--color-text-muted)' }}>None</li>}
              </ul>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
