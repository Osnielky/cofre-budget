'use client';

import { totalUtilization, utilizationLevel, LEVEL_COLOR } from '@/lib/cards/utilization';
import { utilizationRating } from '@/lib/cards/overview';
import type { CardView } from '@/lib/cards/types';
import { fmt } from '@/app/debts/format';
import { PANEL, MUTED } from './panel';

export default function TotalUtilization({ cards }: { cards: CardView[] }) {
  const { balance, limit, ratio } = totalUtilization(cards);
  if (ratio === null) {
    return (
      <section className="rounded-2xl p-5 xl:col-span-2" style={PANEL}>
        <h2 className="font-semibold">Total credit utilization</h2>
        <p className="mt-2 text-sm" style={MUTED}>Add your cards’ credit limits to see how much of your credit you’re using.</p>
      </section>
    );
  }
  const pct = Math.round(ratio * 100);
  const color = LEVEL_COLOR[utilizationLevel(ratio)];
  return (
    <section className="rounded-2xl p-5 xl:col-span-2 flex flex-col gap-3" style={PANEL}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold">Total credit utilization</h2>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-4xl sm:text-5xl font-bold tabular-nums" style={{ color }}>{pct}%</span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}>{utilizationRating(ratio)}</span>
          </div>
        </div>
        <dl className="flex gap-5 text-right">
          <div>
            <dd className="font-bold tabular-nums">${fmt(balance)}</dd>
            <dt className="text-xs" style={MUTED}>Current balance</dt>
          </div>
          <div className="pl-5" style={{ borderLeft: '1px solid var(--color-border)' }}>
            <dd className="font-bold tabular-nums">${fmt(limit)}</dd>
            <dt className="text-xs" style={MUTED}>Total credit limit</dt>
          </div>
        </dl>
      </div>
      <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}
        role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct, 100)} aria-label="Total credit utilization">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
        <div className="absolute top-0 bottom-0 w-0.5" style={{ left: '30%', background: 'var(--color-text-secondary)' }} aria-hidden="true" />
      </div>
      <div className="flex justify-between text-[11px]" style={MUTED}>
        <span>0%</span><span>30% (good)</span><span>100%</span>
      </div>
      <p className="text-xs" style={MUTED}>Keeping it under 30% helps your credit score.</p>
    </section>
  );
}
