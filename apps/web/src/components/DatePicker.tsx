'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function todayIso() {
  const n = new Date();
  return iso(n.getFullYear(), n.getMonth(), n.getDate());
}
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }

export function formatDisplay(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Pick a date';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Shown on the trigger before anything is chosen. */
  placeholder?: string;
  ariaLabel?: string;
}

/**
 * Date field with a calendar popover.
 *
 * Replaces `<input type="date">`, whose picker is a different size, language and
 * shape in every browser and cannot be themed. The popover is sized from the
 * viewport and clamped inside it, and the field itself stays keyboard-usable.
 */
export default function DatePicker({ value, onChange, placeholder = 'Pick a date', ariaLabel = 'Date' }: Props) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const initial = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayIso();
  const [view, setView] = useState(() => ({ y: Number(initial.slice(0, 4)), m: Number(initial.slice(5, 7)) - 1 }));

  // Re-centre the calendar when the value changes underneath us (e.g. a form reset).
  useEffect(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setView({ y: Number(value.slice(0, 4)), m: Number(value.slice(5, 7)) - 1 });
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (panelRef.current?.contains(t) || t.closest('[data-date-trigger]')) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    const onScroll = (e: Event) => {
      const t = e.target as Node;
      if (panelRef.current && (panelRef.current === t || panelRef.current.contains(t))) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', () => setOpen(false));
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const pos = useMemo(() => {
    if (!anchor) return null;
    const MARGIN = 12, GAP = 8, W = 300, H = 348;
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
  }, [anchor]);

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay();
    const total = daysInMonth(view.y, view.m);
    const out: (number | null)[] = Array(first).fill(null);
    for (let d = 1; d <= total; d++) out.push(d);
    return out;
  }, [view]);

  const step = (delta: number) => setView((v) => {
    const m = v.m + delta;
    if (m < 0) return { y: v.y - 1, m: 11 };
    if (m > 11) return { y: v.y + 1, m: 0 };
    return { y: v.y, m };
  });

  const today = todayIso();

  return (
    <>
      <button type="button" data-date-trigger aria-label={ariaLabel}
        onClick={(e) => { setAnchor(e.currentTarget.getBoundingClientRect()); setOpen((o) => !o); }}
        className="w-full px-3 py-2.5 text-sm flex items-center gap-2.5 rounded-xl outline-none text-left"
        style={{
          background: 'var(--color-elevated)', border: '1px solid var(--color-border)',
          color: value ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
        }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ opacity: 0.7 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span className="flex-1 truncate">{value ? formatDisplay(value) : placeholder}</span>
        <svg width="8" height="8" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4 }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div ref={panelRef} className="rounded-2xl cat-picker"
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 10000,
            background: 'var(--popover-bg)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)',
            padding: 12,
          }}>
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => step(-1)} aria-label="Previous month"
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:brightness-125"
              style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>‹</button>
            <p className="text-sm font-bold">{MONTHS[view.m]} {view.y}</p>
            <button type="button" onClick={() => step(1)} aria-label="Next month"
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:brightness-125"
              style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>›</button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {DOW.map((d, i) => (
              <span key={i} className="h-6 flex items-center justify-center text-[10px] font-bold"
                style={{ color: 'var(--color-text-muted)' }}>{d}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <span key={`e${i}`} />;
              const day = iso(view.y, view.m, d);
              const selected = day === value;
              const isToday = day === today;
              return (
                <button key={day} type="button"
                  onClick={() => { onChange(day); setOpen(false); }}
                  aria-label={formatDisplay(day)} aria-current={isToday ? 'date' : undefined}
                  className="h-9 rounded-lg text-xs font-semibold tabular-nums transition-colors hover:brightness-125"
                  style={{
                    background: selected ? 'var(--color-primary)' : 'var(--color-elevated)',
                    color: selected ? '#FFFFFF' : 'var(--color-text-primary)',
                    border: `1px solid ${isToday && !selected ? 'color-mix(in srgb, var(--color-primary) 55%, transparent)' : 'transparent'}`,
                  }}>
                  {d}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--color-border)' }}>
            <button type="button" onClick={() => { onChange(today); setOpen(false); }}
              className="flex-1 py-2 rounded-lg text-xs font-semibold hover:brightness-125"
              style={{ background: 'var(--color-elevated)', color: 'var(--color-primary)' }}>Today</button>
            <button type="button" onClick={() => setOpen(false)}
              className="px-3 py-2 rounded-lg text-xs font-semibold hover:brightness-125"
              style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)' }}>Close</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
