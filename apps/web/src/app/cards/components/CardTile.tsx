'use client';

import type { CardView } from '@/lib/cards/types';
import { utilization, utilizationLevel, LEVEL_COLOR, aprOf } from '@/lib/cards/utilization';
import { cardNotice } from '@/lib/cards/card-notice';
import { fmt, fmtDate } from '@/app/debts/format';

interface Props {
  card: CardView;
  onOpen: () => void;
  onEnable: () => void;
}

export default function CardTile({ card, onOpen, onEnable }: Props) {
  const ratio = utilization(card.balance, card.creditLimit);
  const color = ratio === null ? 'var(--color-text-muted)' : LEVEL_COLOR[utilizationLevel(ratio)];
  const purchase = aprOf(card, 'purchase');
  const promo = aprOf(card, 'special');
  const notice = cardNotice(card);

  return (
    <article className="card-lift rounded-2xl p-5 flex flex-col gap-3 min-w-0"
      style={{ background: 'var(--color-surface)', border: 'var(--glass-border)', backdropFilter: 'var(--glass-blur)', boxShadow: 'var(--glass-shadow)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{card.officialName ?? card.accountName}</h3>
          <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
            {card.bankName}{card.last4 ? ` ···· ${card.last4}` : ''}
          </p>
        </div>
        {card.isOverdue && (
          <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ color: 'var(--color-rose)', border: '1px solid var(--color-rose)' }}>Overdue</span>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xl font-bold tabular-nums">${fmt(card.balance)}</span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {card.creditLimit ? `of $${fmt(card.creditLimit)}` : 'limit unknown'}
          </span>
        </div>
        {ratio !== null && (
          <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}
            role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(Math.round(ratio * 100), 100)} aria-label="Card utilization">
            <div className="h-full rounded-full" style={{ width: `${Math.min(ratio * 100, 100)}%`, background: color }} />
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Purchase APR</dt>
          <dd className="font-semibold tabular-nums">{purchase === null ? '—' : `${purchase}%`}</dd>
        </div>
        <div>
          <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Promo APR</dt>
          <dd className="font-semibold tabular-nums">
            {promo === null ? '—' : `${promo}%`}
            {promo !== null && card.promoAprEndsOn && <span className="block text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>until {fmtDate(card.promoAprEndsOn)}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Next due</dt>
          <dd className="font-semibold">{card.nextPaymentDueDate ? fmtDate(card.nextPaymentDueDate) : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Minimum</dt>
          <dd className="font-semibold tabular-nums">{card.minimumPayment === null ? '—' : `$${fmt(card.minimumPayment)}`}</dd>
        </div>
      </dl>

      {notice && (
        <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>
          {notice.message}
          {notice.kind === 'enable' && (
            <button onClick={onEnable} className="btn-gold mt-2 block w-full px-3 py-2 rounded-lg text-xs font-semibold">Enable card details</button>
          )}
          {notice.kind === 'reconnect' && (
            <a href="/settings" className="mt-2 block font-semibold underline" style={{ color: 'var(--color-primary)' }}>Go to Settings</a>
          )}
          {notice.kind === 'add_details' && (
            <button onClick={onOpen} className="mt-2 block font-semibold underline" style={{ color: 'var(--color-primary)' }}>Add details</button>
          )}
        </div>
      )}

      <button onClick={onOpen} className="mt-auto self-start text-sm font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}>
        Edit details
      </button>
    </article>
  );
}
