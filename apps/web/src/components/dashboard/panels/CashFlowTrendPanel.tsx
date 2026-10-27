'use client';

import { useState } from 'react';
import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { Legend, PanelEmpty } from '../Panel';
import { makeChartTheme, fmt } from '../chartTheme';
import type { TrendPoint } from '@/lib/dashboard/derive';

const LABELS: Record<string, string> = { income: 'Income', expenses: 'Expenses', net: 'Net cash flow' };
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/* Monthly-granularity series → only month-based ranges are honest. */
const RANGES = [
  { id: '3M', months: 3 },
  { id: '6M', months: 6 },
  { id: 'YTD', months: 12 },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

const money = (n: number) => `${n < 0 ? '-' : ''}$${fmt(Math.abs(n))}`;

function MiniIcon({ d, size = 15 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const I_UP     = 'M22 7l-8.5 8.5-5-5L2 17 M16 7h6v6';
const I_DOWN   = 'M22 17l-8.5-8.5-5 5L2 7 M16 17h6v-6';
const I_PULSE  = 'M2 12h4l3-8 6 16 3-8h4';
const I_TROPHY = 'M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0V4Z M7 6H4v2a3 3 0 0 0 3 3 M17 6h3v2a3 3 0 0 1-3 3';
const I_PCT    = 'M19 5L5 19 M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z M16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z';

function Chip({ color, d, size = 34 }: { color: string; d: string; size?: number }) {
  return (
    <span className="rounded-full flex items-center justify-center shrink-0"
      style={{
        width: size, height: size, color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
        boxShadow: `0 0 10px color-mix(in srgb, ${color} 22%, transparent)`,
      }}>
      <MiniIcon d={d} />
    </span>
  );
}

export default function CashFlowTrendPanel({ data, loading }: { data: TrendPoint[]; loading: boolean }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const [range, setRange] = useState<RangeId>('6M');

  const months = RANGES.find((r) => r.id === range)!.months;
  const visible = data.slice(-months);
  const prev = data.slice(-(months * 2), -months); // same-length preceding window, if the year has one
  const empty = !loading && visible.every((p) => p.income === 0 && p.expenses === 0);

  const avg = (rows: TrendPoint[], f: (p: TrendPoint) => number) =>
    rows.length ? rows.reduce((s, p) => s + f(p), 0) / rows.length : 0;
  const deltaPct = (cur: number, old: number) =>
    prev.length > 0 && old !== 0 ? +(((cur - old) / Math.abs(old)) * 100).toFixed(1) : null;

  /* On phones Net leads as a full-width hero (`order-first`) above income | expenses. */
  const stats = [
    { label: 'Average Income',   cur: avg(visible, (p) => p.income),   old: avg(prev, (p) => p.income),   color: tc.green,  icon: I_UP,    inverse: false, hero: false },
    { label: 'Average Expenses', cur: avg(visible, (p) => p.expenses), old: avg(prev, (p) => p.expenses), color: tc.orange, icon: I_DOWN,  inverse: true,  hero: false },
    { label: 'Average Net',      cur: avg(visible, (p) => p.net),      old: avg(prev, (p) => p.net),      color: tc.violet, icon: I_PULSE, inverse: false, hero: true },
  ].map((s) => ({ ...s, delta: deltaPct(s.cur, s.old) }));

  /* Footer superlatives — month names resolved from the YTD series position. */
  const idxOf = (rows: TrendPoint[], f: (p: TrendPoint) => number) =>
    rows.reduce((best, p, i) => (f(p) > f(rows[best]) ? i : best), 0);
  /* data covers Jan..current month, so its index IS the calendar month. */
  const fullName = (p?: TrendPoint) => (p ? MONTHS_FULL[data.indexOf(p)] ?? p.month : '');
  const bestNet = visible.length ? visible[idxOf(visible, (p) => p.net)] : undefined;
  const hiExp = visible.length ? visible[idxOf(visible, (p) => p.expenses)] : undefined;
  const totIncome = visible.reduce((s, p) => s + p.income, 0);
  const savingsRate = totIncome > 0 ? +((visible.reduce((s, p) => s + p.net, 0) / totIncome) * 100).toFixed(1) : null;

  return (
    <Panel colSpan={2} title="Cash-Flow Trend" subtitle={range === 'YTD' ? 'Year to date' : `Last ${visible.length} months`} loading={loading}
      legend={
        /* Phones: pills left, legend right on one line under the title; from sm both sit right. */
        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
            {RANGES.map((r) => (
              <button key={r.id} onClick={() => setRange(r.id)}
                className="px-2.5 py-1 rounded-md text-[10.5px] font-semibold transition-all cursor-pointer"
                style={range === r.id
                  ? { background: 'color-mix(in srgb, var(--color-primary) 20%, transparent)', color: 'var(--color-primary)' }
                  : { color: 'var(--color-text-muted)' }}>
                {r.id}
              </button>
            ))}
          </div>
          <Legend items={[
            { label: 'Income', color: tc.green, line: true },
            { label: 'Expenses', color: tc.orange, line: true },
            { label: 'Net', color: tc.violet, line: true },
          ]} />
        </div>
      }>
      {empty ? <PanelEmpty message="No activity in this window." /> : (
        <div className="flex flex-col gap-3 flex-1">
          {/* Averages */}
          {/* Phones: Net is a full-width hero tile (with its chip) over income | expenses without
              chips; from sm the chips return, DOM order holds and auto-fit decides. */}
          <div className="grid gap-2 sm:gap-2.5 [--tile-min:120px] sm:[--tile-min:170px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(var(--tile-min), 1fr))' }}>
            {stats.map((s) => {
              const good = s.delta == null ? true : (s.inverse ? s.delta < 0 : s.delta > 0);
              return (
                <div key={s.label}
                  className={`flex items-center gap-3 rounded-xl py-2 sm:py-2.5 px-3 min-w-0 ${s.hero ? 'order-first sm:order-none col-span-2 sm:col-span-1' : ''}`}
                  style={{ border: 'var(--glass-border)', background: `color-mix(in srgb, ${s.color} 4%, transparent)` }}>
                  <span className={`${s.hero ? 'block' : 'hidden'} sm:block`}><Chip color={s.color} d={s.icon} /></span>
                  <div className="min-w-0">
                    <p className="text-[10.5px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{s.label}</p>
                    <p className={`${s.hero ? 'text-[19px]' : 'text-[14px]'} sm:text-[14px] font-bold tabular-nums`} style={{ color: s.color }}>{money(+s.cur.toFixed(2))}</p>
                    {s.delta != null ? (
                      <p className="text-[9.5px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                        vs previous {prev.length} mo{' '}
                        <span className="font-bold" style={{ color: good ? tc.green : tc.rose }}>
                          {s.delta > 0 ? '▲' : '▼'} {Math.abs(s.delta)}%
                        </span>
                      </p>
                    ) : (
                      <p className="text-[9.5px] truncate" style={{ color: 'var(--color-text-muted)' }}>per month</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chart */}
          <div className="flex-1 min-h-44">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={visible}>
                <defs>
                  {[['cftInc', tc.green], ['cftExp', tc.orange], ['cftNet', tc.violet]].map(([id, c]) => (
                    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={c} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid {...th.grid} strokeDasharray="3 6" />
                <XAxis dataKey="month" {...th.xAxis} />
                <YAxis {...th.yAxis} />
                <Tooltip {...th.tooltip}
                  formatter={(v: unknown, name: unknown) =>
                    [money(Number(v)), LABELS[String(name)] ?? String(name)]} />
                <ReferenceLine y={0} stroke={tc.border} />
                <Area type="monotone" dataKey="income" stroke={tc.green} strokeWidth={2.5} fill="url(#cftInc)"
                  dot={{ r: 4, fill: tc.green, stroke: tc.elevated, strokeWidth: 2 }} activeDot={{ r: 5, fill: tc.green, stroke: tc.elevated, strokeWidth: 2 }} />
                <Area type="monotone" dataKey="expenses" stroke={tc.orange} strokeWidth={2.5} fill="url(#cftExp)"
                  dot={{ r: 4, fill: tc.orange, stroke: tc.elevated, strokeWidth: 2 }} activeDot={{ r: 5, fill: tc.orange, stroke: tc.elevated, strokeWidth: 2 }} />
                <Area type="monotone" dataKey="net" stroke={tc.violet} strokeWidth={2.5} fill="url(#cftNet)"
                  dot={{ r: 4, fill: tc.violet, stroke: tc.elevated, strokeWidth: 2 }} activeDot={{ r: 5, fill: tc.violet, stroke: tc.elevated, strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Superlatives */}
          {/* Phones: one line each (dot · label · value right-aligned). From sm: chips with the
              label stacked over the value, the second and third separated by a left rule. */}
          <div className="flex flex-wrap items-stretch gap-x-5 gap-y-2 sm:gap-y-2.5 rounded-xl py-2.5 px-3 sm:px-3.5 mt-auto"
            style={{ border: 'var(--glass-border)', background: 'color-mix(in srgb, var(--color-elevated) 55%, transparent)' }}>
            {[
              bestNet && { label: 'Best net month', short: 'Best net', color: tc.green, icon: I_TROPHY,
                text: <>{fullName(bestNet)} · {money(bestNet.net)}</> },
              hiExp && { label: 'Highest expense month', short: 'Highest expense', color: tc.orange, icon: I_UP,
                text: <>{fullName(hiExp)} · {money(hiExp.expenses)}</> },
              savingsRate != null && { label: 'Savings rate (avg)', short: 'Savings rate', color: tc.violet, icon: I_PCT,
                text: <>{savingsRate}% <span className="font-normal" style={{ color: 'var(--color-text-muted)' }}>of income</span></> },
            ].filter((h): h is Exclude<typeof h, false | undefined | null> => Boolean(h)).map((h, i) => (
              <div key={h.label}
                className={`flex items-center gap-2.5 min-w-0 w-full sm:w-auto ${i > 0 ? 'sm:pl-5 sm:border-l' : ''}`}
                style={{ borderColor: 'var(--color-border)' }}>
                <span className="hidden sm:block"><Chip color={h.color} d={h.icon} size={30} /></span>
                <span aria-hidden="true" className="sm:hidden w-1.5 h-1.5 rounded-full shrink-0" style={{ background: h.color }} />
                <div className="min-w-0 flex-1 flex items-center justify-between gap-3 sm:block">
                  <p className="text-[10.5px] sm:text-[10px] truncate" style={{ color: 'var(--color-text-secondary)' }}>
                    <span className="sm:hidden">{h.short}</span><span className="hidden sm:inline">{h.label}</span>
                  </p>
                  <p className="text-[12px] font-bold tabular-nums truncate shrink-0 sm:shrink" style={{ color: h.color }}>{h.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
