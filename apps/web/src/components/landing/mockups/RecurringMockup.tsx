const ITEMS = [
  { name: 'Rent', cadence: 'Every month', amount: '$1,650.00', due: 'in 12 days', color: 'var(--color-card-violet)' },
  { name: 'Netflix', cadence: 'Every month', amount: '$15.49', due: 'in 3 days', color: 'var(--color-card-orange)' },
  { name: 'Spotify', cadence: 'Every month', amount: '$11.99', due: 'in 6 days', color: 'var(--color-card-green)' },
  { name: 'Gym', cadence: 'Every month', amount: '$39.00', due: 'in 18 days', color: 'var(--color-card-sky)' },
];

export default function RecurringMockup({ className = '' }: { className?: string }) {
  return (
    <figure aria-label="Recurring charges Cofre found, with the amount still due this month" className={`landing-mock w-full max-w-sm p-4 sm:p-5 ${className}`}>
      <div aria-hidden="true" className="text-sm">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Recurring</p>
            <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>$1,716.48 <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>due this month</span></p>
          </div>
          <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>4 found</span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {ITEMS.map((i) => (
            <li key={i.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'var(--color-elevated)' }}>
              <span className="w-7 h-7 rounded-lg shrink-0" style={{ background: `color-mix(in srgb, ${i.color} 22%, transparent)`, borderLeft: `3px solid ${i.color}` }} />
              <span className="flex-1 min-w-0">
                <span className="block truncate" style={{ color: 'var(--color-text-primary)' }}>{i.name}</span>
                <span className="block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{i.cadence}</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{i.amount}</span>
                <span className="block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{i.due}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
