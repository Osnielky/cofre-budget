'use client';

import { memo, useEffect, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import type { DerivedRow } from '@/lib/budgets/calculations';
import { sliderScale } from '@/lib/budgets/calculations';
import type { DraftAction } from '@/lib/budgets/draft';
import { formatMoney } from '@/lib/budgets/money';
import { BudgetAmountInput, BudgetSlider, BudgetUsageIndicator, TrendSparkline } from './BudgetControls';
import { Icon, STATUS_LABEL, statusColor } from './ui';

export interface RowHandlers {
  dispatch: Dispatch<DraftAction>;
  onToggleSelect: (key: string) => void;
  onToggleExpand: (key: string) => void;
  onEditDetails: (key: string) => void;
  onDelete: (key: string) => void;
}

interface Props extends RowHandlers {
  row: DerivedRow;
  trendLabels: string[];
  selected: boolean;
  expanded: boolean;
  flash: boolean;
  deleting: boolean;
}

function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

function RowMenu({ row, expanded, handlers }: { row: DerivedRow; expanded: boolean; handlers: RowHandlers }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) { setConfirmDelete(false); return; }
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  const item = 'w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left rounded-lg hover:bg-[var(--color-surface)] cursor-pointer';
  const run = (fn: () => void) => () => { fn(); setOpen(false); };
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Actions for ${row.name}`}
        onClick={() => setOpen((o) => !o)}
        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--color-elevated)] cursor-pointer"
        style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
        <Icon name="dots" size={14} strokeWidth={2.2} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-52 p-1 rounded-xl"
          style={{ background: 'var(--popover-bg, var(--color-elevated))', border: '1px solid var(--color-border)', boxShadow: 'var(--glass-shadow)' }}>
          <button role="menuitem" type="button" className={item} onClick={run(() => handlers.onToggleExpand(row.key))}>
            <Icon name="eye" size={14} /> {expanded ? 'Hide transactions' : 'View transactions'}
          </button>
          {row.modified && (
            <button role="menuitem" type="button" className={item} onClick={run(() => handlers.dispatch({ type: 'resetRow', key: row.key }))}>
              <Icon name="reset" size={14} /> Reset to saved ({formatMoney(row.originalCents)})
            </button>
          )}
          {row.budgetId && (
            <button role="menuitem" type="button" className={item} onClick={run(() => handlers.onEditDetails(row.key))}>
              <Icon name="edit" size={14} /> Edit details
            </button>
          )}
          {row.budgetId && (confirmDelete ? (
            <button role="menuitem" type="button" className={item} style={{ color: 'var(--color-rose)' }}
              onClick={run(() => handlers.onDelete(row.key))}>
              <Icon name="trash" size={14} /> Confirm delete
            </button>
          ) : (
            <button role="menuitem" type="button" className={item} style={{ color: 'var(--color-rose)' }}
              onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={14} /> Delete budget…
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileLabel({ children }: { children: React.ReactNode }) {
  return <p className="budget-mlabel text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--color-text-muted)' }}>{children}</p>;
}

function CategoryBudgetRow({ row, trendLabels, selected, expanded, flash, deleting, ...handlers }: Props) {
  const scale = sliderScale(row.originalCents, row.spentCents);
  const sc = statusColor(row.status);
  const atLimit = row.status === 'over' && row.remainingCents === 0;
  const attention = row.status === 'over' || row.status === 'near' || row.status === 'unbudgeted';
  const tint = row.status === 'over' ? 'color-mix(in srgb, var(--color-rose) 6%, transparent)' : 'transparent';

  return (
    <div id={`budget-row-${row.key}`}
      className={`budget-grid rounded-xl transition-colors ${flash ? 'budget-row-flash' : ''} ${deleting ? 'opacity-50 pointer-events-none' : ''}`}
      style={{ background: selected ? 'color-mix(in srgb, var(--color-violet) 9%, transparent)' : tint, border: '1px solid transparent' }}>

      {/* Category */}
      <div className="a-cat flex items-center gap-2.5">
        <input type="checkbox" checked={selected} onChange={() => handlers.onToggleSelect(row.key)}
          aria-label={`Select ${row.name} for quick adjust`} className="w-3.5 h-3.5 shrink-0 cursor-pointer accent-[var(--color-violet)]" />
        <span className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
          style={{ background: `color-mix(in srgb, ${row.color} 20%, transparent)`, border: `1px solid color-mix(in srgb, ${row.color} 35%, transparent)` }}>
          <span aria-hidden="true">{row.icon || '📁'}</span>
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold truncate" title={row.name}>{row.name}</p>
          <p className="text-[10.5px] truncate flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
            {row.modified ? (
              <span style={{ color: 'var(--color-violet)' }} className="font-semibold">Edited · was {formatMoney(row.originalCents)}</span>
            ) : attention ? (
              <span className="font-semibold" style={{ color: sc }}>{atLimit ? 'At limit' : STATUS_LABEL[row.status]}</span>
            ) : (
              <span>{row.isFixed ? 'Fixed' : 'Flexible'}</span>
            )}
            {row.sourceMonth && row.budgetId && !row.modified && (
              <span title={`Carried over from ${monthLabel(row.sourceMonth)}`}>· from {monthLabel(row.sourceMonth)}</span>
            )}
          </p>
        </div>
      </div>

      {/* Budget input */}
      <div className="a-amt">
        <MobileLabel>Budget</MobileLabel>
        <BudgetAmountInput rowKey={row.key} name={row.name} cents={row.budgetCents} step={scale.step} dispatch={handlers.dispatch} />
      </div>

      {/* Slider */}
      <div className="a-sld">
        <BudgetSlider rowKey={row.key} name={row.name} cents={row.budgetCents} originalCents={row.originalCents}
          spentCents={row.spentCents} max={scale.max} step={scale.step} dispatch={handlers.dispatch} />
      </div>

      {/* Spent */}
      <div className="a-spent budget-num">
        <MobileLabel>Spent</MobileLabel>
        <p className="text-[13px] font-semibold tabular-nums" style={{ color: row.status === 'over' ? 'var(--color-rose)' : 'var(--color-text-primary)' }}>
          {formatMoney(row.spentCents)}
        </p>
      </div>

      {/* Remaining */}
      <div className="a-left budget-num">
        <MobileLabel>Left</MobileLabel>
        <p className="text-[13px] font-semibold tabular-nums" style={{ color: row.remainingCents < 0 ? 'var(--color-rose)' : row.remainingCents === 0 ? 'var(--color-text-secondary)' : 'var(--color-green)' }}>
          {formatMoney(row.remainingCents)}
        </p>
      </div>

      {/* Usage */}
      <div className="a-usage">
        <MobileLabel>Usage</MobileLabel>
        <BudgetUsageIndicator usagePct={row.usagePct} status={row.status} />
      </div>

      {/* Trend */}
      <div className="a-trend">
        <TrendSparkline values={row.trendCents} labels={trendLabels} />
      </div>

      {/* Actions */}
      <div className="a-act">
        <RowMenu row={row} expanded={expanded} handlers={handlers} />
      </div>
    </div>
  );
}

function sameRow(a: DerivedRow, b: DerivedRow) {
  return a.key === b.key && a.budgetCents === b.budgetCents && a.originalCents === b.originalCents
    && a.spentCents === b.spentCents && a.status === b.status && a.trendCents === b.trendCents
    && a.name === b.name && a.icon === b.icon && a.color === b.color && a.isFixed === b.isFixed
    && a.sourceMonth === b.sourceMonth && a.budgetId === b.budgetId;
}

/* Only the row being edited re-renders while a slider moves. Handlers are stable. */
export default memo(CategoryBudgetRow, (p, n) =>
  sameRow(p.row, n.row) && p.selected === n.selected && p.expanded === n.expanded && p.flash === n.flash
  && p.deleting === n.deleting && p.trendLabels === n.trendLabels && p.dispatch === n.dispatch
  && p.onToggleSelect === n.onToggleSelect && p.onToggleExpand === n.onToggleExpand
  && p.onEditDetails === n.onEditDetails && p.onDelete === n.onDelete);
