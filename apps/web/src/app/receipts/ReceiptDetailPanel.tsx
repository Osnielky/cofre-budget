'use client';

import { useState } from 'react';
import { countGroups, groupItemsByCategory, money, statusLabel, type Receipt, type MerchantSuggestion } from '@/lib/receipts/derive';
import { SourceIcon, STATUS_COLOR } from './ReceiptRow';
import { avatarColor, initials } from '@/lib/avatar';
import MatchTransactionSection from './MatchTransactionSection';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface Category { id: string; name: string; icon: string; color: string; type: string }

interface Props {
  receipt: Receipt;
  categories: Category[];
  itemCategories: Record<number, string>;
  onSetCategory: (idx: number, categoryId: string) => void;
  onApplyAll: (categoryId: string) => void;
  suggestion: MerchantSuggestion | null;
  onImport: () => void;
  importing: boolean;
  onClose: () => void;
  onReceiptChanged: () => void;
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      {children}
    </div>
  );
}

export default function ReceiptDetailPanel({
  receipt, categories, itemCategories, onSetCategory, onApplyAll, suggestion, onImport, importing, onClose, onReceiptChanged,
}: Props) {
  const [approving, setApproving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const transactionCount = countGroups(receipt.items.length, itemCategories);
  const categoryGroups = groupItemsByCategory(receipt.items, itemCategories, categories);
  const subtotal = receipt.items.reduce((sum, item) => sum + item.total, 0);
  const tax = receipt.total - subtotal;

  const itemCount = receipt.items.length;
  const visibleCount = showAll ? itemCount : Math.min(itemCount, 6);
  const hiddenCount = itemCount - visibleCount;
  const hiddenIndices = Array.from({ length: hiddenCount }, (_, i) => visibleCount + i);
  const hiddenCategoryIds = new Set(hiddenIndices.map((idx) => itemCategories[idx] ?? ''));
  const hiddenCategoryLabel = hiddenCount > 0 && hiddenCategoryIds.size === 1 && [...hiddenCategoryIds][0]
    ? categories.find((c) => c.id === [...hiddenCategoryIds][0])?.name ?? null
    : null;
  const label = statusLabel(receipt);
  const category = receipt.matchedTransaction?.category;
  const parsedAt = new Date(receipt.parsedAt);
  const isPdf = receipt.imageMimeType === 'application/pdf';
  const imageUrl = `${API}/receipts/${receipt.id}/image`;

  async function approve() {
    setApproving(true);
    try {
      const res = await fetch(`${API}/receipts/${receipt.id}/approve`, { method: 'PATCH', credentials: 'include' });
      if (res.ok) onReceiptChanged();
    } finally {
      setApproving(false);
    }
  }

  function renderItemRow(item: Receipt['items'][number], idx: number) {
    const catId = itemCategories[idx] ?? '';
    const cat = categories.find((c) => c.id === catId);
    return (
      <div key={idx} className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{item.name}</p>
          {item.quantity > 1 && (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{item.quantity}× {money(item.unitPrice)}</p>
          )}
        </div>
        <span className="shrink-0 text-sm tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{money(item.total)}</span>
        <select
          value={catId}
          onChange={(e) => onSetCategory(idx, e.target.value)}
          className="shrink-0 text-xs font-medium rounded-full pl-2.5 pr-1.5 py-1 outline-none appearance-none text-center"
          style={{
            background: cat ? `color-mix(in srgb, ${cat.color} 15%, transparent)` : 'var(--color-elevated)',
            color: cat ? cat.color : 'var(--color-text-muted)',
            border: `1px solid ${cat ? `color-mix(in srgb, ${cat.color} 30%, transparent)` : 'var(--color-border)'}`,
          }}>
          <option value="">Choose…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 overflow-y-auto">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm"
            style={{ background: `color-mix(in srgb, ${avatarColor(receipt.merchant)} 20%, transparent)`, color: avatarColor(receipt.merchant) }}>
            {initials(receipt.merchant)}
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-lg truncate" style={{ color: 'var(--color-text-primary)' }}>{receipt.merchant}</h2>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
              {receipt.orderNumber ? `Order ${receipt.orderNumber} · ` : ''}
              {parsedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>
                <SourceIcon source={receipt.source} size={10} />
                {receipt.source === 'manual' ? 'Manual Upload' : 'From Gmail'}
              </span>
              {receipt.source === 'gmail' && receipt.gmailMessageId && (
                <a href={`https://mail.google.com/mail/u/0/#inbox/${receipt.gmailMessageId}`} target="_blank" rel="noreferrer"
                  className="text-[11px] font-medium hover:underline" style={{ color: 'var(--color-sky)' }}>
                  View email ↗
                </a>
              )}
              {receipt.imageMimeType && (
                <a href={imageUrl} target="_blank" rel="noreferrer"
                  className="text-[11px] font-medium hover:underline" style={{ color: 'var(--color-sky)' }}>
                  {isPdf ? 'View PDF' : 'View receipt'} ↗
                </a>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ color: 'var(--color-text-muted)' }}>✕</button>
      </div>
      {receipt.matchedTransaction && (
        <div className="mb-4" style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
          <FieldRow label="Category (suggested)">
            {category ? (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: `${category.color}15`, color: category.color }}>
                {category.icon} {category.name}
              </span>
            ) : (
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Uncategorized</span>
            )}
          </FieldRow>
          <FieldRow label="Match Status">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: `color-mix(in srgb, ${STATUS_COLOR[label]} 12%, transparent)`, color: STATUS_COLOR[label] }}>
              {label === 'Pending' ? 'Pending Review' : label}
            </span>
          </FieldRow>
          <FieldRow label="Matched To">
            <div className="text-right">
              <p className="text-xs font-medium" style={{ color: 'var(--color-sky)' }}>
                {receipt.matchedTransaction.name} — {money(receipt.matchedTransaction.amount)}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{receipt.matchedTransaction.date}</p>
            </div>
          </FieldRow>
        </div>
      )}

      <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>Line Items</p>

      {receipt.matchedTransaction || receipt.imported ? (
        <div className="space-y-1.5 mb-4">
          {receipt.items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate" style={{ color: 'var(--color-text-primary)' }}>{item.name}</span>
              <span className="shrink-0 tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{money(item.total)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 text-sm font-bold pt-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
            <span style={{ color: 'var(--color-text-primary)' }}>Total</span>
            <span style={{ color: 'var(--color-text-primary)' }}>{money(receipt.total)}</span>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            Assign a category to each item. Items with the same category become one transaction.
          </p>
          {suggestion && (
            <div className="rounded-xl p-3 mb-3 flex items-center justify-between gap-3"
              style={{ background: 'color-mix(in srgb, var(--color-card-violet) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 15%, transparent)' }}>
              <div className="min-w-0">
                <p className="text-xs font-medium" style={{ color: 'var(--color-card-violet)' }}>
                  All {receipt.items.length} item{receipt.items.length !== 1 ? 's' : ''} look{receipt.items.length === 1 ? 's' : ''} like {suggestion.categoryName}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Based on your last {suggestion.receiptsConsidered} {receipt.merchant} receipt{suggestion.receiptsConsidered !== 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => onApplyAll(suggestion.categoryId)}
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                style={{ background: 'var(--color-card-violet)', color: '#fff' }}>
                Apply
              </button>
            </div>
          )}

          {categoryGroups.length > 1 && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                {itemCount} item{itemCount !== 1 ? 's' : ''}
              </span>
              <button onClick={() => setGrouped((g) => !g)} className="text-[11px] font-medium hover:underline" style={{ color: 'var(--color-sky)' }}>
                {grouped ? 'Show original order' : 'Group by category'}
              </button>
            </div>
          )}

          <div className="space-y-2 mb-2">
            {grouped ? (
              categoryGroups.map((group) => (
                <div key={group.categoryId ?? 'uncategorized'}>
                  <div className="flex items-center justify-between px-1 mb-1">
                    <span className="text-[11px] font-semibold" style={{ color: group.color }}>{group.icon} {group.categoryName}</span>
                    <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{money(group.total)}</span>
                  </div>
                  <div className="space-y-2">
                    {group.itemIndices.map((idx) => renderItemRow(receipt.items[idx], idx))}
                  </div>
                </div>
              ))
            ) : (
              Array.from({ length: visibleCount }, (_, idx) => renderItemRow(receipt.items[idx], idx))
            )}
          </div>

          {!grouped && hiddenCount > 0 && (
            <button onClick={() => setShowAll(true)} className="text-xs font-medium mb-4 hover:underline block" style={{ color: 'var(--color-sky)' }}>
              {hiddenCount} more item{hiddenCount !== 1 ? 's' : ''}{hiddenCategoryLabel ? ` · all ${hiddenCategoryLabel}` : ''} · Show all
            </button>
          )}
          {(grouped || hiddenCount === 0) && <div className="mb-4" />}

          <div className="rounded-xl p-3 mb-3 space-y-1.5" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--color-text-muted)' }}>Subtotal</span>
              <span style={{ color: 'var(--color-text-secondary)' }}>{money(subtotal)}</span>
            </div>
            {tax > 0.01 && (
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--color-text-muted)' }}>Tax</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{money(tax)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm font-bold pt-1" style={{ borderTop: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-primary)' }}>Receipt total</span>
              <span style={{ color: 'var(--color-text-primary)' }}>{money(receipt.total)}</span>
            </div>
          </div>

          <div className="rounded-xl p-3 mb-4"
            style={{ background: 'color-mix(in srgb, var(--color-card-violet) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-card-violet) 15%, transparent)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-card-violet)' }}>
              This will create {transactionCount} transaction{transactionCount !== 1 ? 's' : ''}
            </p>
            <div className="space-y-1.5">
              {categoryGroups.map((group) => (
                <div key={group.categoryId ?? 'uncategorized'} className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {group.icon} {group.categoryName} · {group.itemIndices.length} item{group.itemIndices.length !== 1 ? 's' : ''}
                  </span>
                  <span className="font-medium tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{money(group.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        {receipt.matchedTransaction && !receipt.imported && (
          <button onClick={approve} disabled={approving || receipt.reviewed}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-80 disabled:opacity-60"
            style={{ background: receipt.reviewed ? 'var(--color-elevated)' : 'linear-gradient(180deg, var(--color-card-violet), var(--color-primary))', color: receipt.reviewed ? 'var(--color-text-secondary)' : '#fff' }}>
            {receipt.reviewed ? '✓ Approved' : approving ? 'Approving…' : 'Approve'}
          </button>
        )}

        {!receipt.matchedTransaction && !receipt.imported && (
          <button onClick={onImport} disabled={importing}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: 'linear-gradient(180deg, var(--color-card-violet), var(--color-primary))', color: '#fff' }}>
            {importing ? 'Creating…' : `Create ${transactionCount} Transaction${transactionCount !== 1 ? 's' : ''}`}
          </button>
        )}

        <MatchTransactionSection receipt={receipt} onChanged={onReceiptChanged} />
      </div>
    </div>
  );
}
