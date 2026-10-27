'use client';

import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import { makeChartTheme } from '@/components/dashboard/chartTheme';
import type { WeekdayPoint } from '@/lib/reports/compute';
import { money } from './ui';

/** Average spend per occurrence of each weekday; the heaviest day is highlighted. */
export default function WeekdayChart({ profile }: { profile: WeekdayPoint[] }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const max = Math.max(...profile.map((p) => p.avg));
  const top = profile.find((p) => p.avg === max && max > 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={profile} margin={{ top: 8, right: 8, left: -6, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid {...th.grid} strokeDasharray="3 6" />
            <XAxis dataKey="day" {...th.xAxis} />
            <YAxis {...th.yAxis} />
            <Tooltip {...th.tooltip} formatter={(v: unknown, _n: unknown, item: { payload?: WeekdayPoint }) => [`${money(Number(v))} avg · ${money(item.payload?.total ?? 0)} total`, item.payload?.day ?? '']} />
            <Bar dataKey="avg" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {profile.map((p) => <Cell key={p.day} fill={p.avg === max && max > 0 ? tc.orange : `color-mix(in srgb, ${tc.orange} 45%, transparent)`} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {top && <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>{top.day === 'Sat' || top.day === 'Sun' ? 'Weekends' : `${top.day}s`} are your most expensive days: <span className="font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{money(top.avg)}</span> on an average {top.day}.</p>}
    </div>
  );
}
