'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { makeChartTheme, fmt } from '../chartTheme';
import type { CategorySlice } from '@/lib/dashboard/derive';

interface Props {
  title: string; subtitle: string;
  slices: CategorySlice[]; total: number; loading: boolean;
}

export default function CategoryDonutPanel({ title, subtitle, slices, total, loading }: Props) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  return (
    <Panel title={title} subtitle={subtitle} loading={loading}>
      {slices.length === 0 ? <PanelEmpty message="Nothing categorized here yet." /> : (
        <div className="flex items-center gap-3">
          <div className="relative w-32 h-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" innerRadius={42} outerRadius={60}
                  paddingAngle={2} strokeWidth={0}>
                  {slices.map((s) => <Cell key={s.id} fill={s.color} />)}
                </Pie>
                <Tooltip {...th.tooltip} formatter={(v: unknown, name: unknown) => [`$${fmt(Number(v))}`, String(name)]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-sm font-bold">${fmt(total)}</p>
              <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>Total</p>
            </div>
          </div>
          <ul className="flex-1 flex flex-col gap-1.5 text-xs min-w-0">
            {slices.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>{s.name}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>{s.pct}%</span>
                <span className="font-semibold tabular-nums">${fmt(s.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
