'use client';

import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { Legend, PanelEmpty } from '../Panel';
import PeriodSelect from '../PeriodSelect';
import { makeChartTheme, fmt } from '../chartTheme';
import type { CategoryMonth, CategorySlice } from '@/lib/dashboard/derive';

const money = (n: number) => `$${fmt(Math.abs(n))}`;

/** One category's spend month by month, with its average and (if set) its budget. */
export default function CategoryTrendPanel({ categories, selectedId, onSelect, data, budget, loading }: {
  categories: CategorySlice[];
  selectedId: string;
  onSelect: (id: string) => void;
  data: CategoryMonth[];
  budget: number | null;
  loading: boolean;
}) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const selected = categories.find((c) => c.id === selectedId);
  const color = selected?.color ?? tc.sky;

  // The current month is still in progress, so the average uses completed months only.
  const current = data.at(-1);
  const completed = data.slice(0, -1);
  const active = completed.filter((m) => m.value > 0);
  const avg = active.length ? active.reduce((s, m) => s + m.value, 0) / active.length : 0;
  const last = completed.at(-1);
  const delta = last && last.value > 0 && current ? +(((current.value - last.value) / last.value) * 100).toFixed(1) : null;
  const peak = data.reduce<CategoryMonth | undefined>((best, m) => (!best || m.value > best.value ? m : best), undefined);

  const picker = categories.length > 0 && (
    <PeriodSelect value={selectedId} onChange={onSelect} ariaLabel="Category"
      options={categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }))} />
  );

  const stats = [
    { label: 'This month', value: current ? money(current.value) : '—', sub: delta != null ? `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs ${last?.month}` : 'so far', subColor: delta == null ? undefined : delta > 0 ? tc.rose : tc.green },
    { label: 'Monthly avg', value: avg > 0 ? money(avg) : '—', sub: `${active.length} completed month${active.length === 1 ? '' : 's'}` },
    { label: 'Peak month', value: peak && peak.value > 0 ? money(peak.value) : '—', sub: peak && peak.value > 0 ? peak.month : '' },
  ];

  return (
    <Panel colSpan={2} title="Category Trend" subtitle={selected ? `${selected.name} · year to date` : 'Year to date'}
      legend={picker || undefined} loading={loading}>
      {categories.length === 0 ? <PanelEmpty message="No spending this year yet." /> : (
        <div className="flex flex-col gap-3 flex-1">
          <div className="grid grid-cols-3 gap-2.5">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl py-2.5 px-3 min-w-0" style={{ border: 'var(--glass-border)' }}>
                <p className="text-[10.5px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{s.label}</p>
                <p className="text-[14px] font-bold tabular-nums truncate" style={{ color: 'var(--color-text-primary)' }}>{s.value}</p>
                <p className="text-[9.5px] truncate" style={{ color: s.subColor ?? 'var(--color-text-muted)' }}>{s.sub || ' '}</p>
              </div>
            ))}
          </div>

          <div className="flex-1 min-h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid {...th.grid} strokeDasharray="3 6" />
                <XAxis dataKey="month" {...th.xAxis} />
                <YAxis {...th.yAxis} />
                <Tooltip {...th.tooltip} formatter={(v: unknown) => [money(Number(v)), selected?.name ?? 'Spent']} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={36}>
                  {data.map((m, i) => (
                    <Cell key={m.key} fill={color} fillOpacity={i === data.length - 1 ? 0.45 : 0.9} />
                  ))}
                </Bar>
                {avg > 0 && <ReferenceLine y={avg} stroke={tc.textMuted} strokeDasharray="4 4" />}
                {budget != null && budget > 0 && (
                  <ReferenceLine y={budget} stroke={tc.amber} strokeWidth={1.5} ifOverflow="extendDomain"
                    label={{ value: 'Budget', position: 'insideTopRight', fill: tc.amber, fontSize: 10, fontWeight: 600 }} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <Legend items={[
            { label: 'Spent', color },
            { label: 'Average', color: tc.textMuted, line: true },
            budget != null && budget > 0
              ? { label: `Budget ${money(budget)}`, color: tc.amber, line: true }
              : { label: 'No budget set', color: tc.border, line: true },
          ]} />
        </div>
      )}
    </Panel>
  );
}
