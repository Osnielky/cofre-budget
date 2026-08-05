'use client';

import { money, statusLabel, type Receipt } from '@/lib/receipts/derive';

interface Props {
  receipt: Receipt;
  onClick: () => void;
}

export const GRID_CLASSES = 'grid-cols-1 md:grid-cols-[24px_minmax(140px,1fr)_90px_90px_130px_130px]';

function SourceIcon({ source }: { source: Receipt['source'] }) {
  const d = source === 'manual'
    ? 'M12 16V4 M7 9l5-5 5 5 M4 20h16' // upload arrow
    : 'M4 6h16v12H4z M4 6l8 7 8-7';    // envelope
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const STATUS_COLOR: Record<ReturnType<typeof statusLabel>, string> = {
  Imported: 'var(--color-green)',
  Matched: 'var(--color-sky)',
  Pending: 'var(--color-amber)',
};

export default function ReceiptRow({ receipt: r, onClick }: Props) {
  const label = statusLabel(r);
  const category = r.matchedTransaction?.category;

  return (
    <button onClick={onClick}
      className={`w-full text-left rounded-2xl px-4 py-3 gap-2 transition-colors hover:brightness-110 grid items-center ${GRID_CLASSES}`}
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)' }}>
      <span className="hidden md:inline-flex" style={{ color: 'var(--color-text-muted)' }}>
        <SourceIcon source={r.source} />
      </span>

      <div className="min-w-0 flex items-center gap-1.5">
        <span className="md:hidden" style={{ color: 'var(--color-text-muted)' }}><SourceIcon source={r.source} /></span>
        <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{r.merchant}</p>
      </div>

      <p className="text-xs md:text-[13px]" style={{ color: 'var(--color-text-muted)' }}>{r.orderDate ?? '—'}</p>

      <p className="font-bold text-sm md:text-[13px] md:text-right" style={{ color: 'var(--color-text-primary)' }}>{money(r.total)}</p>

      <div>
        {category ? (
          <span className="inline-block text-xs px-2 py-0.5 rounded-full truncate max-w-full"
            style={{ background: `${category.color}15`, color: category.color }}>
            {category.icon} {category.name}
          </span>
        ) : (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Uncategorized</span>
        )}
      </div>

      <div>
        <span className="inline-block text-xs px-2 py-0.5 rounded-full"
          style={{ background: `color-mix(in srgb, ${STATUS_COLOR[label]} 12%, transparent)`, color: STATUS_COLOR[label] }}>
          {label === 'Pending' ? 'Pending Review' : label}
        </span>
      </div>
    </button>
  );
}
