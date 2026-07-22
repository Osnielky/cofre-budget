'use client';

import { money, type Receipt } from '@/lib/receipts/derive';

interface Props {
  receipt: Receipt;
  onClick: () => void;
}

export default function ReceiptRow({ receipt: r, onClick }: Props) {
  const itemCount = r.items.length;
  return (
    <button onClick={onClick}
      className="w-full text-left rounded-2xl p-4 transition-colors hover:brightness-110 flex items-center justify-between gap-3"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)' }}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{r.merchant}</p>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
          {r.orderDate ?? '—'}{r.orderNumber ? ` · Order ${r.orderNumber}` : ''}
        </p>
      </div>
      <span className="text-xs px-2 py-1 rounded-full shrink-0 hidden sm:inline-block"
        style={{ background: 'color-mix(in srgb, var(--color-violet) 12%, transparent)', color: 'var(--color-violet)' }}>
        {itemCount} item{itemCount === 1 ? '' : 's'}
      </span>
      <div className="text-right shrink-0">
        <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>{money(r.total)}</p>
        <span className="text-xs px-2 py-0.5 rounded-full"
          style={r.imported
            ? { background: 'color-mix(in srgb, var(--color-green) 12%, transparent)', color: 'var(--color-green)' }
            : { background: 'color-mix(in srgb, var(--color-amber) 12%, transparent)', color: 'var(--color-amber)' }}>
          {r.imported ? 'Imported' : 'Pending Review'}
        </span>
      </div>
    </button>
  );
}
