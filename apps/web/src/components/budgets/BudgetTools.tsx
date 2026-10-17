'use client';

import { memo, useMemo, useState } from 'react';
import type { Dispatch } from 'react';
import type { DerivedRow, Plan } from '@/lib/budgets/calculations';
import { previewAdjust, currentValue, type DraftAction, type DraftState } from '@/lib/budgets/draft';
import { formatMoney, type Cents } from '@/lib/budgets/money';
import { Icon, SectionCard, SectionTitle, STATUS_LABEL, statusColor, useFlash } from './ui';

/* ── Quick Adjust ────────────────────────────────────────────────────── */

type Scope = 'all' | 'over' | 'selected' | 'discretionary';
const PCTS = [10, 20, -10, -20] as const;

function scopeKeys(rows: DerivedRow[], scope: Scope, selected: ReadonlySet<string>): string[] {
  switch (scope) {
    case 'all': return rows.map((r) => r.key);
    case 'over': return rows.filter((r) => r.status === 'over').map((r) => r.key);
    case 'selected': return rows.filter((r) => selected.has(r.key)).map((r) => r.key);
    case 'discretionary': return rows.filter((r) => !r.isFixed).map((r) => r.key);
  }
}

interface QuickAdjustProps {
  rows: DerivedRow[]; draft: DraftState; dispatch: Dispatch<DraftAction>;
  selected: ReadonlySet<string>; canUndo: boolean; modifiedCount: number;
}

export const BudgetQuickAdjust = memo(function BudgetQuickAdjust({ rows, draft, dispatch, selected, canUndo, modifiedCount }: QuickAdjustProps) {
  const [pct, setPct] = useState<number>(10);
  const [scope, setScope] = useState<Scope>('all');
  const keys = useMemo(() => scopeKeys(rows, scope, selected), [rows, scope, selected]);
  // Same function the reducer uses, so the preview is exactly what gets applied.
  const diff = useMemo(() => {
    const next = previewAdjust(draft, pct, keys);
    return keys.reduce((s, k) => s + ((next[k] ?? draft.originals[k] ?? 0) - currentValue(draft, k)), 0);
  }, [draft, pct, keys]);
  const affected = keys.filter((k) => currentValue(draft, k) > 0).length;

  const btn = 'flex-1 min-w-0 px-2 py-2 rounded-lg text-xs font-bold tabular-nums transition-colors cursor-pointer';
  return (
    <SectionCard className="flex flex-col gap-3">
      <SectionTitle icon="sliders" color="var(--color-amber)" title="Quick Adjust" subtitle="Scale several budgets at once in your draft." />
      <div className="flex gap-1.5" role="radiogroup" aria-label="Adjustment percentage">
        {PCTS.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={pct === p} onClick={() => setPct(p)} className={btn}
            style={pct === p
              ? { background: 'color-mix(in srgb, var(--color-violet) 22%, transparent)', border: '1px solid var(--color-violet)', color: 'var(--color-text-primary)' }
              : { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            {p > 0 ? '+' : '−'}{Math.abs(p)}%
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        Apply to
        <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}
          className="px-2.5 py-2 rounded-lg text-xs font-semibold outline-none cursor-pointer"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
          <option value="all">All categories</option>
          <option value="over">Only over-budget categories</option>
          <option value="selected">Only selected categories ({selected.size})</option>
          <option value="discretionary">Only flexible (non-fixed) categories</option>
        </select>
      </label>
      <p className="text-[11px] leading-snug" style={{ color: 'var(--color-text-secondary)' }} aria-live="polite">
        {affected === 0
          ? (scope === 'selected' ? 'Tick categories in the table to select them.' : 'No budgets in this scope.')
          : <>Changes {affected} budget{affected === 1 ? '' : 's'} by <strong className="tabular-nums" style={{ color: diff > 0 ? 'var(--color-rose)' : 'var(--color-green)' }}>{formatMoney(diff, { sign: true })}</strong>; applied on top of your current edits.</>}
      </p>
      <button type="button" disabled={diff === 0} onClick={() => dispatch({ type: 'adjust', pct, keys })}
        className="w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-40 cursor-pointer disabled:cursor-default"
        style={{ background: 'var(--color-violet)' }}>
        Apply to draft
      </button>
      <div className="flex gap-1.5">
        <button type="button" disabled={!canUndo} onClick={() => dispatch({ type: 'undo' })}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold disabled:opacity-40 cursor-pointer disabled:cursor-default hover:bg-[var(--color-elevated)]"
          style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
          <Icon name="undo" size={13} /> Undo last change
        </button>
        <button type="button" disabled={modifiedCount === 0} onClick={() => dispatch({ type: 'resetAll' })}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold disabled:opacity-40 cursor-pointer disabled:cursor-default hover:bg-[var(--color-elevated)]"
          style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
          <Icon name="reset" size={13} /> Reset draft
        </button>
      </div>
    </SectionCard>
  );
});

/* ── Savings Impact ──────────────────────────────────────────────────── */

function Bar({ label, cents, max, color }: { label: string; cents: Cents; max: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px]">
        <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
        <span className="font-bold tabular-nums" style={{ color: cents < 0 ? 'var(--color-rose)' : 'var(--color-text-primary)' }}>{formatMoney(cents)}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--color-text-muted) 16%, transparent)' }}>
        <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${max > 0 ? Math.max(0, (cents / max) * 100) : 0}%`, background: color }} />
      </div>
    </div>
  );
}

export const BudgetSavingsImpact = memo(function BudgetSavingsImpact({ plan }: { plan: Plan }) {
  const orig = plan.originalPlannedSavingsCents, next = plan.plannedSavingsCents, diff = plan.savingsImpactCents;
  const flash = useFlash(diff);
  const max = Math.max(orig, next, 1);
  const tone = diff > 0 ? 'var(--color-green)' : diff < 0 ? 'var(--color-rose)' : 'var(--color-text-secondary)';
  return (
    <SectionCard className="flex flex-col gap-3">
      <SectionTitle icon="savings" color="var(--color-sky)" title="Savings Impact" subtitle="Saved plan vs. your draft." />
      {plan.expectedIncomeCents === 0 ? (
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Add an income target to see planned savings.</p>
      ) : (
        <>
          <Bar label="Saved plan" cents={orig} max={max} color="var(--color-text-muted)" />
          <Bar label="Draft plan" cents={next} max={max} color="var(--color-sky)" />
          <div className="flex items-center justify-between pt-2 text-xs" style={{ borderTop: '1px solid var(--color-border)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Difference</span>
            <span className={`font-bold tabular-nums ${flash}`} style={{ color: tone }} aria-live="polite">
              {formatMoney(diff, { sign: true })}
              {plan.savingsChangePct != null && diff !== 0 && <span className="ml-1 font-semibold">({plan.savingsChangePct > 0 ? '+' : ''}{plan.savingsChangePct}%)</span>}
            </span>
          </div>
        </>
      )}
      <dl className="grid grid-cols-2 gap-2 text-[10.5px]">
        <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--color-elevated)' }}>
          <dt style={{ color: 'var(--color-text-muted)' }} title="Expected income minus run-rate projected spending">Projected savings</dt>
          <dd className="text-xs font-bold tabular-nums mt-0.5" style={{ color: plan.expectedIncomeCents === 0 ? 'var(--color-text-muted)' : plan.projectedSavingsCents < 0 ? 'var(--color-rose)' : 'var(--color-text-primary)' }}>
            {plan.expectedIncomeCents === 0 ? '—' : formatMoney(plan.projectedSavingsCents)}
          </dd>
        </div>
        <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--color-elevated)' }}>
          <dt style={{ color: 'var(--color-text-muted)' }} title="Income received minus expenses paid so far this month">Actual cash flow</dt>
          <dd className="text-xs font-bold tabular-nums mt-0.5" style={{ color: plan.actualCashFlowCents < 0 ? 'var(--color-rose)' : 'var(--color-green)' }}>{formatMoney(plan.actualCashFlowCents)}</dd>
        </div>
      </dl>
    </SectionCard>
  );
});

/* ── Budget Health + alerts ──────────────────────────────────────────── */

export const BudgetHealth = memo(function BudgetHealth({ plan, uncategorizedCents, onReveal }: {
  plan: Plan; uncategorizedCents: Cents; onReveal: (key: string) => void;
}) {
  const h = plan.health;
  const tracked = plan.rows.length;
  const onTrack = h.ok + h.idle;
  const score = tracked > 0 ? Math.round((onTrack / tracked) * 100) : 0;
  const tiles = [
    { n: onTrack, label: 'On track', color: 'var(--color-green)' },
    { n: h.near, label: 'Near limit', color: 'var(--color-amber)' },
    { n: h.over, label: 'Over budget', color: 'var(--color-rose)' },
    { n: h.unbudgeted, label: 'No budget', color: 'var(--color-orange)' },
  ];
  const alerts = plan.attention.slice(0, 8);
  return (
    <SectionCard className="flex flex-col gap-3">
      <SectionTitle icon="heart" color="var(--color-green)" title="Budget Health" subtitle={`${onTrack} of ${tracked} categories on track`} />
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--color-text-muted) 16%, transparent)' }}>
          <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${score}%`, background: 'var(--color-green)' }} />
        </div>
        <span className="text-[11px] font-bold tabular-nums">{score}%</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl px-2 py-2 min-w-0"
            style={{ border: `1px solid color-mix(in srgb, ${t.color} 35%, transparent)`, background: `color-mix(in srgb, ${t.color} 8%, transparent)` }}>
            <p className="text-lg font-extrabold leading-none tabular-nums" style={{ color: t.color }}>{t.n}</p>
            <p className="text-[9.5px] mt-1 leading-tight" style={{ color: 'var(--color-text-secondary)' }}>{t.label}</p>
          </div>
        ))}
      </div>

      {alerts.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
            <Icon name="alert" size={12} /> Needs attention
          </p>
          <ul className="flex flex-col gap-1" aria-live="polite">
            {alerts.map((r) => {
              const c = statusColor(r.status);
              const detail = r.status === 'unbudgeted'
                ? `${formatMoney(r.spentCents)} spent, no budget`
                : r.remainingCents < 0 ? `${formatMoney(-r.remainingCents)} over` : `${formatMoney(r.remainingCents)} left`;
              return (
                <li key={r.key}>
                  <button type="button" onClick={() => onReveal(r.key)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--color-elevated)] cursor-pointer"
                    title={`${STATUS_LABEL[r.status]} — jump to ${r.name}`}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
                    <span className="text-xs font-medium truncate flex-1">{r.name}</span>
                    <span className="text-[10.5px] font-semibold tabular-nums shrink-0" style={{ color: c }}>{detail}</span>
                    <Icon name="chevR" size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
          {plan.attention.length > alerts.length && (
            <p className="text-[10.5px] px-2.5" style={{ color: 'var(--color-text-muted)' }}>+{plan.attention.length - alerts.length} more — filter the table to see all.</p>
          )}
        </div>
      )}
      {uncategorizedCents > 0 && (
        <p className="text-[10.5px] leading-snug rounded-lg px-2.5 py-2" style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>
          {formatMoney(uncategorizedCents)} of this month’s spending is uncategorized — it counts toward Total Spent but no budget.
        </p>
      )}
    </SectionCard>
  );
});
