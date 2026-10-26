import { glassCard } from '@/components/landing/landing-styles';

/** Glass panel the calculators put their inputs and results in. */
export function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-3xl p-5 sm:p-7 ${className}`} style={glassCard}>{children}</section>;
}

export function Stat({ label, value, sub, tone = 'default' }: { label: string; value: string; sub?: string; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? 'var(--color-green)' : tone === 'warn' ? 'var(--color-amber)' : tone === 'bad' ? 'var(--color-rose)' : 'var(--color-text-primary)';
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight" style={{ color }}>{value}</p>
      {sub && <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{sub}</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{children}</p>;
}

/** Plain-prose section under a tool: what the number means, written once. */
export function Explainer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="max-w-3xl">
      <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm sm:text-[15px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{children}</div>
    </section>
  );
}
