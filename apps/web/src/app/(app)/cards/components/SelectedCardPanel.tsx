'use client';

/* Everything about the card the deck has picked. Slides in from the side the user moved
   toward, the figures roll to their new values, the limit bar grows to the utilization.
   Credit: balance, available credit, limit, payment tiles, APRs, statement, last payment,
   the card's notice and its actions. Debit: available balance, spent this month. */

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { CardView, DebitView } from '@/lib/cards/types';
import type { DeckEntry } from '@/lib/cards/deck';
import { utilization, utilizationLevel, LEVEL_COLOR, aprOf } from '@/lib/cards/utilization';
import { cardNotice } from '@/lib/cards/card-notice';
import { fmt, fmtDate } from '@/app/(app)/debts/format';
import { Money, MoneyGroup, Percent } from '@/components/motion/Money';
import { springs, durations, slideVariants, fadeUp } from '@/lib/motion/tokens';
import { PANEL, MUTED } from './panel';
import RecentActivity from './RecentActivity';

interface Props {
  entry: DeckEntry;
  direction: 1 | -1;
  onEdit: (card: CardView) => void;
  onEnable: (card: CardView) => void;
}

function Pill({ children, tone }: { children: React.ReactNode; tone: 'neutral' | 'rose' | 'green' }) {
  const color = tone === 'rose' ? 'var(--color-rose)' : tone === 'green' ? 'var(--color-green)' : 'var(--color-text-secondary)';
  return (
    <span className="inline-flex items-center text-fine font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{ color, border: `1px solid ${tone === 'neutral' ? 'var(--color-border)' : color}` }}>{children}</span>
  );
}

function Tile({ label, children, i, reduce }: { label: string; children: React.ReactNode; i: number; reduce: boolean }) {
  return (
    <motion.div {...fadeUp(i, reduce)} className="min-w-0 rounded-xl px-3 py-2.5" style={{ background: 'var(--color-elevated)' }}>
      <p className="text-xs" style={MUTED}>{label}</p>
      <p className="font-semibold tabular-nums truncate">{children}</p>
    </motion.div>
  );
}

function Fact({ label, value, sub, i, reduce }: { label: string; value: React.ReactNode; sub?: string; i: number; reduce: boolean }) {
  return (
    <motion.div {...fadeUp(i, reduce)} className="min-w-0">
      <dt className="text-xs" style={MUTED}>{label}</dt>
      <dd className="font-semibold tabular-nums truncate">{value}</dd>
      {sub && <dd className="text-fine truncate" style={MUTED}>{sub}</dd>}
    </motion.div>
  );
}

function Header({ entry }: { entry: DeckEntry }) {
  const synced = entry.kind === 'credit' ? entry.card.provider === 'plaid' : entry.account.provider === 'plaid';
  const overdue = entry.kind === 'credit' && entry.card.isOverdue;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-bold leading-snug flex items-baseline gap-2 min-w-0">
          <span className="truncate">{entry.name}</span>
          {entry.last4 && <span className="shrink-0 text-sm font-medium tabular-nums" style={MUTED}>·· {entry.last4}</span>}
        </h2>
        <p className="text-xs truncate" style={MUTED}>{entry.bank} · {synced ? 'Synced with your bank' : 'Added by hand'}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {overdue && <Pill tone="rose">Overdue</Pill>}
        <Pill tone="neutral">{entry.kind}</Pill>
      </div>
    </div>
  );
}

function CreditDetail({ card, reduce, onEdit, onEnable }: { card: CardView; reduce: boolean; onEdit: () => void; onEnable: () => void }) {
  const ratio = utilization(card.balance, card.creditLimit);
  const color = ratio === null ? 'var(--color-text-muted)' : LEVEL_COLOR[utilizationLevel(ratio)];
  const available = card.creditLimit !== null ? Math.max(card.creditLimit - card.balance, 0) : null;
  const purchase = aprOf(card, 'purchase');
  const promo = aprOf(card, 'special');
  const cashAdvance = aprOf(card, 'cash_advance');
  const transfer = aprOf(card, 'balance_transfer');
  const monthlyInterest = purchase !== null && card.balance > 0 ? Math.round((card.balance * purchase) / 12) / 100 : null;
  const notice = cardNotice(card);
  const primary =
    notice?.kind === 'enable' ? { label: 'Enable card details', onClick: onEnable }
    : notice?.kind === 'add_details' ? { label: 'Add details', onClick: onEdit }
    : null;

  return (
    <MoneyGroup>
      <div className="grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <p className="text-xs" style={MUTED}>Current balance</p>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums truncate"><Money value={card.balance} /></p>
        </div>
        <div className="min-w-0">
          <p className="text-xs" style={MUTED}>Available credit</p>
          {available === null
            ? <button type="button" onClick={onEdit} className="text-sm font-semibold underline" style={{ color: 'var(--color-primary)' }}>Add a limit</button>
            : <p className="text-2xl sm:text-3xl font-bold tabular-nums truncate" style={{ color: 'var(--color-green)' }}><Money value={available} /></p>}
        </div>
      </div>

      {ratio !== null && card.creditLimit !== null && (
        <div>
          <div className="flex items-center justify-between text-xs">
            <span style={MUTED}>Limit ${fmt(card.creditLimit)}</span>
            <span><span className="font-semibold" style={{ color }}><Percent ratio={Math.min(ratio, 9.99)} /></span> <span style={MUTED}>utilized</span></span>
          </div>
          <div className="mt-1.5 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}
            role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(Math.round(ratio * 100), 100)} aria-label="Card utilization">
            <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(ratio * 100, 100)}%` }}
              transition={reduce ? { duration: 0 } : { ...springs.soft, delay: 0.1 }} style={{ background: color }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Minimum payment" i={0} reduce={reduce}>{card.minimumPayment === null ? '—' : <Money value={card.minimumPayment} />}</Tile>
        <Tile label="Due date" i={1} reduce={reduce}>{card.nextPaymentDueDate ? fmtDate(card.nextPaymentDueDate) : '—'}</Tile>
        <Tile label="Rewards" i={2} reduce={reduce}>{card.rewardsBalance === null ? '—' : <Money value={card.rewardsBalance} />}</Tile>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-3 text-sm pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <Fact i={3} reduce={reduce} label="Purchase APR" value={purchase === null ? '—' : `${purchase}%`}
          sub={monthlyInterest !== null ? `≈ $${fmt(monthlyInterest)} interest / month` : undefined} />
        <Fact i={4} reduce={reduce} label="Promo APR" value={promo === null ? '—' : `${promo}%`}
          sub={promo !== null && card.promoAprEndsOn ? `until ${fmtDate(card.promoAprEndsOn)}` : undefined} />
        <Fact i={5} reduce={reduce} label="Cash advance APR" value={cashAdvance === null ? '—' : `${cashAdvance}%`} />
        <Fact i={6} reduce={reduce} label="Balance transfer APR" value={transfer === null ? '—' : `${transfer}%`} />
        <Fact i={7} reduce={reduce} label="Statement balance" value={card.lastStatementBalance === null ? '—' : <Money value={card.lastStatementBalance} />}
          sub={card.lastStatementDate ? fmtDate(card.lastStatementDate) : undefined} />
        <Fact i={8} reduce={reduce} label="Last payment" value={card.lastPaymentAmount === null ? '—' : <Money value={card.lastPaymentAmount} />}
          sub={card.lastPaymentDate ? fmtDate(card.lastPaymentDate) : undefined} />
      </dl>

      {notice && (
        <p className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>
          {notice.message}
          {notice.kind === 'reconnect' && (
            <> <a href="/settings" className="font-semibold underline" style={{ color: 'var(--color-primary)' }}>Go to Settings</a></>
          )}
        </p>
      )}

      <div className="flex gap-2">
        {primary && (
          <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={primary.onClick}
            className="btn-gold flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold">{primary.label}</motion.button>
        )}
        {notice?.kind !== 'add_details' && (
          <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={onEdit}
            className={`${primary ? '' : 'flex-1 '}px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-(--color-elevated)`}
            style={{ border: '1px solid var(--color-border)' }}>
            Edit details
          </motion.button>
        )}
      </div>
    </MoneyGroup>
  );
}

function DebitDetail({ account, reduce }: { account: DebitView; reduce: boolean }) {
  return (
    <MoneyGroup>
      <div className="grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <p className="text-xs" style={MUTED}>Available balance</p>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums truncate"><Money value={account.balance} /></p>
        </div>
        <div className="min-w-0">
          <p className="text-xs" style={MUTED}>Spent this month</p>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums truncate"><Money value={account.spentThisMonth} /></p>
        </div>
      </div>
      {account.plaidItemStatus === 'error' && (
        <p className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>
          This bank connection needs attention.{' '}
          <a href="/settings" className="font-semibold underline" style={{ color: 'var(--color-primary)' }}>Reconnect in Settings</a>
        </p>
      )}
      <motion.a {...fadeUp(0, reduce)} href="/transactions" className="text-center px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-(--color-elevated)"
        style={{ border: '1px solid var(--color-border)' }}>
        View transactions →
      </motion.a>
    </MoneyGroup>
  );
}

export default function SelectedCardPanel({ entry, direction, onEdit, onEnable }: Props) {
  const reduce = !!useReducedMotion();
  const [activityOpen, setActivityOpen] = useState(false);
  const v = slideVariants(direction, reduce);
  return (
    <div className="rounded-2xl p-5 overflow-hidden" style={PANEL}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={entry.id} initial={v.initial} animate={v.animate} exit={v.exit}
          transition={reduce ? { duration: 0 } : { ...springs.soft, opacity: { duration: durations.fast } }}
          className="flex flex-col gap-4">
          <Header entry={entry} />
          {entry.kind === 'credit'
            ? <CreditDetail card={entry.card} reduce={reduce} onEdit={() => onEdit(entry.card)} onEnable={() => onEnable(entry.card)} />
            : <DebitDetail account={entry.account} reduce={reduce} />}
          <RecentActivity accountId={entry.id} open={activityOpen} onToggle={() => setActivityOpen((o) => !o)} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
