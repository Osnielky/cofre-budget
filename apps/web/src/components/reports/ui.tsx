'use client';

/* Small shared pieces for the Reports page: money formatting, delta chips,
   the glass card, a sparkline and an empty state. Theme variables only. */

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { riseVariants } from '@/components/motion/stagger';
import { StretchTabs } from '@/components/ui/StretchTabs';

export const money = (n: number, cents = true) =>
  `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
export const compact = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(1)}M` : a >= 10_000 ? `${Math.round(a / 1000)}k` : a >= 1000 ? `${(a / 1000).toFixed(1)}k` : `${Math.round(a)}`;
  return `${n < 0 ? '−' : ''}$${s}`;
};

/** "↑ 12%" in green or rose; `inverse` = a rise is bad (spending). */
export function Delta({ value, inverse = false, points = false, className = '' }: { value: number | null; inverse?: boolean; points?: boolean; className?: string }) {
  if (value == null) return <span className={`text-fine font-semibold ${className}`} style={{ color: 'var(--color-text-muted)' }}>new</span>;
  if (Math.abs(value) < 0.5) return <span className={`text-fine font-semibold ${className}`} style={{ color: 'var(--color-text-muted)' }}>— flat</span>;
  const up = value > 0;
  const good = inverse ? !up : up;
  return (
    <span className={`inline-flex items-center gap-0.5 text-fine font-bold tabular-nums whitespace-nowrap shrink-0 ${className}`} style={{ color: good ? 'var(--color-green)' : 'var(--color-rose)' }}>
      {up ? '↑' : '↓'} {Math.abs(value).toFixed(points ? 1 : 0)}{points ? ' pts' : '%'}
    </span>
  );
}

export function Card({ title, subtitle, right, children, className = '', pad = true }: {
  title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean;
}) {
  /* A motion section so a Card inside a <Stagger> rises in its turn (variants propagate). */
  return (
    <motion.section variants={riseVariants} className={`rounded-2xl flex flex-col gap-3 min-w-0 ${pad ? 'p-4 sm:p-5' : ''} ${className}`}
      style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
      {(title || right) && (
        <div className={`flex items-start justify-between gap-3 flex-wrap ${pad ? '' : 'px-4 sm:px-5 pt-4 sm:pt-5'}`}>
          <div className="min-w-0">
            {title && <h2 className="text-[17px] sm:text-lg font-bold leading-tight" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>}
            {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </motion.section>
  );
}

export function Spark({ values, color, height = 28 }: { values: number[]; color: string; height?: number }) {
  if (values.length < 2) return null;
  const W = 100, H = height, pad = 3;
  const min = Math.min(...values, 0), max = Math.max(...values, 1);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - pad - ((v - min) / span) * (H - pad * 2)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>{text}</p>;
}

/** The Reports tab strips (main tabs, period presets, sort and group toggles) on the shared stretching pill. */
export function Segmented<T extends string>({ value, options, onChange, size = 'sm', ariaLabel }: {
  value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; size?: 'sm' | 'md'; ariaLabel?: string;
}) {
  return <StretchTabs items={options} value={value} onChange={onChange} size={size} role="group" ariaLabel={ariaLabel} />;
}
