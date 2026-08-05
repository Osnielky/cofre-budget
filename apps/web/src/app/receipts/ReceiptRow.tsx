'use client';

import { money, statusLabel, type Receipt } from '@/lib/receipts/derive';

interface Props {
  receipt: Receipt;
  onClick: () => void;
}

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
  const categoryText = r.matchedTransaction?.category?.name ?? 'Uncategorized';

  return (
    <button onClick={onClick}
      className="w-full text-left rounded-2xl p-4 transition-colors hover:brightness-110 flex items-center justify-between gap-3"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)' }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span style={{ color: 'var(--color-text-muted)' }}><SourceIcon source={r.source} /></span>
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{r.merchant}</p>
        </div>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
          {r.orderDate ?? '—'}{r.orderNumber ? ` · Order ${r.orderNumber}` : ''} · {categoryText}
        </p>
      </div>
      <span className="text-xs px-2 py-1 rounded-full shrink-0 hidden sm:inline-block"
        style={{ background: 'color-mix(in srgb, var(--color-violet) 12%, transparent)', color: 'var(--color-violet)' }}>
        {r.items.length} item{r.items.length === 1 ? '' : 's'}
      </span>
      <div className="text-right shrink-0">
        <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>{money(r.total)}</p>
        <span className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: `color-mix(in srgb, ${STATUS_COLOR[label]} 12%, transparent)`, color: STATUS_COLOR[label] }}>
          {label === 'Pending' ? 'Pending Review' : label}
        </span>
      </div>
    </button>
  );
}
