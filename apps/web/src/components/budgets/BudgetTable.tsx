'use client';

import { useState } from 'react';
import { deriveBudget, monthTotals, riskCounts } from '@/lib/budgets/derive';
import type { CategoryTrendPoint, RiskGroup, UnbudgetedSlice } from '@/lib/budgets/derive';
import type { BudgetWithSpent, Transaction } from '@/lib/budgets/types';
import BudgetRow, { GRID_CLASSES } from './BudgetRow';

function fmt(n: number) { return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }

export type SortKey = 'risk' | 'amount' | 'name';

interface BudgetTableProps {
  spending: BudgetWithSpent[];
  unbudgeted: UnbudgetedSlice[];
  month: string; now: Date;
  sort: SortKey; onSortChange: (s: SortKey) => void;
  expandedId: string | null; onToggleExpand: (id: string) => void;
  txsByCategory: Map<string, Transaction[]>;
  trendByCategory: Map<string, CategoryTrendPoint[]>;
  categoryAverages: Record<string, number>;
  onEdit: (b: BudgetWithSpent) => void;
  onDelete: (id: string) => void;
  onRaise: (b: BudgetWithSpent, newAmount: number) => void;
  deletingId: string | null;
  onSetUnbudgeted: (categoryId: string) => void;
}

const GROUP_LABEL: Record<RiskGroup, string> = { over: 'Over budget', near: 'Near limit', ontrack: 'On track' };
const GROUP_COLOR: Record<RiskGroup, string> = { over: 'var(--color-rose)', near: 'var(--color-amber)', ontrack: 'var(--color-green)' };

export default function BudgetTable({
  spending, unbudgeted, month, now, sort, onSortChange, expandedId, onToggleExpand,
  txsByCategory, trendByCategory, categoryAverages, onEdit, onDelete, onRaise, deletingId, onSetUnbudgeted,
}: BudgetTableProps) {
  const [query, setQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskGroup | 'all'>('all');

  const counts = riskCounts(spending, month, now);
  const totals = monthTotals(spending, month, now);
  const monthLabel = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1)
    .toLocaleString('default', { month: 'long', year: 'numeric' });

  const FILTERS: { key: RiskGroup | 'all'; label: string; color: string; n: number }[] = [
    { key: 'all', label: 'All', color: 'var(--color-card-violet)', n: spending.length },
    { key: 'over', label: 'Over', color: GROUP_COLOR.over, n: counts.over },
    { key: 'near', label: 'Near limit', color: GROUP_COLOR.near, n: counts.near },
    { key: 'ontrack', label: 'On track', color: GROUP_COLOR.ontrack, n: counts.ontrack },
  ];

  const q = query.trim().toLowerCase();
  const matches = (b: BudgetWithSpent) =>
    (!q || (b.category?.name ?? '').toLowerCase().includes(q))
    && (riskFilter === 'all' || deriveBudget(b, month, now).riskGroup === riskFilter);
  const visible = spending.filter(matches);
  const visibleUnbudgeted = unbudgeted.filter((u) =>
    (!q || u.category.name.toLowerCase().includes(q)) && riskFilter === 'all');
  const unbudgetedTotal = +unbudgeted.reduce((s, u) => s + u.total, 0).toFixed(2);
  const combinedSpent = +(totals.totalSpent + unbudgetedTotal).toFixed(2);
  const combinedRemaining = +(totals.totalBudget - combinedSpent).toFixed(2);

  function sortRows(rows: BudgetWithSpent[]): BudgetWithSpent[] {
    if (sort === 'amount') return [...rows].sort((a, b) => Number(b.amount) - Number(a.amount));
    if (sort === 'name') return [...rows].sort((a, b) => (a.category?.name ?? '').localeCompare(b.category?.name ?? ''));
    return [...rows].sort((a, b) => b.percentage - a.percentage);
  }

  const groups: { key: RiskGroup; rows: BudgetWithSpent[] }[] = sort === 'risk'
    ? (['over', 'near', 'ontrack'] as RiskGroup[]).map((key) => ({
        key, rows: sortRows(visible.filter((b) => deriveBudget(b, month, now).riskGroup === key)),
      })).filter((g) => g.rows.length > 0)
    : [{ key: 'ontrack', rows: sortRows(visible) }];

  const renderRow = (b: BudgetWithSpent) => (
    <BudgetRow key={b.id} budget={b} month={month} now={now}
      txs={txsByCategory.get(b.categoryId ?? '') ?? []}
      trend={trendByCategory.get(b.categoryId ?? '') ?? []}
      avg3mo={b.categoryId ? categoryAverages[b.categoryId] : undefined}
      isExpanded={expandedId === b.id} onToggle={() => onToggleExpand(b.id)}
      onEdit={() => onEdit(b)} onDelete={() => onDelete(b.id)} onRaise={(amt) => onRaise(b, amt)}
      deleting={deletingId === b.id} />
  );

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col"
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>

      {/* Header */}
      <div className="flex flex-col gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div>
          <p className="text-base font-bold">Category budgets</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Manage your spending limits for {monthLabel}.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }}>
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search categories…" aria-label="Search categories"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl outline-none"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
          </div>

          {/* Risk filters, each showing how many fall in that bucket */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTERS.map(({ key, label, color, n }) => {
              const on = riskFilter === key;
              return (
                <button key={key} type="button" onClick={() => setRiskFilter(key)}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5"
                  style={{
                    background: on ? `color-mix(in srgb, ${color} 18%, transparent)` : 'var(--color-elevated)',
                    border: `1px solid ${on ? `color-mix(in srgb, ${color} 45%, transparent)` : 'var(--color-border)'}`,
                    color: on ? color : 'var(--color-text-muted)',
                  }}>
                  {label}
                  <span className="tabular-nums" style={{ opacity: 0.75 }}>{n}</span>
                </button>
              );
            })}
          </div>

          <select value={sort} onChange={(e) => onSortChange(e.target.value as SortKey)}
            aria-label="Sort budgets"
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold outline-none"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            <option value="risk">Sort: Highest risk</option>
            <option value="amount">Sort: Largest budget</option>
            <option value="name">Sort: A–Z</option>
          </select>
        </div>
      </div>

      {/* Column header row — desktop only */}
      <div className={`hidden md:grid items-center gap-2 px-3 py-2 text-[9.5px] font-bold uppercase tracking-wider ${GRID_CLASSES}`}
        style={{ background: 'var(--color-elevated)', color: 'var(--color-text-muted)' }}>
        <span>Category</span>
        <span className="text-right">Budget</span>
        <span className="text-right">Spent</span>
        <span className="text-right">Left</span>
        <span className="hidden xl:block text-right">Per day</span>
        <span>Usage</span>
        <span className="text-right">Projected</span>
        <span className="hidden xl:block">6-month trend</span>
        <span />
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-1 p-2 overflow-y-auto" style={{ maxHeight: 560 }}>
        {spending.length === 0 && unbudgeted.length === 0 ? (
          <p className="text-xs text-center py-10" style={{ color: 'var(--color-text-muted)' }}>No budgets yet — add one to start tracking spending.</p>
        ) : visible.length === 0 && visibleUnbudgeted.length === 0 ? (
          <p className="text-xs text-center py-10" style={{ color: 'var(--color-text-muted)' }}>
            No budgets match {q ? <>“{query}”</> : 'this filter'}.
          </p>
        ) : (
          <>
            {groups.map((g) => (
              <div key={g.key} className="flex flex-col gap-1">
                {sort === 'risk' && (
                  <p className="text-[9.5px] font-bold uppercase tracking-widest px-2 pt-2" style={{ color: GROUP_COLOR[g.key] }}>
                    {GROUP_LABEL[g.key]}
                  </p>
                )}
                {g.rows.map(renderRow)}
              </div>
            ))}

            {visibleUnbudgeted.map((u) => (
              <div key={u.categoryId} className={`grid items-center gap-2 px-3 py-2.5 rounded-xl ${GRID_CLASSES}`}
                style={{ background: 'color-mix(in srgb, var(--color-amber) 4%, transparent)', border: '1px dashed var(--color-border)' }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0" style={{ background: `${u.category.color}20`, border: `1px solid ${u.category.color}30` }}>
                    {u.category.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate">{u.category.name}</p>
                    <p className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>no budget set · spending anyway</p>
                  </div>
                </div>
                <span className="text-[13px] text-right" style={{ color: 'var(--color-text-muted)' }}>—</span>
                <span className="text-[13px] font-semibold tabular-nums text-right" style={{ color: 'var(--color-amber)' }}>${fmt(u.total)}</span>
                <span className="text-[13px] text-right" style={{ color: 'var(--color-text-muted)' }}>—</span>
                <span className="hidden xl:block text-[12px] text-right" style={{ color: 'var(--color-text-muted)' }}>—</span>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)', backgroundImage: 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-amber) 25%, transparent) 0 4px, transparent 4px 8px)' }} />
                <span className="text-[12px] text-right" style={{ color: 'var(--color-text-muted)' }}>—</span>
                <span className="hidden xl:block" />
                <div className="flex justify-end">
                  <button type="button" onClick={() => onSetUnbudgeted(u.categoryId)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg hover:brightness-110 transition-all"
                    style={{ background: 'color-mix(in srgb, var(--color-amber) 16%, transparent)', color: 'var(--color-amber)', border: '1px solid color-mix(in srgb, var(--color-amber) 30%, transparent)' }}>
                    Set
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Sticky footer totals */}
      {(spending.length > 0 || unbudgeted.length > 0) && (
        <div className={`hidden md:grid items-center gap-2 px-3 py-3 ${GRID_CLASSES}`}
          style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-elevated)' }}>
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Total</span>
          <span className="text-[13px] font-bold tabular-nums text-right">${fmt(totals.totalBudget)}</span>
          <span className="text-[13px] font-bold tabular-nums text-right">${fmt(combinedSpent)}</span>
          <span className="text-[13px] font-bold tabular-nums text-right" style={{ color: combinedRemaining < 0 ? 'var(--color-rose)' : 'var(--color-green)' }}>
            ${fmt(combinedRemaining)}
          </span>
          <span className="hidden xl:block" />
          <span />
          <div className="text-right min-w-0">
            <p className="text-[12px] font-bold tabular-nums truncate" style={{ color: 'var(--color-rose)' }}>${fmt(totals.totalProjected)}</p>
            <p className="text-[9.5px] truncate" style={{ color: 'var(--color-text-muted)' }}>vs ${fmt(totals.totalBudget)} planned</p>
          </div>
          <span className="hidden xl:block" />
          <span />
        </div>
      )}
    </div>
  );
}
