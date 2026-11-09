'use client';

import type { CategoryMoves } from '@/lib/reports/compute';
import { money, Empty } from './ui';

/** Which categories moved the most money versus the previous period, each way. */
export default function MovesPanel({ moves, prevLabel }: { moves: CategoryMoves; prevLabel: string }) {
  if (moves.up.length === 0 && moves.down.length === 0) return <Empty text={`Nothing to compare with ${prevLabel} yet.`} />;
  const Column = ({ title, rows, tone }: { title: string; rows: CategoryMoves['up']; tone: 'up' | 'down' }) => (
    <div className="min-w-0 flex-1">
      <p className="text-fine font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{title}</p>
      {rows.length === 0 ? <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>None</p> : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const diff = r.value - r.prevValue;
            return (
              <li key={r.id} className="flex items-center gap-2 text-[12.5px] min-w-0">
                <span className="w-6 h-6 rounded-md flex items-center justify-center text-[13px] shrink-0" style={{ background: `color-mix(in srgb, ${r.color} 16%, transparent)` }}>{r.icon}</span>
                <span className="truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>{r.name}</span>
                <span className="tabular-nums font-semibold shrink-0" style={{ color: tone === 'up' ? 'var(--color-rose)' : 'var(--color-green)' }}>
                  {tone === 'up' ? '+' : '−'}{money(Math.abs(diff))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
  return (
    <div className="flex flex-col sm:flex-row 2xl:flex-col gap-4">
      <Column title="Spent more on" rows={moves.up} tone="up" />
      <Column title="Spent less on" rows={moves.down} tone="down" />
    </div>
  );
}
