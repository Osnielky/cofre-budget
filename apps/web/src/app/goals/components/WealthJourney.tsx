'use client';

import { LEVELS, ladderPosition, levelProgress, compactMoney } from '@/lib/goals/levels';

interface Props { netWorth: number }

/**
 * The milestone ladder from $5K to $1M.
 *
 * Nodes are spaced evenly by level rather than by dollars — on a linear $1M
 * scale the first five levels would collapse into the left edge and the whole
 * thing would read as "you have nothing".
 */
export default function WealthJourney({ netWorth }: Props) {
  const p = levelProgress(netWorth);
  const pos = ladderPosition(netWorth) * 100;

  return (
    <div className="rounded-2xl p-5 relative overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, color-mix(in srgb, var(--color-primary) 10%, var(--color-surface)) 0%, var(--color-surface) 55%)',
        backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--color-border)',
      }}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <h2 className="text-lg font-bold">Your wealth journey</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Every milestone brings the million closer.
          </p>
        </div>
        <span className="px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
          Current stage · {p.current > 0 ? `Level ${p.current}` : 'Getting started'}
        </span>
      </div>

      {/* The track. Horizontally scrollable so eight nodes never squash on a phone. */}
      <div className="overflow-x-auto pb-2" style={{ overscrollBehaviorX: 'contain' }}>
        <div className="relative" style={{ minWidth: 680, paddingTop: 34, paddingBottom: 8 }}>
          {/* Base line */}
          <div className="absolute" style={{ left: 0, right: 0, top: 34 + 22, height: 2, background: 'var(--color-border)' }} />
          {/* Completed portion */}
          <div className="absolute rounded-full" style={{
            left: 0, width: `${pos}%`, top: 34 + 21, height: 4,
            background: 'linear-gradient(90deg, var(--color-green), var(--color-primary))',
          }} />

          {/* "YOU" marker */}
          <div className="absolute flex flex-col items-center" style={{ left: `${pos}%`, top: 0, transform: 'translateX(-50%)' }}>
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap"
              style={{ background: 'var(--color-primary)', color: '#FFFFFF' }}>
              {compactMoney(netWorth)} · YOU
            </span>
            <span style={{ width: 2, height: 12, background: 'var(--color-primary)' }} />
          </div>

          {/* Nodes */}
          <div className="relative flex justify-between">
            {LEVELS.map((l) => {
              const done = p.current >= l.n;
              const isNext = p.next?.n === l.n;
              const isFinal = l.n === LEVELS.length;
              const ring = done ? 'var(--color-green)' : isNext ? 'var(--color-primary)' : 'var(--color-border)';
              return (
                <div key={l.n} className="flex flex-col items-center gap-1.5" style={{ width: 84 }}>
                  <span className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{
                      background: done
                        ? 'color-mix(in srgb, var(--color-green) 18%, var(--color-elevated))'
                        : isFinal
                          ? 'color-mix(in srgb, var(--color-amber) 18%, var(--color-elevated))'
                          : 'var(--color-elevated)',
                      border: `2px solid ${isFinal && !done ? 'var(--color-amber)' : ring}`,
                      color: done ? 'var(--color-green)' : isFinal ? 'var(--color-amber)' : 'var(--color-text-muted)',
                    }}>
                    {done ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ) : isFinal ? '🏆' : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                    )}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: done ? 'var(--color-green)' : 'var(--color-text-muted)' }}>
                    Level {l.n}
                  </span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{l.short}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-center text-xs mt-3" style={{ color: 'var(--color-text-secondary)' }}>
        {p.next
          ? <>Next unlock: <strong>Level {p.next.n} · {p.next.name}</strong></>
          : <>Every level complete — you reached the million.</>}
      </p>
    </div>
  );
}
