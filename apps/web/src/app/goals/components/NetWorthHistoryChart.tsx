'use client';

import { useMemo, useState } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { useThemeColors } from '@/components/ThemeProvider';
import { compactMoney } from '@/lib/goals/levels';
import {
  RANGES, filterRange, rangeSummary, milestoneCrossings, rangeLabel, monthLabel,
  type HistoryPoint, type HistoryRange,
} from '@/lib/goals/history';

interface Props { points: HistoryPoint[]; loading: boolean; error: string | null }

function money(n: number) {
  return `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const toTime = (date: string) => new Date(`${date}T00:00:00`).getTime();

interface Row { t: number; date: string; value: number; estimated: boolean; change: number | null; real: number | null; est: number | null }

function TipContent({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const when = d.estimated
    ? monthLabel(d.date)
    : new Date(`${d.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div className="rounded-xl px-3 py-2 text-xs"
      style={{ background: 'var(--popover-bg)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', color: 'var(--color-text-primary)' }}>
      <p className="font-semibold mb-1">{when}{d.estimated && <span style={{ color: 'var(--color-text-muted)' }}> · Estimated</span>}</p>
      <p className="flex justify-between gap-4"><span style={{ color: 'var(--color-text-secondary)' }}>Net worth</span><strong className="tabular-nums">{money(d.value)}</strong></p>
      {d.change !== null && (
        <p className="flex justify-between gap-4"><span style={{ color: 'var(--color-text-secondary)' }}>Change</span>
          <strong className="tabular-nums" style={{ color: d.change >= 0 ? 'var(--color-green)' : 'var(--color-rose)' }}>
            {d.change >= 0 ? '+' : '−'}{money(Math.abs(d.change))}
          </strong>
        </p>
      )}
    </div>
  );
}

export default function NetWorthHistoryChart({ points, loading, error }: Props) {
  const c = useThemeColors();
  const [range, setRange] = useState<HistoryRange>('ALL');

  const visible = useMemo(() => filterRange(points, range, new Date()), [points, range]);
  const data: Row[] = useMemo(() => visible.map((p, i) => ({
    t: toTime(p.date), date: p.date, value: p.value, estimated: p.estimated,
    change: i > 0 ? Math.round((p.value - visible[i - 1].value) * 100) / 100 : null,
    real: p.estimated ? null : p.value,
    // The first real point also carries the dashed series so the two lines meet.
    est: p.estimated || (i > 0 && visible[i - 1].estimated) ? p.value : null,
  })), [visible]);
  const summary = rangeSummary(visible);
  const crossings = useMemo(() => {
    if (!visible.length) return [];
    const from = visible[0].date;
    const to = visible[visible.length - 1].date;
    return milestoneCrossings(points).filter((x) => x.date >= from && x.date <= to);
  }, [points, visible]);
  const startEst = visible[0]?.estimated ?? false;
  const estSuffix = startEst ? ' (estimated)' : '';
  const spanDays = data.length > 1 ? (data[data.length - 1].t - data[0].t) / 86400000 : 0;
  const tickFmt: Intl.DateTimeFormatOptions = spanDays < 90 ? { month: 'short', day: 'numeric' } : { month: 'short', year: 'numeric' };
  const hasEstimate = visible.some((p) => p.estimated);
  const first = data[0];
  const last = data[data.length - 1];

  return (
    <section className="rounded-2xl p-4 sm:p-5"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold">Net worth over time</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>From your first record to today</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Chart range" className="flex p-1 rounded-xl" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
            {RANGES.map((r) => (
              <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${range === r.id ? 'btn-gold' : ''}`}
                style={range === r.id ? undefined : { color: 'var(--color-text-secondary)' }}>
                {r.label}
              </button>
            ))}
          </div>
          {visible.length > 0 && (
            <span className="text-xs px-2.5 py-1.5 rounded-lg" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              {rangeLabel(visible)}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <p className="h-64 flex items-center justify-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : error ? (
        <p className="h-64 flex items-center justify-center text-sm" style={{ color: 'var(--color-rose)' }}>{error}</p>
      ) : points.length <= 1 ? (
        <div className="h-64 flex flex-col items-center justify-center text-center gap-1">
          <p className="font-semibold">Your history starts today</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {points[0] ? `${money(points[0].value)} today — come back to watch it grow.` : 'Come back to watch it grow.'}
          </p>
        </div>
      ) : (
        <>
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 28, right: 24, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.green} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={c.green} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={c.border} vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickCount={6}
                  tickFormatter={(t: number) => new Date(t).toLocaleDateString('en-US', tickFmt)}
                  tick={{ fill: c.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => compactMoney(v)} width={60}
                  domain={[(min: number) => Math.min(0, min), 'auto']}
                  tick={{ fill: c.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<TipContent />} cursor={{ stroke: c.border }} />
                <Line dataKey="est" stroke={c.green} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                <Area dataKey="real" stroke={c.green} strokeWidth={2.5} fill="url(#nw-fill)" dot={false} isAnimationActive={false} />
                {crossings.map((x) => (
                  <ReferenceDot key={x.level.n} x={toTime(x.date)} y={x.value} r={5} fill={c.green} stroke={c.textPrimary}
                    label={{ value: `${x.estimated ? '≈' : ''}${x.level.short} reached`, position: 'top', fill: c.green, fontSize: 11, fontWeight: 700 }} />
                ))}
                {first && <ReferenceDot x={first.t} y={first.value} r={4} fill={c.textPrimary} stroke={c.green}
                  label={{ value: compactMoney(first.value), position: 'right', fill: c.textSecondary, fontSize: 11 }} />}
                {last && <ReferenceDot x={last.t} y={last.value} r={5} fill={c.textPrimary} stroke={c.green}
                  label={{ value: compactMoney(last.value), position: 'left', fill: c.textSecondary, fontSize: 11 }} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {hasEstimate && (
            <p className="mt-2 text-xs flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
              <svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke={c.green} strokeWidth="2" strokeDasharray="5 4" strokeOpacity="0.6" /></svg>
              Estimated from your transactions
            </p>
          )}

          {summary && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl p-3" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
              <div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Starting net worth{estSuffix}</p>
                <p className="text-lg font-bold tabular-nums">{money(summary.start)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Growth since start{estSuffix}</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: summary.growth >= 0 ? 'var(--color-green)' : 'var(--color-rose)' }}>
                  {summary.growth >= 0 ? '+' : '−'}{money(Math.abs(summary.growth))}
                </p>
              </div>
              {summary.pct !== null && (
                <div>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Change since start{estSuffix}</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: summary.pct >= 0 ? 'var(--color-green)' : 'var(--color-rose)' }}>
                    {summary.pct >= 0 ? '+' : ''}{summary.pct}%
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
