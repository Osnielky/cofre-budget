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

/** Six months of net savings beside (phones: above) the projection for this month. */
export default function SavingsTrendWidget({ data }: { data: SavingsTrendWidgetData }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const chartData = data.months.map((m) => ({ month: shortMonth(m.month), net: m.net }));
  const currentMonthKey = data.months.at(-1)?.month;

  return (
    <div className="mt-2 p-3.5 sm:p-4 rounded-2xl flex flex-col gap-3 w-full max-w-lg min-w-0"
      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
        <div className="w-full sm:w-[60%] min-w-0" style={{ height: 96 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid {...th.grid} />
              <XAxis dataKey="month" {...th.xAxis} />
              <YAxis {...th.yAxis} width={0} tick={false} axisLine={false} tickLine={false} />
              <Tooltip {...th.tooltip} formatter={(v: unknown) => [`$${fmt(Number(v))}`, 'Saved']} />
              <Bar dataKey="net" fill={tc.green} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex sm:flex-col justify-between gap-3 sm:gap-2 sm:text-right sm:pl-3 sm:flex-1 min-w-0">
          <div className="min-w-0">
            <p className="text-[10px] uppercase truncate" style={{ color: 'var(--color-text-muted)' }}>
              Projected {currentMonthKey ? monthEndLabel(currentMonthKey) : ''}
            </p>
            <p className="font-bold text-sm tabular-nums">${fmt(data.projected)}</p>
          </div>
          <div className="min-w-0 text-right sm:text-right">
            <p className="text-[10px] uppercase truncate" style={{ color: 'var(--color-text-muted)' }}>6-month avg</p>
            <p className="font-bold text-sm tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>${fmt(data.sixMonthAvg)}</p>
          </div>
        </div>
      </div>
      <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>
        {data.transactionCount} transactions · {data.accountCount} accounts · 6 months history
      </p>
    </div>
  );
}
