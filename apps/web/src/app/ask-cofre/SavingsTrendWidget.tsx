'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import { makeChartTheme, fmt } from '@/components/dashboard/chartTheme';
import type { SavingsTrendWidgetData } from '@/hooks/useAiChat';

function shortMonth(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'short' });
}
function monthEndLabel(m: string) {
  const [y, mo] = m.split('-');
  const last = new Date(Number(y), Number(mo), 0);
  return last.toLocaleString('default', { month: 'short', day: 'numeric' });
}

export default function SavingsTrendWidget({ data }: { data: SavingsTrendWidgetData }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const chartData = data.months.map((m) => ({ month: shortMonth(m.month), net: m.net }));
  const currentMonthKey = data.months.at(-1)?.month;

  return (
    <div className="mt-2 p-4 rounded-2xl flex flex-col gap-3 max-w-lg"
      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between">
        <ResponsiveContainer width="60%" height={100}>
          <BarChart data={chartData}>
            <CartesianGrid {...th.grid} />
            <XAxis dataKey="month" {...th.xAxis} />
            <YAxis {...th.yAxis} width={0} tick={false} axisLine={false} tickLine={false} />
            <Tooltip {...th.tooltip} formatter={(v: unknown) => [`$${fmt(Number(v))}`, 'Saved']} />
            <Bar dataKey="net" fill={tc.green} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-2 text-right pl-3">
          <div>
            <p className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>
              Projected {currentMonthKey ? monthEndLabel(currentMonthKey) : ''}
            </p>
            <p className="font-bold text-sm">${fmt(data.projected)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>6-month avg</p>
            <p className="font-bold text-sm" style={{ color: 'var(--color-text-secondary)' }}>${fmt(data.sixMonthAvg)}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
        <span>{data.transactionCount} transactions</span>
        <span>·</span>
        <span>{data.accountCount} accounts</span>
        <span>·</span>
        <span>6 months history</span>
      </div>
    </div>
  );
}
