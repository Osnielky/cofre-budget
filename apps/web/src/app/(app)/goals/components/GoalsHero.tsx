'use client';

import { levelProgress, NET_WORTH_TARGET, compactMoney } from '@/lib/goals/levels';
import { money } from '../format';

interface Props { netWorth: number; monthNet: number }

/** Ring showing progress through the current level, with the level number inside. */
function LevelRing({ pct, level }: { pct: number; level: number }) {
  const r = 34, c = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(100, pct)) / 100 * c;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true" className="shrink-0">
      <circle cx="44" cy="44" r={r} fill="none" stroke="color-mix(in srgb, var(--color-text-muted) 30%, transparent)" strokeWidth="6" />
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--color-green)" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`} transform="rotate(-90 44 44)" />
      <text x="44" y="40" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--color-text-muted)" letterSpacing="0.08em">LEVEL</text>
      <text x="44" y="60" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--color-text-primary)">{level}</text>
    </svg>
  );
}

/**
 * One band that says where you stand: net worth and this month's change on
 * the left, the level and the distance to the next one on the right. Replaces
 * four tiles that repeated these numbers.
 */
export default function GoalsHero({ netWorth, monthNet }: Props) {
  const p = levelProgress(netWorth);
  const up = monthNet >= 0;
  return (
    <section className="goals-hero-art rounded-3xl overflow-hidden" style={{ border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
      <div className="p-5 sm:p-7 lg:p-8 grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6 lg:gap-10 items-center">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-secondary)' }}>Net worth today</p>
          <p className="font-extrabold tabular-nums leading-none mt-2" style={{ fontSize: 'clamp(38px, 5.5vw, 60px)', letterSpacing: '-0.02em' }}>
            {money(netWorth)}
          </p>
          <p className="mt-3 text-sm flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold tabular-nums"
              style={{ background: `color-mix(in srgb, ${up ? 'var(--color-green)' : 'var(--color-rose)'} 16%, transparent)`, color: up ? 'var(--color-green)' : 'var(--color-rose)' }}>
              {up ? '▲' : '▼'} {money(Math.abs(monthNet))}
            </span>
            <span style={{ color: 'var(--color-text-secondary)' }}>this month</span>
          </p>

          <div className="mt-6 max-w-md">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span style={{ color: 'var(--color-text-secondary)' }}>
                <span className="font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{p.pctOfTarget.toFixed(1)}%</span> of the way to $1,000,000
              </span>
              <span className="tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{compactMoney(NET_WORTH_TARGET - Math.max(netWorth, 0))} to go</span>
            </div>
            <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--color-text-muted) 28%, transparent)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(p.pctOfTarget, 0.8)}%`, background: 'linear-gradient(90deg, var(--color-green), var(--color-card-amber))' }} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-5 rounded-2xl p-4 sm:p-5 min-w-0"
          style={{ background: 'color-mix(in srgb, var(--color-base) 55%, transparent)', border: '1px solid var(--color-border)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
          <LevelRing pct={p.pctThroughLevel} level={p.current} />
          <div className="min-w-0">
            <p className="text-base sm:text-lg font-bold leading-tight truncate">
              {p.currentLevel ? p.currentLevel.name : 'Getting started'}
            </p>
            {p.next ? (
              <>
                <p className="text-sm mt-1 tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{money(p.toGo)}</span> to Level {p.next.n} · {p.next.name}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {p.pctThroughLevel.toFixed(0)}% through this level · {compactMoney(p.bandFrom)} → {compactMoney(p.bandTo)}
                </p>
              </>
            ) : (
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>The whole ladder is behind you.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
