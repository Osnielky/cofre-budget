import { glassCard, tint } from '../landing-styles';

const ROWS = [
  { label: 'Groceries', amount: 486, pct: 78, color: 'var(--color-card-green)' },
  { label: 'Dining & delivery', amount: 412, pct: 66, color: 'var(--color-card-orange)', flag: '38% over last month' },
  { label: 'Transport', amount: 198, pct: 32, color: 'var(--color-card-sky)' },
  { label: 'Subscriptions', amount: 87, pct: 14, color: 'var(--color-card-violet)', flag: '2 unused' },
];

export default function SpendingMockup({ className = '' }: { className?: string }) {
  return (
    <figure aria-label="Spending by category with dining and unused subscriptions flagged" className={`w-full max-w-md rounded-[var(--radius-card)] p-4 sm:p-5 ${className}`} style={glassCard}>
      <div aria-hidden="true" className="flex flex-col gap-3.5">
        <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>This month</span>
        {ROWS.map((r) => (
          <div key={r.label} className="text-sm">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="min-w-0 truncate" style={{ color: 'var(--color-text-primary)' }}>{r.label}</span>
              <span className="shrink-0 tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>${r.amount}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
              <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.color }} />
            </div>
            {r.flag && (
              <span className="inline-block mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: tint('var(--color-card-orange)', 16), color: 'var(--color-card-orange)' }}>
                {r.flag}
              </span>
            )}
          </div>
        ))}
      </div>
    </figure>
  );
}
