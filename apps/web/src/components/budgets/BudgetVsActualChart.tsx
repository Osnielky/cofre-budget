'use client';

import { memo, useState } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import { makeChartTheme, fmt } from '@/components/dashboard/chartTheme';
import { Legend } from '@/components/dashboard/Panel';
import type { DailyPoint } from '@/lib/budgets/assemble';
import { SectionCard, SectionTitle, Segmented } from './ui';

type Mode = 'spending' | 'savings';
const MODES = [{ value: 'spending', label: 'Spending' }, { value: 'savings', label: 'Savings' }] as const;

function BudgetVsActualChart({ points, todayDay, hasIncome }: { points: DailyPoint[]; todayDay: number | null; hasIncome: boolean }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const [mode, setMode] = useState<Mode>('spending');
  const savings = mode === 'savings';
  const tickEvery = Math.ceil(points.length / 5);

  const series = savings
    ? { actual: 'savings', plan: 'plannedSavings', actualLabel: 'Actual savings', planLabel: 'Planned savings' }
    : { actual: 'actual', plan: 'budget', actualLabel: 'Actual', planLabel: 'Budget pace' };

  return (
    <SectionCard className="flex flex-col gap-3">
      <SectionTitle icon="chart" color="var(--color-primary)" title="Budget vs. Actual"
        subtitle={savings ? 'Expected income minus spending, through the month' : 'Cumulative spending against your budget pace'}
        right={<div className="flex items-center gap-3 flex-wrap">
          <Segmented ariaLabel="Chart mode" value={mode} options={MODES} onChange={setMode} />
        </div>} />
      <Legend items={[
        { label: series.actualLabel, color: tc.orange },
        { label: series.planLabel, color: tc.sky, line: true },
        ...(!savings ? [{ label: 'Projected', color: tc.violet, line: true }] : []),
      ]} />
      {savings && !hasIncome ? (
        <p className="text-xs py-16 text-center" style={{ color: 'var(--color-text-muted)' }}>
          Add an income target to see savings through the month.
        </p>
      ) : (
        <div className="h-56 sm:h-60 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="bva-actual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tc.orange} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={tc.orange} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...th.grid} />
              <XAxis dataKey="label" {...th.xAxis} interval={tickEvery - 1} />
              <YAxis {...th.yAxis} />
              <Tooltip {...th.tooltip}
                formatter={(v: unknown, name: unknown) => [v == null ? '—' : `$${fmt(Number(v))}`, String(name)]} />
              {todayDay != null && (
                <ReferenceLine x={points[todayDay - 1]?.label} stroke={tc.textMuted} strokeDasharray="3 3"
                  label={{ value: 'Today', position: 'insideTopRight', fill: tc.textMuted, fontSize: 10 }} />
              )}
              <Area type="monotone" dataKey={series.actual} name={series.actualLabel} stroke={tc.orange} strokeWidth={2}
                fill="url(#bva-actual)" connectNulls={false} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey={series.plan} name={series.planLabel} stroke={tc.sky} strokeWidth={2}
                dot={false} isAnimationActive={false} />
              {!savings && (
                <Line type="monotone" dataKey="projected" name="Projected" stroke={tc.violet} strokeWidth={2}
                  strokeDasharray="5 4" dot={false} connectNulls={false} isAnimationActive={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}

export default memo(BudgetVsActualChart);
