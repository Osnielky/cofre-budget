'use client';

import { LEVELS, ladderPosition, levelProgress, compactMoney } from '@/lib/goals/levels';

interface Props { netWorth: number }

function Node({ n, name, short, state }: { n: number; name: string; short: string; state: 'done' | 'next' | 'locked' | 'final' }) {
  const color = state === 'done' ? 'var(--color-green)' : state === 'next' ? 'var(--color-primary)' : state === 'final' ? 'var(--color-card-amber)' : 'var(--color-text-muted)';
  return (
    <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
      style={{
        background: state === 'locked' ? 'color-mix(in srgb, var(--color-base) 70%, transparent)' : `color-mix(in srgb, ${color} 22%, var(--color-base))`,
        border: `2px solid ${color}`, color,
        boxShadow: state === 'next' ? `0 0 0 6px color-mix(in srgb, ${color} 18%, transparent)` : undefined,
      }} aria-label={`Level ${n}, ${name}, ${short}`}>
      {state === 'done' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      ) : state === 'final' ? '🏆' : state === 'next' ? n : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      )}
    </span>
  );
}

/**
 * The milestone ladder from $5K to $1M, drawn over the mountains-to-coast
 * artwork. Levels are spaced evenly (a $1M linear scale would pile the first
 * five into the left edge). Horizontal from sm up; a vertical ladder on phones
 * so nothing scrolls sideways.
 */
export default function WealthJourney({ netWorth }: Props) {
  const p = levelProgress(netWorth);
  const pos = ladderPosition(netWorth) * 100;
  const stateOf = (n: number): 'done' | 'next' | 'locked' | 'final' =>
    p.current >= n ? 'done' : p.next?.n === n ? 'next' : n === LEVELS.length ? 'final' : 'locked';

  return (
    <section className="rounded-3xl overflow-hidden flex flex-col" style={{ border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', background: 'var(--color-surface)' }}>
      <div className="px-5 sm:px-6 pt-5 pb-3 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Your wealth journey</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            From the first $5,000 to the million. You are at {compactMoney(netWorth)}.
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'color-mix(in srgb, var(--color-green) 16%, transparent)', color: 'var(--color-green)' }}>
          {p.current} of {LEVELS.length} levels reached
        </span>
      </div>

      {/* Horizontal ladder (sm and up) */}
      <div className="hidden sm:block journey-art-clear relative px-6 pt-12 pb-5" style={{ minHeight: 230 }}>
        {/* Track */}
        <div className="absolute left-10 right-10" style={{ top: 48 + 28, height: 3, background: 'rgba(255,255,255,0.28)', borderRadius: 2 }} />
        <div className="absolute left-10 rounded-full" style={{ top: 48 + 27, height: 5, width: `calc((100% - 5rem) * ${pos / 100})`, background: 'linear-gradient(90deg, var(--color-green), var(--color-card-amber))' }} />
        {/* You are here */}
        <div className="absolute flex flex-col items-center" style={{ left: `calc(2.5rem + (100% - 5rem) * ${pos / 100})`, top: 10, transform: 'translateX(-50%)' }}>
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap" style={{ background: 'var(--color-text-primary)', color: 'var(--color-base)' }}>
            You · {compactMoney(netWorth)}
          </span>
          <span style={{ width: 2, height: 14, background: 'var(--color-text-primary)' }} />
        </div>
        <div className="relative flex justify-between mx-4" style={{ marginTop: 14 }}>
          {LEVELS.map((l) => {
            const s = stateOf(l.n);
            return (
              <div key={l.n} className="flex flex-col items-center gap-1.5 w-20 lg:w-24">
                <Node n={l.n} name={l.name} short={l.short} state={s} />
                <span className="text-sm font-bold tabular-nums" style={{ color: '#F5F7FB', textShadow: '0 1px 3px rgba(5,9,18,0.9)' }}>{l.short}</span>
                <span className="text-[10.5px] font-medium text-center leading-tight" style={{ color: s === 'done' ? 'var(--color-green)' : 'rgba(235,240,250,0.8)', textShadow: '0 1px 3px rgba(5,9,18,0.9)' }}>{l.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Vertical ladder (phones) */}
      <div className="sm:hidden journey-art-tall relative px-4 py-4">
        <ol className="relative flex flex-col gap-3">
          <div className="absolute" style={{ left: 23, top: 24, bottom: 24, width: 3, background: 'rgba(255,255,255,0.22)', borderRadius: 2 }} />
          {LEVELS.map((l) => {
            const s = stateOf(l.n);
            return (
              <li key={l.n} className="relative flex items-center gap-3">
                <Node n={l.n} name={l.name} short={l.short} state={s} />
                <div className="min-w-0 flex-1 flex items-center justify-between gap-2 rounded-xl px-3 py-2"
                  style={{ background: s === 'next' ? 'color-mix(in srgb, var(--color-primary) 22%, rgba(9,15,30,0.7))' : 'rgba(9,15,30,0.55)', border: `1px solid ${s === 'next' ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)'}` }}>
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight truncate">{l.short} · {l.name}</p>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {s === 'done' ? 'Reached' : s === 'next' ? `${compactMoney(p.toGo)} to go` : 'Locked'}
                    </p>
                  </div>
                  {s === 'next' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--color-text-primary)', color: 'var(--color-base)' }}>You are here</span>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
