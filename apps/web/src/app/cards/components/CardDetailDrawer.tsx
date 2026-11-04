'use client';

/* Edit a card's details in the app sheet (bottom sheet on phones, side panel from md).
   Always mounted with `card` possibly null so the sheet can animate closed. */

import { useEffect, useState } from 'react';
import type { CardView } from '@/lib/cards/types';
import { formFromCard, formToPatch, type DetailForm } from '@/lib/cards/detail-form';
import Sheet from '@/components/motion/Sheet';

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

interface Props { card: CardView | null; onClose: () => void; onSaved: (card: CardView) => void }

function Form({ card, onClose, onSaved }: { card: CardView; onClose: () => void; onSaved: (card: CardView) => void }) {
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

  function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const { patch, errors: errs } = formToPatch(form, card);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (Object.keys(patch).length === 0) { onClose(); return; }
    send('', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label={`Edit ${card.accountName}`}>
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
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={saving} className="btn-gold px-4 py-2.5 rounded-xl text-sm font-semibold">{saving ? 'Saving…' : 'Save'}</button>
        {card.provider === 'plaid' && card.hasBankData && card.manualFields.length > 0 && (
          <button type="button" disabled={saving} onClick={() => send('/use-bank-data', { method: 'POST' })}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ border: '1px solid var(--color-border)' }}>
            Use bank data
          </button>
        )}
      </div>
    </form>
  );
}

export default function CardDetailDrawer({ card, onClose, onSaved }: Props) {
  /* Keep the last card while the sheet animates closed. */
  const [shown, setShown] = useState<CardView | null>(card);
  useEffect(() => { if (card) setShown(card); }, [card]);
  const current = card ?? shown;
  return (
    <Sheet open={!!card} onOpenChange={(o) => { if (!o) onClose(); }} title={current ? (current.officialName ?? current.accountName) : 'Card details'}
      description="Edit the limit, APRs, statement and payment details of this card.">
      {current && <Form key={current.accountId} card={current} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}
