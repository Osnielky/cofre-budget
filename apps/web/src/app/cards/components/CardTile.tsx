'use client';

import type { CardView } from '@/lib/cards/types';
import { utilization, utilizationLevel, LEVEL_COLOR, aprOf } from '@/lib/cards/utilization';
import { cardNotice } from '@/lib/cards/card-notice';
import { fmt, fmtDate } from '@/app/debts/format';
import CardArt from './CardArt';
import { PANEL, MUTED } from './panel';

interface Props {
  card: CardView;
  accent: string;
  onOpen: () => void;
  onEnable: () => void;
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs" style={MUTED}>{label}</dt>
      <dd className="font-semibold tabular-nums truncate">{value}</dd>
      {sub && <dd className="text-[11px] truncate" style={MUTED}>{sub}</dd>}
    </div>
  );
}

export default function CardTile({ card, accent, onOpen, onEnable }: Props) {
  const ratio = utilization(card.balance, card.creditLimit);
  const color = ratio === null ? 'var(--color-text-muted)' : LEVEL_COLOR[utilizationLevel(ratio)];
  const purchase = aprOf(card, 'purchase');
  const promo = aprOf(card, 'special');
  const notice = cardNotice(card);
  const name = card.officialName ?? card.accountName;

  /* One primary action, picked from what the card needs most. */
  const primary =
    notice?.kind === 'enable' ? { label: 'Enable card details', onClick: onEnable }
    : notice?.kind === 'add_details' ? { label: 'Add details', onClick: onOpen }
    : null;

  return (
    <article className="card-lift rounded-2xl p-5 flex flex-col gap-4 min-w-0" style={PANEL}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug line-clamp-2">{name}</h3>
          <p className="text-xs truncate" style={MUTED}>{card.bankName}{card.last4 ? ` ···· ${card.last4}` : ''}</p>
          {card.isOverdue && (
            <span className="inline-block mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ color: 'var(--color-rose)', border: '1px solid var(--color-rose)' }}>Overdue</span>
          )}
        </div>
        <CardArt bank={card.bankName} label={name} last4={card.last4} accent={accent} kind="credit" />
      </div>

      <div>
        <p className="text-xs" style={MUTED}>Current balance</p>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-bold tabular-nums">${fmt(card.balance)}</span>
          <span className="text-xs" style={MUTED}>{card.creditLimit ? `of $${fmt(card.creditLimit)}` : 'limit unknown'}</span>
        </div>
        {ratio !== null && (
          <>
            <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}
              role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(Math.round(ratio * 100), 100)} aria-label="Card utilization">
              <div className="h-full rounded-full" style={{ width: `${Math.min(ratio * 100, 100)}%`, background: color }} />
            </div>
            <p className="mt-1 text-xs"><span className="font-semibold" style={{ color }}>{Math.round(ratio * 100)}%</span> <span style={MUTED}>utilized</span></p>
          </>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <Fact label="Purchase APR" value={purchase === null ? '—' : `${purchase}%`} />
        <Fact label="Promo APR" value={promo === null ? '—' : `${promo}%`}
          sub={promo !== null && card.promoAprEndsOn ? `until ${fmtDate(card.promoAprEndsOn)}` : undefined} />
        <Fact label="Next due" value={card.nextPaymentDueDate ? fmtDate(card.nextPaymentDueDate) : '—'} />
        <Fact label="Minimum payment" value={card.minimumPayment === null ? '—' : `$${fmt(card.minimumPayment)}`} />
      </dl>

      {notice && (
        <p className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>
          {notice.message}
          {notice.kind === 'reconnect' && (
            <> <a href="/settings" className="font-semibold underline" style={{ color: 'var(--color-primary)' }}>Go to Settings</a></>
          )}
        </p>
      )}

      <div className="mt-auto flex gap-2">
        {primary && (
          <button onClick={primary.onClick} className="btn-gold flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold">{primary.label}</button>
        )}
        <button onClick={onOpen}
          className={`${primary ? '' : 'flex-1 '}px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-(--color-elevated)`}
          style={{ border: '1px solid var(--color-border)' }}>
          View details →
        </button>
      </div>
    </article>
  );
}
