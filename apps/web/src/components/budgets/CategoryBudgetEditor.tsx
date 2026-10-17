'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Transaction } from '@/lib/dashboard/types';
import { inCashFlow } from '@/lib/dashboard/derive';
import { filterRows, sortRows, type DerivedRow, type HealthCounts, type RowFilter, type RowSort } from '@/lib/budgets/calculations';
import { formatMoney, toCents } from '@/lib/budgets/money';
import CategoryBudgetRow, { type RowHandlers } from './CategoryBudgetRow';
import { Icon, SectionCard, SectionTitle, Segmented } from './ui';

const SORTS: { value: RowSort; label: string }[] = [
  { value: 'risk', label: 'Highest risk' },
  { value: 'spent', label: 'Highest spending' },
  { value: 'budget', label: 'Largest budget' },
  { value: 'remaining', label: 'Least remaining' },
  { value: 'name', label: 'Alphabetical' },
];

interface Props extends RowHandlers {
  rows: DerivedRow[];
  health: HealthCounts;
  monthTxs: Transaction[];
  trendLabels: string[];
  selected: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
  flashKey: string | null;
  deletingKey: string | null;
  /** Bumped by alerts so the row they point at is guaranteed to be visible. */
  revealKey: string | null;
  onSelectMany: (keys: string[], on: boolean) => void;
  emptyAction: React.ReactNode;
}

function CategoryTransactions({ txs, categoryId, name }: { txs: Transaction[]; categoryId: string | null; name: string }) {
  const list = txs.filter((t) => t.categoryRef?.id === categoryId && inCashFlow(t)).sort((a, b) => b.date.localeCompare(a.date));
  if (list.length === 0) {
    return <p className="text-xs px-4 py-4" style={{ color: 'var(--color-text-muted)' }}>No {name} transactions this month.</p>;
  }
  return (
    <ul className="max-h-60 overflow-y-auto">
      {list.map((t) => {
        const c = toCents(t.amount);
        return (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2 text-xs" style={{ borderTop: '1px solid var(--color-border)' }}>
            <span className="w-14 shrink-0 tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
              {new Date(`${t.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span className="flex-1 min-w-0 truncate font-medium">{t.name}</span>
            {t.bankAccount && <span className="hidden sm:inline truncate max-w-40" style={{ color: 'var(--color-text-muted)' }}>{t.bankAccount.accountName}</span>}
            <span className="font-bold tabular-nums shrink-0" style={{ color: c > 0 ? 'var(--color-green)' : 'var(--color-text-primary)' }}>
              {c > 0 ? '+' : '−'}{formatMoney(Math.abs(c))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function CategoryBudgetEditor(props: Props) {
  const { rows, health, monthTxs, trendLabels, selected, expanded, flashKey, deletingKey, revealKey, onSelectMany, emptyAction, ...handlers } = props;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RowFilter>('all');
  const [sort, setSort] = useState<RowSort>('risk');

  // The visible order is a snapshot taken when the filter/sort/search or the
  // set of rows changes — not on every draft edit — so a row never jumps away
  // or vanishes from a filter while its slider is being dragged.
  const rowKeys = rows.map((r) => r.key).join('|');
  const [snapshot, setSnapshot] = useState<string[]>(() => sortRows(filterRows(rows, filter, query), sort).map((r) => r.key));
  const [snapshotTick, setSnapshotTick] = useState(0);
  useEffect(() => {
    setSnapshot(sortRows(filterRows(rows, filter, query), sort).map((r) => r.key));
  }, [filter, sort, query, rowKeys, snapshotTick]);

  useEffect(() => {
    if (!revealKey) return;
    setFilter('all');
    setQuery('');
  }, [revealKey]);

  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);
  const visible = snapshot.map((k) => byKey.get(k)).filter((r): r is DerivedRow => !!r);
  const fresh = sortRows(filterRows(rows, filter, query), sort).map((r) => r.key).join('|');
  const stale = fresh !== snapshot.join('|');
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.key));

  const filters = [
    { value: 'all', label: 'All', count: rows.length },
    { value: 'over', label: 'Over', count: health.over },
    { value: 'near', label: 'Near limit', count: health.near },
    { value: 'ok', label: 'On track', count: health.ok + health.idle },
    { value: 'unbudgeted', label: 'Unbudgeted', count: health.unbudgeted },
  ] as const;

  return (
    <SectionCard className="flex flex-col gap-4">
      <SectionTitle icon="sliders" color="var(--color-violet)" title="Category Budgets"
        subtitle="Drag a slider or type an amount. Every total and chart updates instantly — nothing is saved until you choose Save changes." />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 min-w-48 max-w-xs"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
          <Icon name="search" size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search categories…" aria-label="Search categories"
            className="flex-1 min-w-0 bg-transparent outline-none text-xs" style={{ color: 'var(--color-text-primary)' }} />
        </label>
        <Segmented ariaLabel="Filter categories" value={filter} options={filters} onChange={setFilter} size="xs" />
        <label className="flex items-center gap-1.5 text-[11px] ml-auto" style={{ color: 'var(--color-text-muted)' }}>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as RowSort)} aria-label="Sort categories"
            className="px-2 py-1.5 rounded-lg text-[11px] font-semibold outline-none cursor-pointer"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {stale && visible.length > 0 && (
        <button type="button" onClick={() => setSnapshotTick((t) => t + 1)}
          className="self-start flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg cursor-pointer"
          style={{ color: 'var(--color-primary)', background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' }}>
          <Icon name="reset" size={12} /> Statuses changed — re-apply filter &amp; sort
        </button>
      )}

      {rows.length === 0 ? (
        <div className="py-12 flex flex-col items-center gap-3 text-center">
          <p className="font-semibold text-sm">No spending budgets this month</p>
          <p className="text-xs max-w-sm" style={{ color: 'var(--color-text-muted)' }}>Set monthly limits per category to start planning.</p>
          {emptyAction}
        </div>
      ) : (
        <div className="budget-list flex flex-col">
          {/* Column headers (table layout only) */}
          <div className="budget-grid budget-grid-head text-[10px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
            <div className="a-cat flex items-center gap-2.5">
              <input type="checkbox" checked={allSelected} aria-label="Select all visible categories"
                onChange={() => onSelectMany(visible.map((r) => r.key), !allSelected)}
                className="w-3.5 h-3.5 cursor-pointer accent-[var(--color-violet)]" />
              Category
            </div>
            <div className="a-amt">Budget</div>
            <div className="a-sld">Adjust</div>
            <div className="a-spent budget-num">Spent</div>
            <div className="a-left budget-num">Left</div>
            <div className="a-usage">Usage</div>
            <div className="a-trend">6-mo trend</div>
            <div className="a-act" />
          </div>

          {visible.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: 'var(--color-text-muted)' }}>No categories match.</p>
          ) : (
            <div className="budget-rows flex flex-col gap-0.5 pt-1.5">
              {visible.map((r) => (
                <div key={r.key}>
                  <CategoryBudgetRow row={r} trendLabels={trendLabels}
                    selected={selected.has(r.key)} expanded={expanded.has(r.key)}
                    flash={flashKey === r.key} deleting={deletingKey === r.key} {...handlers} />
                  {expanded.has(r.key) && (
                    <div className="mx-3 mb-2 rounded-xl overflow-hidden" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                      <CategoryTransactions txs={monthTxs} categoryId={r.categoryId} name={r.name} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
