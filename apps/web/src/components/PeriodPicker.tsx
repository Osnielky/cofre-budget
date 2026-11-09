'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import DatePicker from './DatePicker';
import {
  PERIOD_PRESETS, PRESET_LABELS, SHORT_MONTHS, monthAllowed, monthKey, monthsOfYear, normalizePeriod,
  periodLabel, resolvePeriod, samePeriod, stepPeriod, thisMonth, type MonthBounds, type Period,
} from '@/lib/period';

/* The one period control (CLAUDE.md → components/PeriodPicker.tsx). Five pages
   used to draw their own: an uppercase pill, a stepper with a separate "Custom
   range" toggle, a calendar icon beside the month, a segmented strip of presets,
   a native <input type="month">. This is the same frame everywhere:

     ‹  [📅 November 2026 ⌄]  ›

   The arrows step the period (a month by a month, a range by its own length,
   never past today or the bounds). The label opens a popover: in `range` mode
   the relative presets (This month, Last month, 3M, 6M, YTD, 12M) and a custom
   range with two DatePickers, then the month grid; in `month` mode the grid
   alone. `max` defaults to the current month; pass `null` to allow the future
   (Transactions, where a row can be dated ahead). Sits in PageHeader's
   `period` slot. The value and the stepping maths are in lib/period.ts. */

export default function PeriodPicker({
  value, onChange, mode = 'month', min = null, max, size = 'md', ariaLabel = 'Period', className = '',
}: {
  value: Period;
  onChange: (p: Period) => void;
  /** `month`: only months (Dashboard, Budgets, Ask Cofre). `range`: presets and custom ranges too. */
  mode?: 'month' | 'range';
  /** Earliest / latest month (YYYY-MM). `max` undefined = this month, `null` = unbounded. */
  min?: string | null;
  max?: string | null;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
}) {
  const now = new Date();
  const today = monthKey(now);
  const bounds: MonthBounds = { min, max: max === undefined ? today : max };
  const prev = stepPeriod(value, -1, now, bounds);
  const next = stepPeriod(value, 1, now, bounds);
  const label = periodLabel(value, now);

  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [year, setYear] = useState(() => Number((value.kind === 'month' ? value.month : today).slice(0, 4)));
  const [draft, setDraft] = useState({ from: '', to: '' });

  // Each opening starts from the value: the grid on its year, the custom dates on its range.
  useEffect(() => {
    if (!open) return;
    const r = resolvePeriod(value, now);
    setYear(Number(r.from.slice(0, 4)));
    setDraft(value.kind === 'custom' ? { from: value.from, to: value.to } : { from: r.from, to: r.to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (panelRef.current?.contains(t) || t.closest('[data-period-trigger]') || t.closest('[data-date-panel]')) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A nested DatePicker closes itself first; this one goes on the next Escape.
      if (document.querySelector('[data-date-panel]')) return;
      e.stopPropagation(); setOpen(false); triggerRef.current?.focus();
    };
    const onResize = () => setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const pos = useMemo(() => {
    if (!anchor) return null;
    const MARGIN = 12, GAP = 8, W = 352, H = mode === 'range' ? 480 : 250;
    const vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.min(W, vw - MARGIN * 2);
    const below = vh - anchor.bottom - GAP - MARGIN;
    const top = below >= H ? anchor.bottom + GAP
      : anchor.top - GAP - H >= MARGIN ? anchor.top - GAP - H
      : Math.max(MARGIN, (vh - H) / 2);
    return {
      width,
      top: Math.round(Math.min(top, Math.max(MARGIN, vh - H - MARGIN))),
      left: Math.round(Math.min(Math.max(MARGIN, anchor.left), vw - width - MARGIN)),
    };
  }, [anchor, mode]);

  const pick = (p: Period) => { onChange(normalizePeriod(p)); setOpen(false); triggerRef.current?.focus(); };

  const sm = size === 'sm';
  const arrow = `${sm ? 'w-7 h-7' : 'w-8 h-8'} rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors hover:bg-[var(--color-surface)] disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent`;
  const arrowStyle: CSSProperties = { color: 'var(--color-text-secondary)' };
  const chip = 'rounded-lg px-2.5 py-2 text-xs font-semibold cursor-pointer transition-colors hover:brightness-125 disabled:opacity-30 disabled:cursor-default disabled:hover:brightness-100';
  const chipStyle = (active: boolean): CSSProperties => ({
    background: active ? 'var(--color-primary)' : 'var(--color-elevated)',
    color: active ? '#FFFFFF' : 'var(--color-text-primary)',
  });
  const isThisMonth = value.kind === 'month' && value.month === today;
  const minYear = bounds.min ? Number(bounds.min.slice(0, 4)) : -Infinity;
  const maxYear = bounds.max ? Number(bounds.max.slice(0, 4)) : Infinity;
  const draftOk = !!draft.from && !!draft.to && draft.from <= draft.to;

  return (
    <div className={`inline-flex items-center gap-0.5 p-1 rounded-xl ${className}`}
      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
      <button type="button" onClick={() => prev && onChange(prev)} disabled={!prev} aria-label="Previous period" className={arrow} style={arrowStyle}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <button ref={triggerRef} type="button" data-period-trigger aria-haspopup="dialog" aria-expanded={open} aria-label={`${ariaLabel}: ${label}`}
        onClick={(e) => { setAnchor(e.currentTarget.getBoundingClientRect()); setOpen((o) => !o); }}
        className={`flex items-center justify-center gap-1.5 rounded-lg px-2 ${sm ? 'min-w-[8rem] py-1 text-xs' : 'min-w-[9.5rem] py-1.5 text-sm'} font-semibold whitespace-nowrap cursor-pointer transition-colors hover:bg-[var(--color-surface)]`}
        style={{ color: 'var(--color-text-primary)' }}>
        <svg width={sm ? 12 : 13} height={sm ? 12 : 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.7 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span>{label}</span>
        <svg width="8" height="8" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ opacity: 0.5 }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="button" onClick={() => next && onChange(next)} disabled={!next} aria-label="Next period" className={arrow} style={arrowStyle}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
      </button>

      {open && pos && createPortal(
        <div ref={panelRef} role="dialog" aria-label="Choose a period" data-period-panel className="rounded-2xl flex flex-col gap-3"
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9000,
            background: 'var(--popover-bg)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)', padding: 12,
          }}>
          {mode === 'range' && (
            <>
              <section aria-label="Quick ranges" className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => pick(thisMonth(now))} className={chip} style={chipStyle(isThisMonth)} aria-pressed={isThisMonth}>This month</button>
                {PERIOD_PRESETS.map((p) => {
                  const active = value.kind === 'preset' && value.preset === p;
                  return (
                    <button key={p} type="button" onClick={() => pick({ kind: 'preset', preset: p })} className={chip} style={chipStyle(active)} aria-pressed={active}>
                      {PRESET_LABELS[p]}
                    </button>
                  );
                })}
              </section>
              <section aria-label="Custom range" className="flex flex-col gap-1.5 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                <p className="text-fine font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--color-text-muted)' }}>Custom range</p>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                  <DatePicker value={draft.from} onChange={(from) => setDraft((d) => ({ ...d, from }))} ariaLabel="From date" placeholder="From" />
                  <span aria-hidden="true" style={{ color: 'var(--color-text-muted)' }}>→</span>
                  <DatePicker value={draft.to} onChange={(to) => setDraft((d) => ({ ...d, to }))} ariaLabel="To date" placeholder="To" />
                </div>
                <button type="button" disabled={!draftOk} onClick={() => pick({ kind: 'custom', from: draft.from, to: draft.to })}
                  className="btn-gold w-full py-2 rounded-lg text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                  Apply range
                </button>
              </section>
            </>
          )}

          <section aria-label="Pick a month" className={`flex flex-col gap-1.5 ${mode === 'range' ? 'pt-3' : ''}`} style={mode === 'range' ? { borderTop: '1px solid var(--color-border)' } : undefined}>
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setYear((y) => y - 1)} disabled={year - 1 < minYear} aria-label="Previous year" className={arrow} style={{ ...arrowStyle, background: 'var(--color-elevated)' }}>‹</button>
              <p className="text-sm font-bold tabular-nums">{year}</p>
              <button type="button" onClick={() => setYear((y) => y + 1)} disabled={year + 1 > maxYear} aria-label="Next year" className={arrow} style={{ ...arrowStyle, background: 'var(--color-elevated)' }}>›</button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {monthsOfYear(year).map((m, i) => {
                const active = samePeriod(value, { kind: 'month', month: m });
                const current = m === today;
                return (
                  <button key={m} type="button" disabled={!monthAllowed(m, bounds)} onClick={() => pick({ kind: 'month', month: m })}
                    aria-pressed={active} aria-current={current ? 'date' : undefined} className={chip}
                    style={{ ...chipStyle(active), border: `1px solid ${current && !active ? 'color-mix(in srgb, var(--color-primary) 55%, transparent)' : 'transparent'}` }}>
                    {SHORT_MONTHS[i]}
                  </button>
                );
              })}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
