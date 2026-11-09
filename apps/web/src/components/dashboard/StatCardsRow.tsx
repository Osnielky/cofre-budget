'use client';

import StatTile from '@/components/StatTile';

/* ── Icons (stroke paths, 24×24 viewBox) ── */
function StatIcon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const ICON_WALLET  = 'M21 12V7H5a2 2 0 0 1 0-4h14v4 M3 5v14a2 2 0 0 0 2 2h16v-5 M18 12a2 2 0 0 0 0 4h4v-4Z';
const ICON_TRENDUP = 'M22 7l-8.5 8.5-5-5L2 17 M16 7h6v6';
const ICON_TRENDDN = 'M22 17l-8.5-8.5-5 5L2 7 M16 17h6v-6';
const ICON_SAVINGS = 'M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z M2 9v1c0 1.1.9 2 2 2h1';
const ICON_BUDGET  = 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2Z M9 13l2 2 4-4';

export interface StatCardDef {
  label: string;
  short?: string;                // phone-width label; falls back to label
  value: string;
  delta: number | null;          // % vs last month; null hides the badge
  inverseDelta?: boolean;        // true = a drop is good (expenses)
  sub: string;                   // muted line next to / instead of the delta
  accent: string;                // card + sparkline color
  icon: 'wallet' | 'trendup' | 'trenddn' | 'savings' | 'budget';
  spark: number[];               // sparkline series
}

const ICONS: Record<StatCardDef['icon'], string> = {
  wallet: ICON_WALLET, trendup: ICON_TRENDUP, trenddn: ICON_TRENDDN,
  savings: ICON_SAVINGS, budget: ICON_BUDGET,
};

/* The dashboard's five figures on the shared StatTile. Phones (below sm): the first
   card is a full-width hero that keeps its icon and sparkline; the other four are
   compact 2×2 tiles (accent dot, label, value, delta). From sm up every card has the
   chip and the sparkline. */
export default function StatCardsRow({ cards, loading }: { cards: StatCardDef[]; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5 sm:gap-5">
      {cards.map((c, i) => (
        <StatTile key={c.label} lift hero={i === 0} className={i === 0 ? 'col-span-2 sm:col-span-1' : ''}
          label={c.label} shortLabel={c.short} value={c.value} accent={c.accent}
          icon={<StatIcon d={ICONS[c.icon]} />}
          delta={{ value: c.delta, inverse: c.inverseDelta }} sub={c.sub}
          trend={{ kind: 'spark', values: c.spark }} loading={loading} />
      ))}
    </div>
  );
}
