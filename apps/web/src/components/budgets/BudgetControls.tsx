'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import type { DraftAction } from '@/lib/budgets/draft';
import type { HealthStatus } from '@/lib/budgets/calculations';
import { formatMoney, parseMoneyInput, type Cents } from '@/lib/budgets/money';
import { Icon, statusColor } from './ui';

const display = (c: Cents) => (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── Currency input ──────────────────────────────────────────────────── */

interface AmountProps {
  rowKey: string; name: string; cents: Cents; step: Cents;
  dispatch: Dispatch<DraftAction>;
}

/**
 * Text stays exactly as typed while focused — no reformatting mid-keystroke.
 * Each valid keystroke updates the draft live; invalid text shows an inline
 * error and leaves the draft untouched. Blur formats; Escape reverts.
 */
export function BudgetAmountInput({ rowKey, name, cents, step, dispatch }: AmountProps) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => display(cents));
  const [error, setError] = useState<string | null>(null);
  const startCents = useRef(cents);
  const errId = `budget-err-${rowKey}`;

  useEffect(() => { if (!focused) setText(display(cents)); }, [cents, focused]);

  const set = (c: Cents) => dispatch({ type: 'set', key: rowKey, cents: c });
  const nudge = (dir: 1 | -1) => {
    dispatch({ type: 'checkpoint' });
    set(Math.max(0, cents + dir * step));
  };

  return (
    <div className="relative flex items-stretch rounded-xl overflow-visible"
      style={{ background: 'var(--color-elevated)', border: `1px solid ${error ? 'var(--color-rose)' : 'var(--color-border)'}` }}>
      <button type="button" onClick={() => nudge(-1)} disabled={cents <= 0} aria-label={`Decrease ${name} budget by ${formatMoney(step)}`}
        className="w-7 shrink-0 flex items-center justify-center rounded-l-xl hover:bg-[var(--color-surface)] disabled:opacity-30 cursor-pointer"
        style={{ color: 'var(--color-text-muted)' }}>
        <Icon name="minus" size={12} strokeWidth={2.4} />
      </button>
      <label className="flex-1 min-w-0 flex items-center gap-0.5 px-1">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>$</span>
        <input data-budget-input={rowKey} value={text} inputMode="decimal" autoComplete="off"
          aria-label={`${name} budget`} aria-invalid={!!error} aria-describedby={error ? errId : undefined}
          className="w-full min-w-0 bg-transparent outline-none text-[13px] font-semibold tabular-nums py-2 text-right"
          style={{ color: 'var(--color-text-primary)' }}
          onFocus={(e) => {
            setFocused(true);
            startCents.current = cents;
            dispatch({ type: 'checkpoint' });
            e.currentTarget.select();
          }}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            const r = parseMoneyInput(v);
            if (r.ok) { setError(null); set(r.cents); } else setError(r.error);
          }}
          onBlur={() => { setFocused(false); setError(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            else if (e.key === 'Escape') { set(startCents.current); setError(null); setText(display(startCents.current)); e.currentTarget.blur(); }
            else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const next = Math.max(0, cents + (e.key === 'ArrowUp' ? step : -step));
              set(next); setText(display(next)); setError(null);
            }
          }} />
      </label>
      <button type="button" onClick={() => nudge(1)} aria-label={`Increase ${name} budget by ${formatMoney(step)}`}
        className="w-7 shrink-0 flex items-center justify-center rounded-r-xl hover:bg-[var(--color-surface)] cursor-pointer"
        style={{ color: 'var(--color-text-muted)' }}>
        <Icon name="plus" size={12} strokeWidth={2.4} />
      </button>
      {error && (
        <p id={errId} role="alert" className="absolute left-0 top-full mt-1 z-10 text-[10.5px] font-semibold px-2 py-1 rounded-md whitespace-nowrap"
          style={{ background: 'var(--popover-bg, var(--color-elevated))', color: 'var(--color-rose)', border: '1px solid color-mix(in srgb, var(--color-rose) 40%, transparent)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

/* ── Slider ──────────────────────────────────────────────────────────── */

interface SliderProps {
  rowKey: string; name: string; cents: Cents; originalCents: Cents; spentCents: Cents;
  max: Cents; step: Cents; dispatch: Dispatch<DraftAction>;
}

export function BudgetSlider({ rowKey, name, cents, originalCents, spentCents, max, step, dispatch }: SliderProps) {
  const [dragging, setDragging] = useState(false);
  const shown = Math.min(cents, max);
  const pct = (shown / max) * 100;
  const beyond = cents > max;
  const mark = (c: Cents) => `${Math.min(100, (c / max) * 100)}%`;

  return (
    <div className="relative w-full">
      {dragging && (
        <span className="absolute -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded-md text-[10.5px] font-bold tabular-nums pointer-events-none whitespace-nowrap z-10"
          style={{ left: `${pct}%`, background: 'var(--color-text-primary)', color: 'var(--color-base)' }}>
          {formatMoney(cents)}
        </span>
      )}
      {/* Spent marker: where the budget would exactly cover this month's spending. */}
      {spentCents > 0 && spentCents <= max && (
        <span aria-hidden="true" title={`Spent ${formatMoney(spentCents)}`}
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-full pointer-events-none"
          style={{ left: mark(spentCents), background: 'var(--color-orange)', opacity: 0.85 }} />
      )}
      {originalCents > 0 && originalCents !== cents && (
        <span aria-hidden="true" title={`Saved budget ${formatMoney(originalCents)}`}
          className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full pointer-events-none"
          style={{ left: `calc(${mark(originalCents)} - 3px)`, background: 'var(--color-text-secondary)' }} />
      )}
      <input type="range" className="budget-range relative" min={0} max={max} step={step} value={shown}
        style={{ ['--pct' as string]: `${pct}%` }}
        aria-label={`${name} budget slider`} aria-valuetext={formatMoney(cents)}
        onChange={(e) => dispatch({ type: 'set', key: rowKey, cents: Number(e.target.value) })}
        onFocus={() => dispatch({ type: 'checkpoint' })}
        onPointerDown={() => { dispatch({ type: 'checkpoint' }); setDragging(true); }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onBlur={() => setDragging(false)} />
      {beyond && (
        <span className="absolute right-0 -bottom-3 text-[9.5px] font-semibold" style={{ color: 'var(--color-violet)' }}>
          above slider range
        </span>
      )}
    </div>
  );
}

/* ── Usage ───────────────────────────────────────────────────────────── */

export function BudgetUsageIndicator({ usagePct, status }: { usagePct: number | null; status: HealthStatus }) {
  const color = statusColor(status);
  if (usagePct == null) {
    return status === 'unbudgeted'
      ? <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}>Unbudgeted</span>
      : <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>—</span>;
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden min-w-8" style={{ background: 'color-mix(in srgb, var(--color-text-muted) 18%, transparent)' }}
        role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usagePct)} aria-label="Budget used">
        <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.min(100, usagePct)}%`, background: color }} />
      </div>
      <span className="text-[11.5px] font-bold tabular-nums shrink-0 w-11 text-right" style={{ color }}>
        {usagePct >= 1000 ? '999+' : Math.round(usagePct)}%
      </span>
    </div>
  );
}

/* ── 6-month trend ───────────────────────────────────────────────────── */

export function TrendSparkline({ values, labels }: { values: Cents[]; labels: string[] }) {
  if (values.length < 2 || values.every((v) => v === 0)) {
    return <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>No history</span>;
  }
  const W = 64, H = 22;
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - ((v - min) / range) * (H - 6)] as const);
  const last = values[values.length - 1];
  const avgPrev = values.slice(0, -1).reduce((s, v) => s + v, 0) / (values.length - 1);
  const color = last > avgPrev * 1.1 ? 'var(--color-orange)' : 'var(--color-green)';
  const title = values.map((v, i) => `${labels[i]}: ${formatMoney(v)}`).join('\n');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`6-month spending trend. ${title}`}>
      <title>{title}</title>
      <polyline points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke={color}
        strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill={color} />
    </svg>
  );
}
