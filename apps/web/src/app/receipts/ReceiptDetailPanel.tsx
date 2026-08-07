'use client';

import { useState } from 'react';
import { countGroups, money, statusLabel, type Receipt, type MerchantSuggestion } from '@/lib/receipts/derive';
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
  const groups = countGroups(receipt.items.length, itemCategories);
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
          <div className="space-y-2 mb-4">
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
            {importing ? 'Creating…' : `Create ${groups} Transaction${groups !== 1 ? 's' : ''}`}
          </button>
        )}

        <MatchTransactionSection receipt={receipt} onChanged={onReceiptChanged} />
      </div>
    </div>
  );
}
