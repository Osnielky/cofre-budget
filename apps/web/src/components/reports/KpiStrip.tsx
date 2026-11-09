'use client';

import StatTile from '@/components/StatTile';
import { useThemeColors } from '@/components/ThemeProvider';
import type { Summary, MonthPoint } from '@/lib/reports/compute';
import { money } from './ui';

/** A smaller fact tile shown beside the four headline figures on wide screens. */
export interface KpiExtra { label: string; value: string; sub: string }

/** Income · Spending · Net · Savings rate, each vs the previous period, with a monthly sparkline when the period spans months. */
export default function KpiStrip({ summary, months, prevLabel, loading, extras = [] }: { summary: Summary; months: MonthPoint[]; prevLabel: string; loading: boolean; extras?: KpiExtra[] }) {
  const tc = useThemeColors();
  const tiles = [
    { label: 'Income', value: money(summary.income), delta: summary.deltas.income, inverse: false, color: tc.green, spark: months.map((m) => m.income), prev: money(summary.prev.income) },
    { label: 'Spending', value: money(summary.spending), delta: summary.deltas.spending, inverse: true, color: tc.orange, spark: months.map((m) => m.spending), prev: money(summary.prev.spending) },
    { label: 'Net', value: money(summary.net), delta: summary.deltas.net, inverse: false, color: tc.violet, spark: months.map((m) => m.net), prev: money(summary.prev.net) },
    { label: 'Savings rate', value: summary.savingsRate == null ? '—' : `${summary.savingsRate.toFixed(0)}%`, delta: summary.deltas.savingsRate, inverse: false, points: true, color: tc.sky, spark: months.map((m) => (m.income > 0 ? (m.net / m.income) * 100 : 0)), prev: summary.prev.savingsRate == null ? '—' : `${summary.prev.savingsRate.toFixed(0)}%` },
  ];
  return (
    <div className="flex flex-col gap-2.5 sm:gap-4 2xl:flex-row">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4 2xl:flex-[3] min-w-0">
        {tiles.map((t) => (
          <StatTile key={t.label} label={t.label} value={t.value} accent={t.color}
            delta={{ value: t.delta, inverse: t.inverse, unit: t.points ? 'pts' : 'percent', placeholders: true }}
            sub={`vs ${t.prev} · ${prevLabel}`}
            trend={months.length > 1 ? { kind: 'spark', values: t.spark } : null}
            loading={loading} />
        ))}
      </div>
      {/* Extra facts: a row of three under the headline tiles, a column beside them on wide screens */}
      {extras.length > 0 && !loading && (
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4 2xl:flex-[1.3] min-w-0">
          {extras.map((e) => <StatTile key={e.label} size="sm" label={e.label} value={e.value} sub={e.sub} />)}
        </div>
      )}
    </div>
  );
}
