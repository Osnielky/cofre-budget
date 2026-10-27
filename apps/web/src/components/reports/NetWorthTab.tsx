'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Link from 'next/link';
import { useThemeColors } from '@/components/ThemeProvider';
import { makeChartTheme } from '@/components/dashboard/chartTheme';
import type { HistoryPoint } from '@/lib/goals/history';
import type { ReportRange } from '@/lib/reports/range';
import { parseYmd } from '@/lib/reports/range';
import { money, Card, Delta, Empty } from './ui';

/** The Goals net-worth history, cut to the report period, with start / end / change. */
export default function NetWorthTab({ history, range }: { history: HistoryPoint[]; range: ReportRange }) {
  const tc = useThemeColors();
  const th = makeChartTheme(tc);
  const points = useMemo(() => {
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    const inRange = sorted.filter((p) => p.date >= range.from && p.date <= range.to);
    const before = sorted.filter((p) => p.date < range.from).at(-1);
    return (before ? [before, ...inRange] : inRange).map((p) => ({ ...p, label: parseYmd(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }));
  }, [history, range.from, range.to]);

  if (points.length < 2) {
    return (
      <Card title="Net worth">
        <Empty text="Not enough net worth history for this period yet. Cofre records a snapshot whenever balances change." />
        <Link href="/goals" className="self-center text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>See the full history on Goals →</Link>
      </Card>
    );
  }
  const first = points[0], last = points[points.length - 1];
  const change = last.value - first.value;
  const pct = first.value !== 0 ? (change / Math.abs(first.value)) * 100 : null;
  return (
    <Card title="Net worth" subtitle={`${first.label} → ${last.label}${points.some((p) => p.estimated) ? ' · some points estimated' : ''}`}
      right={<Link href="/goals" className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>Road to $1M →</Link>}>
      <div className="grid grid-cols-3 gap-3">
        {[{ l: 'Start', v: money(first.value) }, { l: 'End', v: money(last.value) }, { l: 'Change', v: money(change), d: pct }].map((s) => (
          <div key={s.l} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
            <p className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>{s.l}</p>
            <p className="text-[15px] sm:text-lg font-bold tabular-nums truncate" style={{ color: s.l === 'Change' ? (change >= 0 ? tc.green : tc.rose) : 'var(--color-text-primary)' }}>{s.v}</p>
            {s.d !== undefined && <Delta value={s.d} />}
          </div>
        ))}
      </div>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
            <defs>
              <linearGradient id="nwFade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tc.green} stopOpacity={0.3} />
                <stop offset="100%" stopColor={tc.green} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...th.grid} strokeDasharray="3 6" />
            <XAxis dataKey="label" {...th.xAxis} minTickGap={28} />
            <YAxis {...th.yAxis} domain={['auto', 'auto']} />
            <Tooltip {...th.tooltip} formatter={(v: unknown) => [money(Number(v)), 'Net worth']} />
            <Area type="monotone" dataKey="value" stroke={tc.green} strokeWidth={2.5} fill="url(#nwFade)" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
