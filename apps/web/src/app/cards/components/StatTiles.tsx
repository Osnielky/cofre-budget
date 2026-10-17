'use client';

import type { ReactNode } from 'react';
import type { CardView } from '@/lib/cards/types';
import { availableCredit, highestApr, nextPayment, shortDate } from '@/lib/cards/overview';
import { fmt } from '@/app/debts/format';
import { PANEL, MUTED } from './panel';

function Tile({ accent, icon, label, value, sub }: { accent: string; icon: ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="card-lift rounded-2xl p-4 flex flex-row sm:flex-col items-center sm:items-start gap-3 sm:gap-2 min-w-0" style={PANEL}>
      <span className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
        style={{ color: accent, background: `color-mix(in srgb, ${accent} 16%, transparent)` }} aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
        <p className="text-xl font-bold tabular-nums truncate">{value}</p>
        <p className="text-xs truncate" style={MUTED}>{sub}</p>
      </div>
    </div>
  );
}

const svg = (d: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

export default function StatTiles({ cards, today }: { cards: CardView[]; today: string }) {
  const avail = availableCredit(cards);
  const top = highestApr(cards);
  const due = nextPayment(cards, today);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 xl:col-span-3">
      <Tile accent="var(--color-green)" label="Available credit"
        icon={svg(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>)}
        value={avail ? `$${fmt(avail.available)}` : '—'}
        sub={avail ? `${avail.pct}% available` : 'Add credit limits'} />
      <Tile accent="var(--color-orange)" label="Highest APR"
        icon={svg(<><path d="M19 5 5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>)}
        value={top ? `${top.apr}%` : '—'}
        sub={top ? top.name : 'Add APRs to compare'} />
      <Tile accent="var(--color-amber)" label="Next payment due"
        icon={svg(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>)}
        value={due ? shortDate(due.date) : '—'}
        sub={due ? (due.minimumPayment !== null ? `$${fmt(due.minimumPayment)} min · ${due.name}` : due.name) : 'No payment due yet'} />
    </div>
  );
}
