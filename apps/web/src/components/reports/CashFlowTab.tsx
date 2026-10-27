'use client';

import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import { makeChartTheme } from '@/components/dashboard/chartTheme';
import { Legend } from '@/components/dashboard/Panel';
import type { MonthPoint } from '@/lib/reports/compute';
import { monthLabel } from '@/lib/reports/range';
import { money, Card, Empty } from './ui';

/* Income (green, left) vs spending (rose, right) per month with the net line.
   Fixed bar order + legend + labelled table, so identity never rests on the
   green/red pair alone (see the cash-flow note in CLAUDE.md). */
export default function CashFlowTab({ months }: { months: MonthPoint[] }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  if (months.every((m) => m.income === 0 && m.spending === 0)) return <Card title="Cash flow"><Empty text="No cash-flow activity in this period." /></Card>;
  const tot = months.reduce((s, m) => ({ income: s.income + m.income, spending: s.spending + m.spending, net: s.net + m.net }), { income: 0, spending: 0, net: 0 });
  return (
    <div className="flex flex-col gap-4">
      <Card title="Income vs spending by month" subtitle="Cash-flow transactions only: transfers, savings moves and tracking accounts excluded"
        right={<Legend items={[{ label: 'Income', color: tc.green }, { label: 'Spending', color: tc.rose }, { label: 'Net', color: tc.violet, line: true }]} />}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={months} margin={{ top: 8, right: 8, left: -6, bottom: 0 }} barCategoryGap="28%" barGap={3}>
              <CartesianGrid {...th.grid} strokeDasharray="3 6" />
              <XAxis dataKey="label" {...th.xAxis} />
              <YAxis {...th.yAxis} />
              <Tooltip {...th.tooltip} formatter={(v: unknown, name: unknown) => [money(Number(v)), name === 'income' ? 'Income' : name === 'spending' ? 'Spending' : 'Net']} />
              <ReferenceLine y={0} stroke={tc.border} />
              <Bar dataKey="income" fill={tc.green} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="spending" fill={tc.rose} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line type="monotone" dataKey="net" stroke={tc.violet} strokeWidth={2.5} dot={{ r: 3, fill: tc.violet, stroke: tc.elevated, strokeWidth: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card title="Month by month" pad={false}>
        <div className="overflow-x-auto px-4 sm:px-5 pb-4 sm:pb-5">
          <table className="w-full text-[12.5px] min-w-[480px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-left" style={{ color: 'var(--color-text-muted)' }}>
                <th className="py-2 pr-3 font-semibold">Month</th>
                <th className="py-2 px-3 font-semibold text-right">Income</th>
                <th className="py-2 px-3 font-semibold text-right">Spending</th>
                <th className="py-2 px-3 font-semibold text-right">Net</th>
                <th className="py-2 pl-3 font-semibold text-right">Savings rate</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.key} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td className="py-2 pr-3 font-semibold" style={{ color: 'var(--color-text-primary)' }}>{monthLabel(m.key)}</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={{ color: tc.green }}>{money(m.income)}</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={{ color: tc.rose }}>{money(m.spending)}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-bold" style={{ color: m.net < 0 ? tc.rose : 'var(--color-text-primary)' }}>{money(m.net)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{m.income > 0 ? `${((m.net / m.income) * 100).toFixed(0)}%` : '—'}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--color-border)' }}>
                <td className="py-2 pr-3 font-bold">Total</td>
                <td className="py-2 px-3 text-right tabular-nums font-bold" style={{ color: tc.green }}>{money(tot.income)}</td>
                <td className="py-2 px-3 text-right tabular-nums font-bold" style={{ color: tc.rose }}>{money(tot.spending)}</td>
                <td className="py-2 px-3 text-right tabular-nums font-bold" style={{ color: tot.net < 0 ? tc.rose : 'var(--color-text-primary)' }}>{money(tot.net)}</td>
                <td className="py-2 pl-3 text-right tabular-nums font-bold">{tot.income > 0 ? `${((tot.net / tot.income) * 100).toFixed(0)}%` : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
