'use client';

/* Four summary tiles for the receipts page: total / auto-imported /
   pending review / this month's $, computed from the already-fetched
   receipts list via statTotals(). No period-over-period deltas (unlike
   the transactions StatStrip) — not enough historical signal yet. */

import { statTotals, money, type ReceiptLite } from '@/lib/receipts/derive';

interface Props {
  receipts: ReceiptLite[];
  loading: boolean;
}

function MiniIcon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const I_DOC    = 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M14 3v6h6 M9 13h6 M9 17h6';
const I_CHECK  = 'M4 12l5 5L20 6';
const I_CLOCK  = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 8v4l3 3';
const I_DOLLAR = 'M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6';

export default function StatStrip({ receipts, loading }: Props) {
  const t = statTotals(receipts);

  const tiles: { label: string; value: string; color: string; icon: string }[] = [
    { label: 'Total Receipts', value: String(t.total), color: 'var(--color-sky)', icon: I_DOC },
    { label: 'Auto-imported', value: String(t.imported), color: 'var(--color-green)', icon: I_CHECK },
    { label: 'Pending Review', value: String(t.pending), color: 'var(--color-amber)', icon: I_CLOCK },
    { label: 'This Month', value: money(t.thisMonthTotal), color: 'var(--color-violet)', icon: I_DOLLAR },
  ];

  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      {tiles.map((tile) => (
        <div key={tile.label} className="flex items-center gap-3 rounded-xl py-2.5 px-3 min-w-0"
          style={{ border: 'var(--glass-border)', background: `color-mix(in srgb, ${tile.color} 4%, transparent)` }}>
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{
              color: tile.color,
              background: `color-mix(in srgb, ${tile.color} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${tile.color} 40%, transparent)`,
              boxShadow: `0 0 10px color-mix(in srgb, ${tile.color} 20%, transparent)`,
            }}>
            <MiniIcon d={tile.icon} />
          </span>
          <div className="min-w-0">
            <p className="text-[10.5px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{tile.label}</p>
            <p className="text-[14px] font-bold tabular-nums truncate">{loading ? '—' : tile.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
