'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '@/components/dashboard/Panel';
import { makeChartTheme } from '@/components/dashboard/chartTheme';
import type { AdminStats } from '@/lib/admin/types';

const label = (week: string) =>
  new Date(`${week}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function SignupsChart({ weeks }: { weeks: AdminStats['users']['weeklySignups'] }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const data = weeks.map((w) => ({ ...w, label: label(w.week) }));
  return (
    <Panel title="Signups per week" subtitle="Last 12 weeks">
      {data.length === 0 ? <PanelEmpty message="No signups yet." /> : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid {...th.grid} strokeDasharray="3 6" />
              <XAxis dataKey="label" {...th.xAxis} interval="preserveStartEnd" />
              <YAxis {...th.yAxis} tickFormatter={(v: number) => String(v)} allowDecimals={false} width={32} />
              <Tooltip {...th.tooltip} formatter={(v: unknown) => [String(v), 'Signups']} />
              <Bar dataKey="count" fill={tc.green} radius={[6, 6, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
