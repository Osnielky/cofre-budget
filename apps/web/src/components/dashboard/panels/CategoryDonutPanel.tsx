'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '../Panel';
import { makeChartTheme, fmt } from '../chartTheme';
import type { CategorySlice } from '@/lib/dashboard/derive';

interface Props {
  title: string; subtitle: string;
  slices: CategorySlice[]; total: number; loading: boolean;
  colSpan?: 1 | 2;
}

function IconChip({ slice }: { slice: CategorySlice }) {
  return (
    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px] shrink-0"
      style={{ background: `color-mix(in srgb, ${slice.color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${slice.color} 30%, transparent)` }}>
      {slice.icon && slice.icon !== '·'
        ? <span aria-hidden="true">{slice.icon}</span>
        : <span className="w-2.5 h-2.5 rounded-full" style={{ background: slice.color }} />}
    </span>
  );
}

export default function CategoryDonutPanel({ title, subtitle, slices, total, loading, colSpan = 1 }: Props) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const [mode, setMode] = useState<'amount' | 'percent'>('amount');
  const max = slices.reduce((m, s) => Math.max(m, s.value), 0) || 1;
  const top = slices[0];
  const smallest = slices.length > 1 ? [...slices].filter((s) => s.id !== 'other').sort((a, b) => a.value - b.value)[0] : null;

  const toggleBtn = (m: 'amount' | 'percent', label: string) => (
    <button key={m} onClick={() => setMode(m)}
      className="px-2.5 py-1 rounded-md text-[10.5px] font-semibold transition-all cursor-pointer"
      style={mode === m
        ? { background: 'color-mix(in srgb, var(--color-primary) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 35%, transparent)', color: 'var(--color-primary)' }
        : { background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
      {label}
    </button>
  );

  return (
    <Panel title={title} subtitle={subtitle} loading={loading} colSpan={colSpan}
      legend={slices.length > 0 ? (
        <div className="flex items-center gap-1.5">{toggleBtn('amount', '$ Amount')}{toggleBtn('percent', '% Percent')}</div>
      ) : undefined}>
      {slices.length === 0 ? <PanelEmpty message="Nothing categorized here yet." /> : (
        <div className="flex flex-col gap-4 flex-1">
          <div className="flex items-center gap-5 flex-wrap sm:flex-nowrap flex-1">
            {/* Donut */}
            <div className="relative shrink-0 mx-auto sm:mx-0" style={{ width: 190, height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slices} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92}
                    paddingAngle={2} cornerRadius={5} strokeWidth={0}>
                    {slices.map((s) => <Cell key={s.id} fill={s.color} />)}
                  </Pie>
                  <Tooltip {...th.tooltip} formatter={(v: unknown, name: unknown) => [`$${fmt(Number(v))}`, String(name)]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Total</p>
                <p className="text-lg font-bold tabular-nums">${fmt(total)}</p>
              </div>
            </div>

            {/* Category table */}
            <div className="flex-1 min-w-0 flex flex-col gap-1 justify-evenly self-stretch">
              <div className="flex items-center gap-2.5 text-[10px] pb-1" style={{ color: 'var(--color-text-muted)' }}>
                <span className="flex-1">Category</span>
                <span className="w-20 text-right">{mode === 'amount' ? 'Amount' : 'Percent'}</span>
                <span className="w-12 text-right">{mode === 'amount' ? '% of total' : 'Amount'}</span>
              </div>
              {slices.map((s) => (
                <div key={s.id} className="flex items-center gap-2.5 min-w-0">
                  <IconChip slice={s} />
                  <span className="text-xs truncate w-24 sm:w-28" style={{ color: 'var(--color-text-secondary)' }}>{s.name}</span>
                  <div className="flex-1 h-1.5 rounded-full min-w-6" style={{ background: 'color-mix(in srgb, var(--color-text-muted) 14%, transparent)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(s.value / max) * 100}%`, background: s.color }} />
                  </div>
                  <span className="w-20 text-right text-xs font-bold tabular-nums">
                    {mode === 'amount' ? `$${fmt(s.value)}` : `${s.pct}%`}
                  </span>
                  <span className="w-12 text-right">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums"
                      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                      {mode === 'amount' ? `${Math.round(s.pct)}%` : `$${fmt(s.value)}`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer stats — only the ones derivable from this panel's data */}
          {top && smallest && (
            <div className="grid grid-cols-2 gap-2.5 pt-3 mt-auto" style={{ borderTop: '1px solid var(--color-border)' }}>
              {[{ label: 'Top category', s: top }, { label: 'Smallest category', s: smallest }].map(({ label, s }) => (
                <div key={label} className="flex items-center gap-2.5 rounded-xl py-2 px-3 min-w-0"
                  style={{ border: 'var(--glass-border)', background: `color-mix(in srgb, ${s.color} 4%, transparent)` }}>
                  <IconChip slice={s} />
                  <div className="min-w-0">
                    <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
                    <p className="text-xs font-bold truncate">{s.name}</p>
                  </div>
                  <div className="ml-auto text-right shrink-0">
                    <p className="text-xs font-bold tabular-nums" style={{ color: s.color }}>${fmt(s.value)}</p>
                    <p className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>{s.pct}% of total</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
