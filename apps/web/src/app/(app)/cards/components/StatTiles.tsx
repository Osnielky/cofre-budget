'use client';

import type { ReactNode } from 'react';
import StatTile from '@/components/StatTile';
import type { CardView } from '@/lib/cards/types';
import { availableCredit, highestApr, nextPayment, shortDate } from '@/lib/cards/overview';
import { fmt } from '@/app/(app)/debts/format';

const svg = (d: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

/* Available credit · highest APR · next payment due, on the shared StatTile. */
export default function StatTiles({ cards, today }: { cards: CardView[]; today: string }) {
  const avail = availableCredit(cards);
  const top = highestApr(cards);
  const due = nextPayment(cards, today);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 xl:col-span-3">
      <StatTile lift accent="var(--color-green)" label="Available credit" className="col-span-2 sm:col-span-1"
        icon={svg(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>)}
        value={avail ? `$${fmt(avail.available)}` : '—'}
        sub={avail ? `${avail.pct}% available` : 'Add credit limits'} />
      <StatTile lift accent="var(--color-orange)" label="Highest APR"
        icon={svg(<><path d="M19 5 5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>)}
        value={top ? `${top.apr}%` : '—'}
        sub={top ? top.name : 'Add APRs to compare'} />
      <StatTile lift accent="var(--color-amber)" label="Next payment due"
        icon={svg(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>)}
        value={due ? shortDate(due.date) : '—'}
        sub={due ? (due.minimumPayment !== null ? `$${fmt(due.minimumPayment)} min · ${due.name}` : due.name) : 'No payment due yet'} />
    </div>
  );
}
