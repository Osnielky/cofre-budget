'use client';

import type { ReactNode } from 'react';

export const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function fmtMoney(n: number, currency = 'usd'): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: currency.toUpperCase() });
}

/** A billing-page card: title row (with optional action) over its content. */
export function BillingCard({ title, action, className = '', children, style }: {
  title?: ReactNode; action?: ReactNode; className?: string; children: ReactNode; style?: React.CSSProperties;
}) {
  return (
    <section className={`rounded-2xl p-5 flex flex-col gap-4 min-w-0 ${className}`} style={{ ...glass, ...style }}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h3 className="text-[15px] font-bold" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const PATHS = {
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8Z',
  calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  xCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M15 9l-6 6 M9 9l6 6',
  check: 'M20 6 9 17l-5-5',
  pin: 'M12 22s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  card: 'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7Z M2 10h20',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z M14 2v6h6 M8 13h8 M8 17h6',
  download: 'M12 3v12 M7 10l5 5 5-5 M5 21h14',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3Z M9 12l2 2 4-4',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  chat: 'M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12Z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z M20 17v4H6.5A2.5 2.5 0 0 1 4 18.5',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z M7.5 7.5h.01',
  base: 'M3 10l9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z M9 21v-7h6v7',
  sync: 'M21 12a9 9 0 0 1-15.5 6.2L3 16 M3 12a9 9 0 0 1 15.5-6.2L21 8 M21 3v5h-5 M3 21v-5h5',
  bank: 'M3 10h18 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 21h18 M12 3l9 5H3l9-5Z',
  ai: 'M12 3l1.8 4.6L18 9.5l-4.2 1.9L12 16l-1.8-4.6L6 9.5l4.2-1.9L12 3Z M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Tinted square holding an icon, in a theme colour. */
export function IconChip({ name, color, size = 40 }: { name: IconName; color: string; size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-xl shrink-0"
      style={{ width: size, height: size, color, background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 32%, transparent)` }}>
      <Icon name={name} size={Math.round(size * 0.48)} />
    </span>
  );
}

export function Pill({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)` }}>
      {children}
    </span>
  );
}

export const outlineBtn: React.CSSProperties = {
  border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', background: 'var(--color-elevated)',
};
