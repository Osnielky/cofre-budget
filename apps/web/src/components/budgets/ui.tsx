'use client';

import { useEffect, useRef, useState } from 'react';

/* ── Stroke icons (24×24) ── */
const PATHS = {
  wallet:   'M21 12V7H5a2 2 0 0 1 0-4h14v4 M3 5v14a2 2 0 0 0 2 2h16v-5 M18 12a2 2 0 0 0 0 4h4v-4Z',
  target:   'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  receipt:  'M4 2v20l3-2 3 2 2-2 2 2 3-2 3 2V2l-3 2-3-2-2 2-2-2-3 2Z M8 8h8 M8 12h8 M8 16h5',
  savings:  'M22 7l-8.5 8.5-5-5L2 17 M16 7h6v6',
  chart:    'M3 3v18h18 M7 16v-5 M12 16V8 M17 16v-9',
  pie:      'M21.2 15.9A10 10 0 1 1 8 2.8 M22 12A10 10 0 0 0 12 2v10Z',
  sliders:  'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  search:   'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z M21 21l-4.3-4.3',
  minus:    'M5 12h14',
  plus:     'M12 5v14 M5 12h14',
  dots:     'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z M12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z M12 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  undo:     'M3 7v6h6 M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13',
  reset:    'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5',
  alert:    'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z M12 9v4 M12 17h.01',
  check:    'M20 6 9 17l-5-5',
  heart:    'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z',
  layers:   'M12 2 2 7l10 5 10-5-10-5Z M2 17l10 5 10-5 M2 12l10 5 10-5',
  list:     'M4 6h16 M4 12h16 M4 18h16',
  calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  chevL:    'm15 18-6-6 6-6',
  chevR:    'm9 18 6-6-6-6',
  chevD:    'm6 9 6 6 6-6',
  x:        'M18 6 6 18 M6 6l12 12',
  edit:     'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  trash:    'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  eye:      'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  income:   'M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, strokeWidth = 1.8, className }: { name: IconName; size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}

export const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

/** Rounded tinted square holding an icon — the visual anchor of each section. */
export function IconBadge({ name, color, size = 'md' }: { name: IconName; color: string; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl';
  return (
    <span className={`${box} flex items-center justify-center shrink-0`}
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`, color }}>
      <Icon name={name} size={size === 'sm' ? 15 : 18} />
    </span>
  );
}

export function SectionCard({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`rounded-2xl p-4 sm:p-5 min-w-0 ${className}`} style={glass}>{children}</section>;
}

export function SectionTitle({ icon, color, title, subtitle, right }: {
  icon: IconName; color: string; title: string; subtitle?: string; right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <IconBadge name={icon} color={color} size="sm" />
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold leading-tight">{title}</h2>
          {subtitle && <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/** Pill-group toggle (filters, chart modes, percentages). */
export function Segmented<T extends string>({ value, options, onChange, ariaLabel, size = 'sm' }: {
  value: T; options: readonly { value: T; label: string; count?: number }[]; onChange: (v: T) => void; ariaLabel: string; size?: 'sm' | 'xs';
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1 p-1 rounded-xl"
      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={`${size === 'xs' ? 'px-2 py-1 text-[10.5px]' : 'px-2.5 py-1 text-[11px]'} rounded-lg font-semibold transition-colors flex items-center gap-1 cursor-pointer`}
            style={on
              ? { background: 'var(--color-primary)', color: '#fff' }
              : { color: 'var(--color-text-muted)' }}>
            {o.label}
            {o.count != null && (
              <span className="tabular-nums text-[10px] px-1 rounded" style={{ background: on ? 'rgba(255,255,255,0.18)' : 'var(--color-border)' }}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Returns a class that briefly pulses whenever `value` changes after mount. */
export function useFlash(value: unknown): string {
  const prev = useRef(value);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (prev.current !== value) { prev.current = value; setTick((t) => t + 1); }
  }, [value]);
  useEffect(() => {
    if (!tick) return;
    const t = setTimeout(() => setTick(0), 900);
    return () => clearTimeout(t);
  }, [tick]);
  return tick ? 'value-pulse' : '';
}

export function statusColor(status: 'over' | 'near' | 'ok' | 'unbudgeted' | 'idle'): string {
  switch (status) {
    case 'over': return 'var(--color-rose)';
    case 'near': return 'var(--color-amber)';
    case 'ok': return 'var(--color-green)';
    case 'unbudgeted': return 'var(--color-orange)';
    case 'idle': return 'var(--color-text-muted)';
  }
}

export const STATUS_LABEL = {
  over: 'Over budget', near: 'Near limit', ok: 'On track', unbudgeted: 'Unbudgeted', idle: 'No activity',
} as const;
