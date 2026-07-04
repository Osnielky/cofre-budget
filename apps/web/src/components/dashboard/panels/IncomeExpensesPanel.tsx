'use client';

import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { Legend, PanelEmpty } from '../Panel';
import { makeChartTheme, fmt } from '../chartTheme';
import type { CashFlowMonth } from '@/lib/dashboard/derive';

const LABELS: Record<string, string> = {
  revPersonal: 'Income', revProject: 'Project income',
  expPersonal: 'Expenses', expProject: 'Project expenses', net: 'Net',
};

export default function IncomeExpensesPanel({ data, loading }: { data: CashFlowMonth[]; loading: boolean }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const income = data.reduce((s, m) => s + m.revPersonal + m.revProject, 0);
  const expenses = data.reduce((s, m) => s + m.expPersonal + m.expProject, 0);
  const net = +(income - expenses).toFixed(2);
  const empty = !loading && income === 0 && expenses === 0;
  return (
    <Panel title="Income vs Expenses" subtitle={`${new Date().getFullYear()} · year to date`} loading={loading}
      legend={<Legend items={[
        { label: 'Income', color: tc.green }, { label: 'Project income', color: tc.sky },
        { label: 'Expenses', color: tc.orange }, { label: 'Project expenses', color: tc.amber },
        { label: 'Net', color: tc.violet, line: true },
      ]} />}>
      {empty ? <PanelEmpty message="No cash-flow activity this year yet." /> : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={data} barCategoryGap="30%" barGap={3}>
              <CartesianGrid {...th.grid} />
              <XAxis dataKey="month" {...th.xAxis} />
              <YAxis {...th.yAxis} />
              <Tooltip {...th.tooltip}
                formatter={(v: unknown, name: unknown) => {
                  const n = Number(v);
                  return [`${n < 0 ? '-' : ''}$${fmt(Math.abs(n))}`, LABELS[String(name)] ?? String(name)];
                }} />
              <ReferenceLine y={0} stroke={tc.border} />
              <Bar dataKey="revPersonal" stackId="rev" fill={tc.green} fillOpacity={0.85} />
              <Bar dataKey="revProject" stackId="rev" fill={tc.sky} fillOpacity={0.85} radius={[4, 4, 0, 0]} />
              <Bar dataKey="expPersonal" stackId="exp" fill={tc.orange} fillOpacity={0.85} />
              <Bar dataKey="expProject" stackId="exp" fill={tc.amber} fillOpacity={0.85} radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="net" stroke={tc.violet} strokeWidth={2} dot={{ fill: tc.violet, r: 3, strokeWidth: 0 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            {[{ l: 'Total income', v: income, c: tc.green }, { l: 'Total expenses', v: expenses, c: tc.orange }, { l: 'Net', v: net, c: net >= 0 ? tc.green : tc.rose }].map((s) => (
              <div key={s.l} className="rounded-xl py-2 px-1" style={{ border: 'var(--glass-border)' }}>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{s.l}</p>
                <p className="text-sm font-bold" style={{ color: s.c }}>{s.v < 0 ? '-' : ''}${fmt(Math.abs(s.v))}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
