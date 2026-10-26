'use client';

import { useMemo, useState } from 'react';
import { payoffPlan } from '@/lib/tools/payoff';
import { utilization } from '@/lib/cards/utilization';
import { utilizationRating } from '@/lib/cards/overview';
import ToolField, { parseAmount, money0, money2 } from './ToolField';
import { Panel, Stat, Empty } from './ResultCard';

const months = (n: number) => {
  const y = Math.floor(n / 12), m = n % 12;
  if (y === 0) return `${m} month${m === 1 ? '' : 's'}`;
  return m === 0 ? `${y} year${y === 1 ? '' : 's'}` : `${y} yr ${m} mo`;
};

export default function PayoffCalculator() {
  const [balance, setBalance] = useState('4,500');
  const [apr, setApr] = useState('24.99');
  const [payment, setPayment] = useState('200');
  const [limit, setLimit] = useState('10,000');

  const b = parseAmount(balance), a = parseAmount(apr), p = parseAmount(payment), l = parseAmount(limit);
  const ready = b !== null && a !== null && p !== null;

  const plan = useMemo(() => (ready ? payoffPlan({ balance: b, aprPct: a, payment: p }) : null), [ready, b, a, p]);
  const plus50 = useMemo(() => (ready ? payoffPlan({ balance: b, aprPct: a, payment: p + 50 }) : null), [ready, b, a, p]);
  const ratio = b !== null && l !== null ? utilization(b, l) : null;
  const rating = ratio === null ? null : utilizationRating(ratio);
  const ratingTone = rating === 'Excellent' || rating === 'Good' ? 'good' : rating === 'High' ? 'warn' : 'bad';

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Panel className="flex flex-col gap-4 self-start">
        <ToolField label="Card balance" prefix="$" value={balance} onChange={setBalance} />
        <ToolField label="Purchase APR" suffix="%" value={apr} onChange={setApr} hint="On your statement, under interest charge calculation." />
        <ToolField label="You pay each month" prefix="$" value={payment} onChange={setPayment} />
        <ToolField label="Credit limit (optional)" prefix="$" value={limit} onChange={setLimit} hint="For the utilization check." />
      </Panel>

      <div className="flex flex-col gap-5">
        {!plan && <Panel><Empty>Enter a balance, an APR and a payment.</Empty></Panel>}
        {plan && plan.never && (
          <Panel>
            <p className="text-lg font-semibold" style={{ color: 'var(--color-rose)' }}>
              {plan.cappedAt ? 'This payment takes more than 50 years.' : 'This payment never clears the balance.'}
            </p>
            <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Interest alone is about {money2(plan.minimumToMakeProgress - 1)} a month. Pay at least {money2(plan.minimumToMakeProgress)} to make progress, and more to make it fast.
            </p>
          </Panel>
        )}
        {plan && !plan.never && plan.months === 0 && <Panel><p className="text-lg font-semibold" style={{ color: 'var(--color-green)' }}>Nothing to pay off.</p></Panel>}
        {plan && !plan.never && plan.months > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Paid off in" value={months(plan.months)} tone="good" />
            <Stat label="Total interest" value={money0(plan.totalInterest)} sub={`${money0(plan.totalPaid)} paid in total`} tone="warn" />
            <Stat
              label="Paying $50 more"
              value={plus50 && !plus50.never ? months(plus50.months) : '—'}
              sub={plus50 && !plus50.never ? `saves ${money0(plan.totalInterest - plus50.totalInterest)} in interest` : undefined}
            />
          </div>
        )}
        {ratio !== null && rating && (
          <Panel>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>Utilization</h2>
              <span className="text-sm font-semibold" style={{ color: ratingTone === 'good' ? 'var(--color-green)' : ratingTone === 'warn' ? 'var(--color-amber)' : 'var(--color-rose)' }}>
                {(ratio * 100).toFixed(0)}% · {rating}
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, ratio * 100)}%`, background: ratingTone === 'good' ? 'var(--color-green)' : ratingTone === 'warn' ? 'var(--color-amber)' : 'var(--color-rose)' }} />
            </div>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Lenders like to see balances under 30% of the limit, and under 10% is excellent. On this card, 30% is {money0(l! * 0.3)} and 10% is {money0(l! * 0.1)}.
            </p>
          </Panel>
        )}
        {plan && !plan.never && plan.months > 0 && (
          <details className="rounded-3xl px-5 sm:px-7 py-4" style={{ background: 'var(--color-surface)', border: 'var(--glass-border)' }}>
            <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Month-by-month schedule</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <thead>
                  <tr className="text-left" style={{ color: 'var(--color-text-muted)' }}>
                    <th className="py-1.5 pr-3 font-semibold">Month</th><th className="py-1.5 pr-3 font-semibold">Interest</th><th className="py-1.5 pr-3 font-semibold">Principal</th><th className="py-1.5 font-semibold">Balance after</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.schedule.map((r) => (
                    <tr key={r.month} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td className="py-1.5 pr-3">{r.month}</td><td className="py-1.5 pr-3">{money2(r.interest)}</td><td className="py-1.5 pr-3">{money2(r.principal)}</td><td className="py-1.5">{money2(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
