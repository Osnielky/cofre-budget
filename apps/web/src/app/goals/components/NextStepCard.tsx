'use client';

import { useState } from 'react';
import { levelProgress } from '@/lib/goals/levels';

function money(n: number) {
  return `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props { netWorth: number; targetDate: string | null; onSetTargetDate: (date: string) => void }

export default function NextStepCard({ netWorth, targetDate, onSetTargetDate }: Props) {
  const p = levelProgress(netWorth);
  const [planning, setPlanning] = useState(false);

  return (
    <section className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
      <h2 className="text-lg font-bold">Your next step</h2>

      {p.next ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-extrabold tabular-nums" style={{ fontSize: 'clamp(26px, 3vw, 32px)' }}>{money(p.toGo)}</span>
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>until Level {p.next.n} · {p.next.name}</span>
          </p>
          <div>
            <p className="text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{p.pctThroughLevel.toFixed(1)}% through this level</p>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(p.pctThroughLevel, 1)}%`, background: 'var(--color-primary)' }} />
            </div>
            <div className="flex justify-between text-[11px] mt-1 tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
              <span>${p.bandFrom.toLocaleString()}</span><span>${p.bandTo.toLocaleString()}</span>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>🏆 You reached the million. Every level is behind you.</p>
      )}

      <button type="button" onClick={() => setPlanning((o) => !o)} aria-expanded={planning}
        className="btn-gold w-full py-3 rounded-xl text-sm font-semibold cursor-pointer">
        Plan my next milestone →
      </button>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {targetDate
          ? `Target date ${new Date(`${targetDate}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
          : 'Add a target date to explore your timeline.'}
      </p>
      {planning && (
        <input type="date" defaultValue={targetDate ?? ''} aria-label="Target date"
          onChange={(e) => { if (e.target.value) { onSetTargetDate(e.target.value); setPlanning(false); } }}
          className="w-full px-3 py-2 rounded-xl text-sm outline-none"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', colorScheme: 'dark' }} />
      )}
    </section>
  );
}
