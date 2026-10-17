'use client';

import type { DebitView } from '@/lib/cards/types';
import { fmt } from '@/app/debts/format';
import CardArt from './CardArt';
import { PANEL, MUTED } from './panel';

/* A checking account shown as its debit card: what's available and what went out this month. */
export default function DebitTile({ account, accent }: { account: DebitView; accent: string }) {
  return (
    <article className="card-lift rounded-2xl p-5 flex flex-col gap-4 min-w-0" style={PANEL}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug line-clamp-2">{account.accountName}</h3>
          <p className="text-xs truncate" style={MUTED}>{account.bankName}{account.last4 ? ` ···· ${account.last4}` : ''}</p>
          {account.plaidItemStatus === 'error' && (
            <a href="/settings" className="inline-block mt-1.5 text-[11px] font-semibold underline" style={{ color: 'var(--color-rose)' }}>
              Reconnect in Settings
            </a>
          )}
        </div>
        <CardArt bank={account.bankName} label={account.accountName} last4={account.last4} accent={accent} kind="debit" />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div className="min-w-0">
          <dt className="text-xs" style={MUTED}>Available balance</dt>
          <dd className="text-xl font-bold tabular-nums truncate">${fmt(account.balance)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs" style={MUTED}>Spent this month</dt>
          <dd className="text-xl font-bold tabular-nums truncate">${fmt(account.spentThisMonth)}</dd>
        </div>
      </dl>
      <a href="/transactions" className="mt-auto text-center px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-(--color-elevated)"
        style={{ border: '1px solid var(--color-border)' }}>
        View transactions →
      </a>
    </article>
  );
}
