'use client';

import { totalUtilization, utilizationLevel, LEVEL_COLOR } from '@/lib/cards/utilization';
import type { CardView } from '@/lib/cards/types';
import { fmt } from '@/app/debts/format';

export default function TotalUtilization({ cards }: { cards: CardView[] }) {
  const { balance, limit, ratio } = totalUtilization(cards);
  if (ratio === null) return null;
  const pct = Math.round(ratio * 100);
  const color = LEVEL_COLOR[utilizationLevel(ratio)];
  return (
    <section className="card-lift rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: 'var(--glass-border)', backdropFilter: 'var(--glass-blur)' }}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Total utilization</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>${fmt(balance)} of ${fmt(limit)}</p>
      </div>
      <p className="mt-1 text-3xl font-bold tabular-nums" style={{ color }}>{pct}%</p>
      <div className="relative mt-3 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}
        role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct, 100)} aria-label="Total credit utilization">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
        <div className="absolute top-0 bottom-0 w-0.5" style={{ left: '30%', background: 'var(--color-text-muted)' }} aria-hidden="true" />
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>Keeping it under 30% (the mark) helps your credit score.</p>
    </section>
  );
}
