'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import { makeChartTheme, fmt } from '@/components/dashboard/chartTheme';
import type { SafeToSpendWidgetData } from '@/hooks/useAiChat';

function StatChip({ icon, iconBg, label, value }: { icon: React.ReactNode; iconBg: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl flex-1 min-w-0"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: iconBg }}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase truncate" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
        <p className="font-bold text-sm truncate">${fmt(value === undefined ? 0 : Number(value))}</p>
      </div>
    </div>
  );
}

export default function SafeToSpendWidget({ data }: { data: SafeToSpendWidgetData }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const safe = data.safeAmount >= 0;

  const chartData = [
    { label: 'Income', value: data.income, color: tc.sky },
    { label: 'Planned', value: data.plannedSpending, color: tc.orange },
    { label: safe ? 'Safe to spend' : 'Over budget', value: data.safeAmount, color: safe ? tc.green : tc.rose },
  ];

  return (
    <div className="mt-2 p-4 rounded-2xl flex flex-col gap-3 max-w-lg"
      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
      <p className="text-sm">
        {safe ? (
          <>You can safely save <span className="font-bold" style={{ color: 'var(--color-green)' }}>${fmt(data.safeAmount)}</span> this month.</>
        ) : (
          <>Your planned spending is <span className="font-bold" style={{ color: 'var(--color-rose)' }}>${fmt(Math.abs(data.safeAmount))}</span> over projected income this month.</>
        )}
      </p>

      <div className="flex gap-2 flex-wrap">
        <StatChip
          label="Income" value={String(data.income)}
          iconBg="var(--color-card-sky)"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>}
        />
        <StatChip
          label="Planned spending" value={String(data.plannedSpending)}
          iconBg="var(--color-card-orange)"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>}
        />
        <StatChip
          label="Safety buffer" value={String(data.safetyBuffer)}
          iconBg="var(--color-card-amber)"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/></svg>}
        />
      </div>

      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid {...th.grid} />
          <XAxis dataKey="label" {...th.xAxis} />
          <YAxis {...th.yAxis} width={0} tick={false} axisLine={false} tickLine={false} />
          <Tooltip {...th.tooltip} formatter={(v: unknown) => [`$${fmt(Number(v))}`, '']} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((d) => <Cell key={d.label} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>For {data.month} · buffer is 5% of projected income, held back for surprises</p>
    </div>
  );
}
