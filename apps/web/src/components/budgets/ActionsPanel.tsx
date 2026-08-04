'use client';

import { deriveBudget, roundUp50 } from '@/lib/budgets/derive';
import type { UnbudgetedSlice } from '@/lib/budgets/derive';
import type { BudgetWithSpent } from '@/lib/budgets/types';

function fmt(n: number) { return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }

interface ActionItem {
  key: string; tone: 'rose' | 'amber' | 'green';
  icon: string; text: React.ReactNode; sub: React.ReactNode;
  onClick?: () => void;
}

interface ActionsPanelProps {
  spending: BudgetWithSpent[];
  unbudgeted: UnbudgetedSlice[];
  month: string; now: Date;
  daysLeft: number;
  totalRemaining: number; // combined (budgeted + unbudgeted)
  budgetPerDay: number;   // combined
  onRaise: (budget: BudgetWithSpent, newAmount: number) => void;
  onSetUnbudgeted: (categoryId: string) => void;
}

const TONE_BG: Record<ActionItem['tone'], string> = {
  rose: 'color-mix(in srgb, var(--color-rose) 8%, transparent)',
  amber: 'color-mix(in srgb, var(--color-amber) 8%, transparent)',
  green: 'color-mix(in srgb, var(--color-green) 7%, transparent)',
};
const TONE_BORDER: Record<ActionItem['tone'], string> = {
  rose: 'color-mix(in srgb, var(--color-rose) 22%, transparent)',
  amber: 'color-mix(in srgb, var(--color-amber) 22%, transparent)',
  green: 'color-mix(in srgb, var(--color-green) 20%, transparent)',
};
const TONE_COLOR: Record<ActionItem['tone'], string> = {
  rose: 'var(--color-rose)', amber: 'var(--color-amber)', green: 'var(--color-green)',
};

export default function ActionsPanel({
  spending, unbudgeted, month, now, daysLeft, totalRemaining, budgetPerDay, onRaise, onSetUnbudgeted,
}: ActionsPanelProps) {
  const derived = spending.map((b) => ({ b, d: deriveBudget(b, month, now) }));

  const over = derived
    .filter(({ d }) => d.riskGroup === 'over')
    .sort((a, b) => (Number(b.b.spent) - Number(b.b.amount)) - (Number(a.b.spent) - Number(a.b.amount)));

  const projectedOver = derived
    .filter(({ b, d }) => d.riskGroup !== 'over' && d.projected > Number(b.amount))
    .sort((a, b) => (b.d.projected - Number(b.b.amount)) - (a.d.projected - Number(a.b.amount)));

  const items: ActionItem[] = [];

  if (over.length) {
    const { b, d } = over[0];
    const overBy = Number(b.spent) - Number(b.amount);
    items.push({
      key: `over-${b.id}`, tone: 'rose', icon: b.category?.icon ?? '📦',
      text: <>{b.category?.name} is already <strong>{`$${fmt(overBy)}`}</strong> over</>,
      sub: <>Raise to <strong>${fmt(roundUp50(d.projected))}</strong> or freeze the category</>,
      onClick: () => onRaise(b, roundUp50(d.projected)),
    });
  }
  if (projectedOver.length) {
    const { b, d } = projectedOver[0];
    const willBeOver = d.projected - Number(b.amount);
    items.push({
      key: `proj-${b.id}`, tone: 'amber', icon: b.category?.icon ?? '📦',
      text: <>{b.category?.name} will land ~<strong>{`$${fmt(willBeOver)}`}</strong> over</>,
      sub: d.perDay != null ? <>${fmt(d.perDay)}/day for {daysLeft} days keeps it in</> : 'Keep an eye on it',
      onClick: () => onRaise(b, roundUp50(d.projected)),
    });
  }
  if (unbudgeted.length) {
    const totalUnbudgeted = unbudgeted.reduce((s, u) => s + u.total, 0);
    const top = unbudgeted[0];
    items.push({
      key: 'unbudgeted', tone: 'amber', icon: top.category.icon,
      text: <>${fmt(totalUnbudgeted)} spent outside any budget</>,
      sub: <>{top.category.name} has no limit set — add one</>,
      onClick: () => onSetUnbudgeted(top.categoryId),
    });
  }

  const flaggedIds = new Set([...over.map((o) => o.b.id), ...projectedOver.map((p) => p.b.id)]);
  const clearCount = spending.length - flaggedIds.size;
  if (items.length < 4 && clearCount > 0) {
    const fixedNames = derived.filter(({ b, d }) => !flaggedIds.has(b.id) && d.isFixed).map(({ b }) => b.category?.name).filter(Boolean);
    items.push({
      key: 'clear', tone: 'green', icon: '✓',
      text: <>{clearCount} budget{clearCount === 1 ? '' : 's'} need{clearCount === 1 ? 's' : ''} no attention</>,
      sub: fixedNames.length
        ? <>{fixedNames.slice(0, 2).join(' and ')} {fixedNames.length === 1 ? 'is a' : 'are'} fixed bill{fixedNames.length === 1 ? '' : 's'}</>
        : 'Keep it up.',
    });
  }

  return (
    <div className="flex flex-col gap-3 p-5 rounded-2xl"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
      <span className="text-[10.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>What to do about it</span>

      <div className="p-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 20%, transparent)' }}>
        <p className="text-[10.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>Daily allowance left</p>
        <p className="font-extrabold tabular-nums leading-none mt-1" style={{ fontSize: 32, color: 'var(--color-text-primary)' }}>
          ${fmt(budgetPerDay)}
        </p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
          ${fmt(totalRemaining)} unspent across {daysLeft} remaining day{daysLeft === 1 ? '' : 's'}. Stay under this and every budget lands.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <button key={it.key} type="button" onClick={it.onClick} disabled={!it.onClick}
            className="flex items-start gap-3 p-3 rounded-xl text-left transition-transform disabled:cursor-default"
            style={{ background: TONE_BG[it.tone], border: `1px solid ${TONE_BORDER[it.tone]}`, cursor: it.onClick ? 'pointer' : 'default' }}
            onMouseEnter={(e) => { if (it.onClick) e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}>
            <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
              style={{ background: `color-mix(in srgb, ${TONE_COLOR[it.tone]} 16%, transparent)` }}>
              {it.icon}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{it.text}</p>
              <p className="text-[11px] mt-0.5" style={{ color: TONE_COLOR[it.tone] }}>{it.sub}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
