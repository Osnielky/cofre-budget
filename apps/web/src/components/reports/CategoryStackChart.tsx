'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import { makeChartTheme } from '@/components/dashboard/chartTheme';
import { Legend } from '@/components/dashboard/Panel';
import type { CategoryStack } from '@/lib/reports/compute';
import { money, Empty } from './ui';

/** Per-month stacked totals for the period's top buckets, the rest as Other. */
export default function CategoryStackChart({ stack }: { stack: CategoryStack }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  if (stack.series.length === 0) return <Empty text="Nothing to chart for this period." />;
  const single = stack.points.length === 1;
  return (
    <div className="flex flex-col gap-2">
      <Legend items={stack.series.map((s) => ({ label: s.name, color: s.color }))} />
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stack.points} margin={{ top: 8, right: 8, left: -6, bottom: 0 }} barCategoryGap={single ? '60%' : '28%'}>
            <CartesianGrid {...th.grid} strokeDasharray="3 6" />
            <XAxis dataKey="label" {...th.xAxis} />
            <YAxis {...th.yAxis} />
            <Tooltip {...th.tooltip} formatter={(v: unknown, name: unknown) => [money(Number(v)), stack.series.find((s) => s.id === name)?.name ?? String(name)]} />
            {stack.series.map((s, i) => (
              <Bar key={s.id} dataKey={s.id} stackId="a" fill={s.color} stroke={tc.elevated} strokeWidth={1}
                radius={i === stack.series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
