'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import { makeChartTheme } from '@/components/dashboard/chartTheme';
import type { PacePoint } from '@/lib/reports/compute';
import { money, Empty } from './ui';

/** Cumulative spending by day of period: this period (solid) against the previous one (dashed). */
export default function PaceChart({ points, prevLabel }: { points: PacePoint[]; prevLabel: string }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const lastCur = [...points].reverse().find((p) => p.cur != null);
  if (!lastCur) return <Empty text="No spending recorded in this period yet." />;
  const prevAtSameDay = points[lastCur.day - 1]?.prev ?? null;
  const ahead = prevAtSameDay != null ? lastCur.cur! - prevAtSameDay : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
            <CartesianGrid {...th.grid} strokeDasharray="3 6" />
            <XAxis dataKey="day" {...th.xAxis} tickFormatter={(d) => `D${d}`} interval="preserveStartEnd" minTickGap={24} />
            <YAxis {...th.yAxis} />
            <Tooltip {...th.tooltip} labelFormatter={(d) => `Day ${d}`} formatter={(v: unknown, name: unknown) => [money(Number(v)), name === 'cur' ? 'This period' : prevLabel]} />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === 'cur' ? 'This period' : prevLabel)} />
            <Line type="monotone" dataKey="prev" stroke={tc.textMuted} strokeWidth={2} strokeDasharray="6 5" dot={false} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="cur" stroke={tc.primary} strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
        Day {lastCur.day}: <span className="font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{money(lastCur.cur!)}</span> spent
        {prevAtSameDay != null && ahead != null && (
          <> · <span className="font-bold tabular-nums" style={{ color: ahead > 0 ? tc.rose : tc.green }}>{money(Math.abs(ahead))} {ahead > 0 ? 'more' : 'less'}</span> than the same day of {prevLabel}</>
        )}
      </p>
    </div>
  );
}
