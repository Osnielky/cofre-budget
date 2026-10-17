'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { CardView } from '@/lib/cards/types';
import { formFromCard, formToPatch, type DetailForm } from '@/lib/cards/detail-form';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const FIELDS: { key: keyof DetailForm; label: string; type: 'text' | 'date'; hint?: string }[] = [
  { key: 'creditLimit', label: 'Credit limit ($)', type: 'text' },
  { key: 'purchaseApr', label: 'Purchase APR (%)', type: 'text' },
  { key: 'promoApr', label: 'Promo APR (%)', type: 'text', hint: 'Intro or balance-transfer rate, if any' },
  { key: 'promoAprEndsOn', label: 'Promo APR ends', type: 'date' },
  { key: 'lastStatementBalance', label: 'Statement balance ($)', type: 'text' },
  { key: 'minimumPayment', label: 'Minimum payment ($)', type: 'text' },
  { key: 'nextPaymentDueDate', label: 'Next due date', type: 'date' },
  { key: 'rewardsBalance', label: 'Rewards balance', type: 'text', hint: 'Points, miles or cash back' },
];

interface Props { card: CardView; onClose: () => void; onSaved: (card: CardView) => void }

export default function CardDetailDrawer({ card, onClose, onSaved }: Props) {
  const [form, setForm] = useState<DetailForm>(() => formFromCard(card));
  const [errors, setErrors] = useState<Partial<Record<keyof DetailForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState('');

  async function send(path: string, init: RequestInit) {
    setSaving(true); setFailed('');
    try {
      const res = await fetch(`${API}/cards/${card.accountId}${path}`, { credentials: 'include', ...init });
      if (!res.ok) throw new Error();
      onSaved(await res.json());
      onClose();
    } catch {
      setFailed('Could not save. Check the values and try again.');
    } finally {
      setSaving(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const { patch, errors: errs } = formToPatch(form, card);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (Object.keys(patch).length === 0) { onClose(); return; }
    send('', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md max-h-[90dvh] md:max-h-none overflow-y-auto rounded-t-2xl md:rounded-none p-5 flex flex-col gap-4"
        style={{ background: 'var(--popover-bg)', borderLeft: '1px solid var(--color-border)' }}
        aria-label={`Edit ${card.accountName}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold text-lg truncate">{card.officialName ?? card.accountName}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-[var(--color-elevated)]">✕</button>
        </div>
        {card.provider === 'plaid' && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Values you type here stay until you choose “Use bank data”. A newer statement from your bank replaces the statement fields.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIELDS.map(({ key, label, type, hint }) => (
            <label key={key} className="flex flex-col gap-1 text-sm">
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {label}{card.manualFields.includes(key) ? ' · edited' : ''}
              </span>
              <input type={type} inputMode={type === 'text' ? 'decimal' : undefined} value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                aria-invalid={!!errors[key]}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--color-elevated)', border: `1px solid ${errors[key] ? 'var(--color-rose)' : 'var(--color-border)'}` }} />
              {errors[key] ? <span className="text-xs" style={{ color: 'var(--color-rose)' }}>{errors[key]}</span>
                : hint ? <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{hint}</span> : null}
            </label>
          ))}
        </div>
        {failed && <p className="text-sm" style={{ color: 'var(--color-rose)' }}>{failed}</p>}
        <div className="flex flex-wrap gap-2 mt-auto">
          <button type="submit" disabled={saving} className="btn-gold px-4 py-2.5 rounded-xl text-sm font-semibold">{saving ? 'Saving…' : 'Save'}</button>
          {card.provider === 'plaid' && card.hasBankData && card.manualFields.length > 0 && (
            <button type="button" disabled={saving} onClick={() => send('/use-bank-data', { method: 'POST' })}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ border: '1px solid var(--color-border)' }}>
              Use bank data
            </button>
          )}
        </div>
      </form>
    </div>,
    document.body,
  );
}
