'use client';

import { LEVELS, levelProgress } from '@/lib/goals/levels';
import { milestoneCrossings, monthLabel, type HistoryPoint } from '@/lib/goals/history';
import { monthlyPace, projectReach, monthKeyLabel } from '@/lib/goals/pace';

interface Props { netWorth: number; history: HistoryPoint[] }

/**
 * One row per level: when it was reached (from history), or when it lands at
 * the current pace. Fills the wide-screen column beside the chart with the
 * dates the ladder only hints at.
 */
export default function MilestonesCard({ netWorth, history }: Props) {
  const p = levelProgress(netWorth);
  const now = new Date();
  const pace = monthlyPace(history, now);
  const reached = new Map(milestoneCrossings(history).map((c) => [c.level.n, c]));

  return (
    <section className="rounded-3xl p-5 sm:p-6 flex flex-col gap-3 min-w-0"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
      <div>
        <h2 className="text-lg font-bold">Milestones</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          When you got there, and when the rest arrive at {pace == null ? 'your pace' : `${pace >= 0 ? '+' : '−'}$${Math.abs(pace).toLocaleString('en-US', { maximumFractionDigits: 0 })}/month`}.
        </p>
      </div>
      {/* Two columns while the card spans the full width (below xl), one column in its own column from xl. */}
      <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 sm:gap-x-8">
        {LEVELS.map((l) => {
          const done = p.current >= l.n;
          const isNext = p.next?.n === l.n;
          const hit = reached.get(l.n);
          const eta = !done && pace != null ? projectReach(netWorth, l.threshold, pace, now) : null;
          const color = done ? 'var(--color-green)' : isNext ? 'var(--color-primary)' : 'var(--color-text-muted)';
          return (
            <li key={l.n} className="flex items-center gap-3 py-2 text-sm" style={{ borderBottom: l.n < LEVELS.length ? '1px solid var(--color-border)' : undefined }}>
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                style={{ border: `2px solid ${color}`, color, background: done ? 'color-mix(in srgb, var(--color-green) 16%, transparent)' : 'transparent' }}>
                {done ? '✓' : l.n}
              </span>
              <span className="flex-1 min-w-0 truncate">
                <span className="font-semibold tabular-nums">{l.short}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}> · {l.name}</span>
              </span>
              <span className="text-right text-xs tabular-nums shrink-0" style={{ color: done ? 'var(--color-green)' : isNext ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                {done
                  ? (hit ? `${hit.estimated ? '≈ ' : ''}${monthLabel(hit.date)}` : 'Reached')
                  : eta ? monthKeyLabel(eta) : pace == null ? '—' : 'Not at this pace'}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
