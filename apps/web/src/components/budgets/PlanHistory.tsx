'use client';

import type { HistoryPoint } from '@/lib/budgets/types';

function monthShort(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'short' });
}

interface PlanHistoryProps {
  history: HistoryPoint[];
  currentMonth: string;
  elapsedPct: number;
  onImport: () => void;
  onSetAll: () => void;
}

function tone(pct: number): { color: string } {
  if (pct <= 100) return { color: 'var(--color-green)' };
  if (pct <= 110) return { color: 'var(--color-amber)' };
  return { color: 'var(--color-rose)' };
}

export default function PlanHistory({ history, currentMonth, elapsedPct, onImport, onSetAll }: PlanHistoryProps) {
  const past = history.filter((h) => h.month !== currentMonth);
  const underCount = past.filter((h) => h.budget > 0 && h.spent <= h.budget).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 p-5 rounded-2xl"
        style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
        <span className="text-[10.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Six months of plans</span>
        <div className="flex flex-col gap-2">
          {history.map((h) => {
            const pct = h.budget > 0 ? Math.round((h.spent / h.budget) * 100) : 0;
            const isCurrent = h.month === currentMonth;
            const { color } = tone(pct);
            return (
              <div key={h.month} className="flex items-center gap-2.5">
                <span className="text-[11px] font-semibold w-8 shrink-0" style={{ color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  {monthShort(h.month)}
                </span>
                <div className="flex-1 h-4 rounded-md overflow-hidden relative" style={{ background: 'var(--color-elevated)' }}>
                  <div className="h-full rounded-md transition-all duration-700" style={{ width: `${Math.min(pct, 100)}%`, background: color, opacity: isCurrent ? 0.85 : 1 }} />
                  {isCurrent && (
                    <span className="absolute top-0 bottom-0 w-px" style={{ left: `${Math.min(elapsedPct, 100)}%`, background: 'var(--color-text-primary)', opacity: 0.6 }} />
                  )}
                </div>
                <span className="text-[11px] font-bold tabular-nums w-10 text-right shrink-0" style={{ color }}>{pct}%</span>
              </div>
            );
          })}
        </div>
        {past.length > 0 && (
          <p className="text-[10.5px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            The light mark on {monthShort(currentMonth)} is where an even pace would sit today. You have finished under budget in{' '}
            <strong style={{ color: 'var(--color-text-secondary)' }}>{underCount} of the last {past.length} months</strong>.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2.5 p-5 rounded-2xl"
        style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
        <p className="text-sm font-semibold">Budgets roll forward automatically</p>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {monthShort(currentMonth)} started from the prior plan. Editing a carried-over budget changes it from that month onward — past months stay as they were.
        </p>
        <div className="flex gap-2 flex-wrap mt-1">
          <button type="button" onClick={onImport}
            className="px-3 py-2 text-[11.5px] font-semibold rounded-xl hover:bg-[var(--color-elevated)] transition-colors"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            Import a past plan
          </button>
          <button type="button" onClick={onSetAll}
            className="px-3 py-2 text-[11.5px] font-semibold rounded-xl hover:bg-[var(--color-elevated)] transition-colors"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            Set all at once
          </button>
        </div>
      </div>
    </div>
  );
}
