'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { fmt } from '../chartTheme';
import type { CategorySlice } from '@/lib/dashboard/derive';

export default function CategoryRankingPanel({ slices, loading }: { slices: CategorySlice[]; loading: boolean }) {
  const tc = useThemeColors();
  const max = slices[0]?.value || 1;
  return (
    <Panel title="Category Spending Ranking" subtitle="This month" loading={loading}>
      {slices.length === 0 ? <PanelEmpty message="No spending this month yet." /> : (
        <ul className="flex flex-col gap-2.5">
          {slices.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-xs">
              <span className="w-24 truncate shrink-0" style={{ color: 'var(--color-text-secondary)' }}>{s.name}</span>
              <div className="flex-1 h-3 rounded-md overflow-hidden" style={{ background: 'color-mix(in srgb, currentColor 6%, transparent)' }}>
                <div className="h-full rounded-md" style={{ width: `${(s.value / max) * 100}%`, background: s.color, opacity: 0.85 }} />
              </div>
              <span className="font-semibold tabular-nums w-16 text-right">${fmt(s.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
