'use client';

import { memo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import { makeChartTheme, fmt } from '@/components/dashboard/chartTheme';
import type { CategorySlice } from '@/lib/dashboard/derive';
import { formatMoney, type Cents } from '@/lib/budgets/money';
import { SectionCard, SectionTitle } from './ui';

/** Where this month's money actually went. Built from transactions only, so it
    never moves while budgets are being edited. */
function SpendingDistributionChart({ slices, totalCents }: { slices: CategorySlice[]; totalCents: Cents }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  return (
    <SectionCard className="flex flex-col gap-3 h-full">
      <SectionTitle icon="pie" color="var(--color-violet)" title="Spending Breakdown" subtitle="Actual spending this month by category" />
      {slices.length === 0 ? (
        <p className="text-xs py-16 text-center" style={{ color: 'var(--color-text-muted)' }}>No spending recorded this month.</p>
      ) : (
        <div className="flex flex-col sm:flex-row xl:flex-col 2xl:flex-row items-center gap-4 flex-1">
          <div className="relative shrink-0" style={{ width: 168, height: 168 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" innerRadius={56} outerRadius={80}
                  paddingAngle={2} cornerRadius={4} strokeWidth={0} isAnimationActive={false}>
                  {slices.map((s) => <Cell key={s.id} fill={s.color} />)}
                </Pie>
                <Tooltip {...th.tooltip} formatter={(v: unknown, name: unknown) => [`$${fmt(Number(v))}`, String(name)]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-base font-extrabold tabular-nums">{formatMoney(totalCents)}</p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Total spent</p>
            </div>
          </div>
          <ul className="flex-1 w-full min-w-0 flex flex-col gap-1.5">
            {slices.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-xs min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>{s.name}</span>
                <span className="tabular-nums w-10 text-right" style={{ color: 'var(--color-text-muted)' }}>{Math.round(s.pct)}%</span>
                <span className="tabular-nums font-semibold w-20 text-right">${fmt(s.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

export default memo(SpendingDistributionChart);
