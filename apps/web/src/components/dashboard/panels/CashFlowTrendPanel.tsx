'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { Legend, PanelEmpty } from '../Panel';
import { makeChartTheme, fmt } from '../chartTheme';
import type { TrendPoint } from '@/lib/dashboard/derive';

const LABELS: Record<string, string> = { income: 'Income', expenses: 'Expenses', net: 'Net cash flow' };

export default function CashFlowTrendPanel({ data, loading }: { data: TrendPoint[]; loading: boolean }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const empty = !loading && data.every((p) => p.income === 0 && p.expenses === 0);
  return (
    <Panel colSpan={2} title="Cash-Flow Trend" subtitle={`Last ${data.length} months`} loading={loading}
      legend={<Legend items={[
        { label: 'Income', color: tc.green, line: true },
        { label: 'Expenses', color: tc.orange, line: true },
        { label: 'Net', color: tc.violet, line: true },
      ]} />}>
      {empty ? <PanelEmpty message="No activity in this window." /> : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid {...th.grid} />
            <XAxis dataKey="month" {...th.xAxis} />
            <YAxis {...th.yAxis} />
            <Tooltip {...th.tooltip}
              formatter={(v: unknown, name: unknown) => {
                const n = Number(v);
                return [`${n < 0 ? '-' : ''}$${fmt(Math.abs(n))}`, LABELS[String(name)] ?? String(name)];
              }} />
            <ReferenceLine y={0} stroke={tc.border} />
            <Line type="monotone" dataKey="income" stroke={tc.green} strokeWidth={2} dot={{ fill: tc.green, r: 3, strokeWidth: 0 }} />
            <Line type="monotone" dataKey="expenses" stroke={tc.orange} strokeWidth={2} dot={{ fill: tc.orange, r: 3, strokeWidth: 0 }} />
            <Line type="monotone" dataKey="net" stroke={tc.violet} strokeWidth={2} dot={{ fill: tc.violet, r: 3, strokeWidth: 0 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
