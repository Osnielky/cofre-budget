'use client';

import { useState } from 'react';
import { levelProgress } from '@/lib/goals/levels';
import { monthlyPace, projectReach, requiredMonthly, monthKeyLabel } from '@/lib/goals/pace';
import type { HistoryPoint } from '@/lib/goals/history';
import { money, fmtDateShort } from '../format';

interface Props {
  netWorth: number;
  history: HistoryPoint[];
  targetDate: string | null;
  onSetTargetDate: (date: string | null) => void;
}

const row = 'flex items-start justify-between gap-3 py-2.5 text-sm';

/** Distance to the next level, what today's pace means, and what a target date would ask of you. */
export default function NextStepCard({ netWorth, history, targetDate, onSetTargetDate }: Props) {
  const p = levelProgress(netWorth);
  const [editing, setEditing] = useState(false);
  const now = new Date();
  const pace = monthlyPace(history, now);
  const reachNext = p.next && pace != null ? projectReach(netWorth, p.next.threshold, pace, now) : null;
  const reachMillion = pace != null ? projectReach(netWorth, 1_000_000, pace, now) : null;
  const needed = targetDate ? requiredMonthly(netWorth, 1_000_000, targetDate, now) : null;

  return (
    <section className="rounded-3xl p-5 sm:p-6 flex flex-col gap-3"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
      <h2 className="text-lg font-bold">Your next step</h2>

      {p.next ? (
        <div>
          <p className="font-extrabold tabular-nums leading-none" style={{ fontSize: 'clamp(28px, 3vw, 34px)' }}>{money(p.toGo)}</p>
          <p className="text-sm mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>until Level {p.next.n} · {p.next.name} ({p.next.short})</p>
        </div>
      ) : (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>🏆 You reached the million. Every level is behind you.</p>
      )}

      <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        <div className={row} style={{ borderColor: 'var(--color-border)' }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Your pace</span>
          <span className="text-right tabular-nums font-semibold" style={{ color: pace == null ? 'var(--color-text-muted)' : pace >= 0 ? 'var(--color-green)' : 'var(--color-rose)' }}>
            {pace == null ? 'Not enough history yet' : `${pace >= 0 ? '+' : '−'}${money(Math.abs(pace))} / month`}
          </span>
        </div>
        {p.next && (
          <div className={row} style={{ borderColor: 'var(--color-border)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>{p.next.short} at this pace</span>
            <span className="text-right font-semibold">{reachNext ? monthKeyLabel(reachNext) : pace == null ? '—' : 'Not at this pace'}</span>
          </div>
        )}
        <div className={row} style={{ borderColor: 'var(--color-border)' }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>$1M at this pace</span>
          <span className="text-right font-semibold">{reachMillion ? monthKeyLabel(reachMillion) : pace == null ? '—' : 'Not at this pace'}</span>
        </div>
        {targetDate && (
          <div className={row} style={{ borderColor: 'var(--color-border)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>$1M by {fmtDateShort(targetDate)} needs</span>
            <span className="text-right tabular-nums font-semibold" style={{ color: 'var(--color-card-amber)' }}>
              {needed == null ? 'Pick a later date' : needed === 0 ? 'Already there' : `+${money(needed)} / month`}
            </span>
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <label className="text-xs" style={{ color: 'var(--color-text-muted)' }} htmlFor="goal-target-date">When do you want to reach $1M?</label>
          <input id="goal-target-date" type="date" defaultValue={targetDate ?? ''} autoFocus
            min={`${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`}
            onChange={(e) => { if (e.target.value) { onSetTargetDate(e.target.value); setEditing(false); } }}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', colorScheme: 'dark' }} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(false)} className="flex-1 py-2 rounded-xl text-xs font-medium" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>Cancel</button>
            {targetDate && (
              <button type="button" onClick={() => { onSetTargetDate(null); setEditing(false); }} className="flex-1 py-2 rounded-xl text-xs font-medium" style={{ border: '1px solid var(--color-border)', color: 'var(--color-rose)' }}>Remove date</button>
            )}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="btn-gold w-full py-3 rounded-xl text-sm font-semibold cursor-pointer">
          {targetDate ? 'Change my target date' : 'Set a target date'}
        </button>
      )}
      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        Pace is the average change in your net worth over the last 90 days. Projections assume it holds.
      </p>
    </section>
  );
}
