'use client';

import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import { makeChartTheme } from '@/components/dashboard/chartTheme';
import { makeBucketer, inCashFlow } from '@/lib/dashboard/derive';
import type { Transaction, Project } from '@/lib/dashboard/types';
import { merchantRows, type CategoryRow } from '@/lib/reports/compute';
import { shortMonth, parseYmd } from '@/lib/reports/range';
import { money, Delta, Empty } from './ui';

/**
 * Ranked bucket list with share bars and change chips. Clicking a row opens
 * an inline drill-down: that bucket's monthly totals, its merchants and its
 * transactions, all from the same filtered rows.
 */
export default function CategoryList({ rows, cur, months, projects, dir, prevLabel, limit = 12 }: {
  rows: CategoryRow[]; cur: Transaction[]; months: string[]; projects: Project[]; dir: 'income' | 'expense'; prevLabel: string; limit?: number;
}) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const bucket = useMemo(() => makeBucketer(projects), [projects]);
  const max = rows[0]?.value ?? 0;
  const visible = showAll ? rows : rows.slice(0, limit);
  if (rows.length === 0) return <Empty text={dir === 'income' ? 'No income in this period.' : 'No spending in this period.'} />;

  return (
    <div className="flex flex-col">
      {visible.map((r, i) => {
        const isOpen = open === r.id;
        const txs = isOpen ? cur.filter((t) => inCashFlow(t) && (dir === 'income' ? Number(t.amount) > 0 : Number(t.amount) < 0) && bucket(t).id === r.id) : [];
        const monthly = isOpen ? months.map((m) => ({ label: shortMonth(m), value: +txs.filter((t) => t.date.startsWith(m)).reduce((s, t) => s + Math.abs(Number(t.amount)), 0).toFixed(2) })) : [];
        const merchants = isOpen ? merchantRows(txs, [], months, dir).slice(0, 5) : [];
        const recent = isOpen ? [...txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8) : [];
        return (
          <div key={r.id} style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : undefined}>
            <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}
              className="w-full flex items-center gap-3 py-2.5 text-left cursor-pointer min-w-0">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[15px] shrink-0"
                style={{ background: `color-mix(in srgb, ${r.color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${r.color} 35%, transparent)` }}>{r.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{r.name}</p>
                  <p className="text-[13px] font-bold tabular-nums shrink-0">{money(r.value)}</p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--color-text-muted) 14%, transparent)' }}>
                    <div className="h-full rounded-full" style={{ width: `${max > 0 ? (r.value / max) * 100 : 0}%`, background: r.color }} />
                  </div>
                  <span className="text-[10.5px] tabular-nums w-10 text-right shrink-0" style={{ color: 'var(--color-text-muted)' }}>{r.share.toFixed(0)}%</span>
                  <span className="hidden sm:inline text-[10.5px] tabular-nums w-14 text-right shrink-0" style={{ color: 'var(--color-text-muted)' }}>{r.count} tx</span>
                  <Delta value={r.delta} inverse={dir === 'expense'} className="w-16 justify-end" />
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--color-text-muted)' }}><path d="M6 9l6 6 6-6" /></svg>
            </button>

            {isOpen && (
              <div className="pb-4 pl-11 grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>By month · vs {prevLabel}: {money(r.prevValue)}</p>
                  {months.length > 1 ? (
                    <div className="h-28">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthly} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                          <CartesianGrid {...th.grid} strokeDasharray="3 6" />
                          <XAxis dataKey="label" {...th.xAxis} />
                          <YAxis {...th.yAxis} width={40} />
                          <Tooltip {...th.tooltip} formatter={(v: unknown) => [money(Number(v)), r.name]} />
                          <Bar dataKey="value" fill={r.color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{money(r.value)} this period · {r.count} transaction{r.count === 1 ? '' : 's'} · avg {money(r.count ? r.value / r.count : 0)}</p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>Top merchants</p>
                  <ul className="flex flex-col gap-1">
                    {merchants.map((m) => (
                      <li key={m.name} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{m.name} <span style={{ color: 'var(--color-text-muted)' }}>×{m.count}</span></span>
                        <span className="tabular-nums font-semibold shrink-0">{money(m.total)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>Latest transactions</p>
                  <ul className="flex flex-col gap-1">
                    {recent.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>
                          <span className="tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{parseYmd(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> {t.name}
                        </span>
                        <span className="tabular-nums font-semibold shrink-0">{money(Math.abs(Number(t.amount)))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {rows.length > limit && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="self-start mt-2 text-xs font-semibold cursor-pointer" style={{ color: 'var(--color-primary)' }}>
          {showAll ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}
