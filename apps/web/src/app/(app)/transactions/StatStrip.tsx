'use client';

import StatTile from '@/components/StatTile';
import { describeDelta } from '@/lib/ui/statTile';

/* Four summary tiles for the transactions page: net cash flow, income,
   expenses, recurring — each with a delta vs the previous window and a
   two-point trend line (previous value → current value, drawn from data
   already loaded; no extra fetch). Pure presentation on the shared StatTile. */

interface Category { id: string; name: string; icon: string; color: string; type: string }
interface TxLite {
  amount: number; categoryId: string | null; projectId: string | null;
  debtId: string | null; categoryRef: Category | null;
}

interface Props {
  transactions: TxLite[];
  prev: TxLite[];
  recurringNow: number;   // $/mo of recurring merchants active in the current window
  recurringPrev: number;
  prevLabel: string;      // "May 2026" or "prior period"
  loading: boolean;
}

function MiniIcon({ d }: { d: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const I_WAVE  = 'M2 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0';
const I_UP    = 'M12 21V7 M6 13l6-6 6 6';
const I_DOWN  = 'M12 3v14 M6 11l6 6 6-6';
const I_SYNC  = 'M21 12a9 9 0 1 1-2.6-6.4 M21 3v5h-5';

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Transfers and savings moves are neither income nor spending. */
const isTransfer = (t: TxLite) => t.categoryRef?.type === 'transfer' || t.categoryRef?.type === 'savings' || !!t.debtId;
const income   = (l: TxLite[]) => l.filter((t) => !isTransfer(t) && Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
const expenses = (l: TxLite[]) => l.filter((t) => !isTransfer(t) && Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

export default function StatStrip({ transactions, prev, recurringNow, recurringPrev, prevLabel, loading }: Props) {
  const hasPrev = prev.length > 0;
  const pct = (cur: number, old: number) => (hasPrev && old !== 0 ? +(((cur - old) / Math.abs(old)) * 100).toFixed(1) : null);

  const inc = income(transactions), incP = income(prev);
  const exp = expenses(transactions), expP = expenses(prev);
  const net = inc - exp, netP = incP - expP;

  const cards: {
    label: string; value: string; color: string; icon: string;
    prevValue: number; curValue: number;
    delta: number | null; goodWhenUp: boolean;
  }[] = [
    { label: 'Net cash flow', value: money(net), color: 'var(--color-sky)', icon: I_WAVE,
      prevValue: netP, curValue: net, delta: pct(net, netP), goodWhenUp: true },
    { label: 'Income', value: money(inc), color: 'var(--color-green)', icon: I_UP,
      prevValue: incP, curValue: inc, delta: pct(inc, incP), goodWhenUp: true },
    { label: 'Expenses', value: money(exp), color: 'var(--color-orange)', icon: I_DOWN,
      prevValue: expP, curValue: exp, delta: pct(exp, expP), goodWhenUp: false },
    { label: 'Recurring', value: money(recurringNow), color: 'var(--color-violet)', icon: I_SYNC,
      prevValue: recurringPrev, curValue: recurringNow, delta: pct(recurringNow, recurringPrev), goodWhenUp: false },
  ];

  // The "vs <period>" note only makes sense next to a chip; a flat or unknown change shows none.
  const vs = <><span className="hidden sm:inline">vs {prevLabel}</span><span className="sm:hidden">vs prev.</span></>;

  return (
    /* Phones: a 2×2 grid of compact tiles; from sm the tiles auto-fit at ≥200px (four across beside the insights column at xl). */
    <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:[grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
      {cards.map((c) => (
        <StatTile key={c.label} label={c.label} value={c.value} accent={c.color}
          icon={<MiniIcon d={c.icon} />}
          delta={{ value: c.delta, inverse: !c.goodWhenUp }} sub={describeDelta({ value: c.delta }) ? vs : undefined}
          trend={hasPrev ? { kind: 'spark', values: [c.prevValue, c.curValue] } : null}
          loading={loading} />
      ))}
    </div>
  );
}
