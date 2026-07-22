'use client';

import { countGroups, type Receipt } from '@/lib/receipts/derive';

interface Category { id: string; name: string; icon: string; color: string; type: string }

interface Props {
  receipt: Receipt;
  categories: Category[];
  itemCategories: Record<number, string>;
  onSetCategory: (idx: number, categoryId: string) => void;
  onImport: () => void;
  importing: boolean;
  onClose: () => void;
}

function money(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

export default function ReceiptDetailPanel({
  receipt, categories, itemCategories, onSetCategory, onImport, importing, onClose,
}: Props) {
  const groups = countGroups(receipt.items.length, itemCategories);

  return (
    <div className="flex flex-col h-full p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="font-bold text-lg" style={{ color: 'var(--color-text-primary)' }}>{receipt.merchant}</h2>
          {receipt.orderNumber && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Order {receipt.orderNumber}</p>}
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ color: 'var(--color-text-muted)' }}>✕</button>
      </div>

      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium mb-4 px-2 py-1 rounded-full self-start"
        style={{ background: 'color-mix(in srgb, var(--color-sky) 12%, transparent)', color: 'var(--color-sky)' }}>
        Imported via Gmail
      </span>

      <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Assign a category to each item. Items with the same category become one transaction.
      </p>

      <div className="space-y-2 mb-6">
        {receipt.items.map((item, idx) => (
          <div key={idx} className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{item.name}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {item.quantity > 1 ? `${item.quantity}× ` : ''}{money(item.unitPrice)} = {money(item.total)}
              </p>
            </div>
            <select
              value={itemCategories[idx] ?? ''}
              onChange={(e) => onSetCategory(idx, e.target.value)}
              className="text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', minWidth: 120 }}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="rounded-xl p-3 mb-4"
        style={{ background: 'color-mix(in srgb, var(--color-card-violet) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 15%, transparent)' }}>
        <p className="text-xs" style={{ color: 'var(--color-card-violet)' }}>
          This will create <strong>{groups}</strong> transaction{groups !== 1 ? 's' : ''} totaling <strong>{money(receipt.total)}</strong>.
        </p>
      </div>

      <button onClick={onImport} disabled={importing}
        className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-80 disabled:opacity-50 mt-auto"
        style={{ background: 'linear-gradient(180deg, var(--color-card-violet), var(--color-primary))', color: '#fff' }}>
        {importing ? 'Creating…' : `Create ${groups} Transaction${groups !== 1 ? 's' : ''}`}
      </button>
    </div>
  );
}
