'use client';

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

interface PanelProps {
  title: string;
  subtitle?: string;
  legend?: React.ReactNode;
  colSpan?: 1 | 2;
  loading?: boolean;
  children: React.ReactNode;
}

export default function Panel({ title, subtitle, legend, colSpan = 1, loading, children }: PanelProps) {
  return (
    <div className={`flex flex-col gap-3 p-5 rounded-2xl min-w-0 ${colSpan === 2 ? 'xl:col-span-2' : ''}`} style={glass}>
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
export function PanelEmpty({ message }: { message: string }) {
  return (
    <div className="flex-1 min-h-32 flex items-center justify-center text-xs text-center px-4"
      style={{ color: 'var(--color-text-muted)' }}>
      {message}
    </div>
  );
}
