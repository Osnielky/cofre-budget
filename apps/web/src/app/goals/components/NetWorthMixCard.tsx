'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import { makeChartTheme, fmt } from '@/components/dashboard/chartTheme';
import type { NetWorthBreakdown } from '@/lib/dashboard/derive';
import { netWorthMix, type MixSlice } from '@/lib/goals/mix';
import { money } from '../format';

interface Props { breakdown: NetWorthBreakdown }

const card = { background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' } as const;

function Row({ slice, sign }: { slice: MixSlice; sign: '+' | '−' }) {
  const tone = sign === '+' ? 'var(--color-text-primary)' : 'var(--color-rose)';
  return (
    <li className="flex items-center gap-2.5 py-1.5 text-sm" title={slice.members ? slice.members.join(', ') : undefined}>
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: slice.color }} aria-hidden="true" />
      <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--color-text-secondary)' }}>
        {slice.label}
        {slice.members && <span style={{ color: 'var(--color-text-muted)' }}> · {slice.members.length} accounts</span>}
      </span>
      <span className="tabular-nums font-semibold shrink-0" style={{ color: tone }}>{sign}{money(slice.value)}</span>
      <span className="w-11 text-right tabular-nums text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>{slice.pct}%</span>
    </li>
  );
}

/** Which accounts add to net worth (donut) and which subtract from it (list), with the sum at the bottom. */
export default function NetWorthMixCard({ breakdown }: Props) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const mix = useMemo(() => netWorthMix(breakdown), [breakdown]);
  /* Accounts pick their own colours and often clash (two blues), so slices take the
     CVD-safe chart palette in order; "Other" keeps its neutral grey. */
  const assets = useMemo(() => {
    const palette = [tc.green, tc.sky, tc.amber, tc.orange, tc.violet].filter(Boolean);
    return mix.assets.map((s, i) => ({ ...s, color: s.id === 'other' || palette.length === 0 ? s.color : palette[i % palette.length] }));
  }, [mix, tc]);
  const liabilities = mix.liabilities.map((s) => ({ ...s, color: tc.rose || s.color }));
  const empty = assets.length === 0 && liabilities.length === 0;

  return (
    <section className="rounded-3xl p-5 sm:p-6 flex flex-col gap-4 min-w-0" style={card}>
      <div>
        <h2 className="text-lg font-bold">What makes up your net worth</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Every account that adds to it, and everything that takes away.</p>
      </div>

      {empty ? (
        <p className="text-sm py-4" style={{ color: 'var(--color-text-secondary)' }}>
          No accounts yet. <Link href="/settings?tab=banks" className="font-semibold" style={{ color: 'var(--color-primary)' }}>Add your first account</Link> and the breakdown appears here.
        </p>
      ) : (
        <>
          {/* Narrow: donut over the lists. Wide (xl, under the chart): donut beside the two lists. */}
          <div className="flex flex-col items-center xl:flex-row xl:items-start gap-4 xl:gap-8">
            {assets.length > 0 && (
              <div className="relative shrink-0" style={{ width: 168, height: 168 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={assets} dataKey="value" nameKey="label" innerRadius={56} outerRadius={82}
                      paddingAngle={assets.length > 1 ? 2 : 0} cornerRadius={5} strokeWidth={0} isAnimationActive={false}>
                      {assets.map((s) => <Cell key={s.id} fill={s.color} />)}
                    </Pie>
                    <Tooltip {...th.tooltip} formatter={(v: unknown, name: unknown) => [`$${fmt(Number(v))}`, String(name)]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Net worth</span>
                  <span className="text-base font-extrabold tabular-nums" style={{ color: mix.net < 0 ? 'var(--color-rose)' : 'var(--color-text-primary)' }}>{money(mix.net)}</span>
                </div>
              </div>
            )}
            <div className="w-full flex-1 min-w-0 grid grid-cols-1 2xl:grid-cols-2 gap-4 2xl:gap-8">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-green)' }}>Adds up · {money(mix.assetTotal)}</p>
              {assets.length === 0
                ? <p className="text-sm py-1" style={{ color: 'var(--color-text-muted)' }}>No assets yet.</p>
                : <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>{assets.map((s) => <Row key={s.id} slice={s} sign="+" />)}</ul>}
            </div>

          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-rose)' }}>Takes away · {money(mix.liabilityTotal)}</p>
              {mix.liabilityShare != null && liabilities.length > 0 && (
                <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{mix.liabilityShare}% of your assets</span>
              )}
            </div>
            {liabilities.length === 0 ? (
              <p className="text-sm py-1" style={{ color: 'var(--color-text-muted)' }}>Nothing. You owe no one.</p>
            ) : (
              <>
                {mix.liabilityShare != null && (
                  <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ background: 'var(--color-elevated)' }} aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, mix.liabilityShare)}%`, background: 'var(--color-rose)' }} />
                  </div>
                )}
                <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>{liabilities.map((s) => <Row key={s.id} slice={s} sign="−" />)}</ul>
              </>
            )}
          </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-3 text-xs" style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
            <span className="tabular-nums">
              <span style={{ color: 'var(--color-green)' }}>{money(mix.assetTotal)}</span>
              {' − '}
              <span style={{ color: 'var(--color-rose)' }}>{money(mix.liabilityTotal)}</span>
              {' = '}
              <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>{money(mix.net)}</span>
            </span>
            <Link href="/settings?tab=banks" className="font-semibold" style={{ color: 'var(--color-primary)' }}>Manage accounts →</Link>
          </div>
        </>
      )}
    </section>
  );
}
