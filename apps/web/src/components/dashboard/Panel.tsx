'use client';

import { motion } from 'motion/react';
import { riseVariants } from '@/components/motion/stagger';

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

interface PanelProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  legend?: React.ReactNode;
  colSpan?: 1 | 2;
  loading?: boolean;
  children: React.ReactNode;
}

export default function Panel({ title, subtitle, legend, colSpan = 1, loading, children }: PanelProps) {
  /* The motion wrapper (rises in its turn inside the dashboard's <Stagger>) is a
     separate element from the glass card: the animation leaves an inline
     `transform` behind, which would override .card-lift's hover transform. */
  return (
    <motion.div variants={riseVariants} className={`min-w-0 flex flex-col [&>*]:flex-1 ${colSpan === 2 ? 'md:col-span-2' : ''}`}>
      <div className="card-lift flex flex-col gap-3 p-4 sm:p-6 rounded-2xl min-w-0" style={glass}>
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <p className="card-title">{title}</p>
            {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>}
          </div>
          {legend}
        </div>
        {loading
          ? <div className="flex-1 min-h-32 flex items-center justify-center text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
          : children}
      </div>
    </motion.div>
  );
}

/** Standard legend chip row for chart panels. */
export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex items-center gap-3 text-[10px] font-semibold flex-wrap" style={{ color: 'var(--color-text-secondary)' }}>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className={it.line ? 'w-4 h-0.5 rounded-full' : 'w-2.5 h-1.5 rounded-sm'} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Standard empty state used by every panel. */
export function PanelEmpty({ message }: { message: React.ReactNode }) {
  return (
    <div className="flex-1 min-h-32 flex items-center justify-center text-xs text-center px-4"
      style={{ color: 'var(--color-text-muted)' }}>
      {message}
    </div>
  );
}
