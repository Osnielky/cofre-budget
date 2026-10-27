'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import type { Summary, MonthPoint } from '@/lib/reports/compute';
import { money, Delta, Spark } from './ui';

/** Income · Spending · Net · Savings rate, each vs the previous period, with a monthly sparkline when the period spans months. */
export default function KpiStrip({ summary, months, prevLabel, loading }: { summary: Summary; months: MonthPoint[]; prevLabel: string; loading: boolean }) {
  const tc = useThemeColors();
  const tiles = [
    { label: 'Income', value: money(summary.income), delta: summary.deltas.income, inverse: false, color: tc.green, spark: months.map((m) => m.income), prev: money(summary.prev.income) },
    { label: 'Spending', value: money(summary.spending), delta: summary.deltas.spending, inverse: true, color: tc.orange, spark: months.map((m) => m.spending), prev: money(summary.prev.spending) },
    { label: 'Net', value: money(summary.net), delta: summary.deltas.net, inverse: false, color: tc.violet, spark: months.map((m) => m.net), prev: money(summary.prev.net) },
    { label: 'Savings rate', value: summary.savingsRate == null ? '—' : `${summary.savingsRate.toFixed(0)}%`, delta: summary.deltas.savingsRate, inverse: false, points: true, color: tc.sky, spark: months.map((m) => (m.income > 0 ? (m.net / m.income) * 100 : 0)), prev: summary.prev.savingsRate == null ? '—' : `${summary.prev.savingsRate.toFixed(0)}%` },
  ];
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-2xl p-3.5 sm:p-4 flex flex-col gap-1 min-w-0"
          style={{ background: `linear-gradient(140deg, color-mix(in srgb, ${t.color} 9%, transparent), var(--color-surface) 60%)`, backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
          <p className="text-[11px] sm:text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />{t.label}
          </p>
          <p className="text-[20px] sm:text-[24px] font-bold tabular-nums leading-7 truncate">{loading ? <span className="opacity-30">—</span> : t.value}</p>
          <p className="text-[11px] flex items-center gap-1.5 min-w-0" style={{ color: 'var(--color-text-muted)' }}>
            {!loading && <Delta value={t.delta} inverse={t.inverse} points={t.points} />}
            <span className="truncate">{loading ? '' : `vs ${t.prev} · ${prevLabel}`}</span>
          </p>
          {!loading && months.length > 1 && <div className="mt-1"><Spark values={t.spark} color={t.color} /></div>}
        </div>
      ))}
    </div>
  );
}
