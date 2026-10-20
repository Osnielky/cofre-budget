/** Small card that overlaps the accounts list, like Monarch's floating net-worth card. */
export default function NetWorthChip({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`landing-mock px-4 py-3 ${className}`}>
      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Net worth</p>
      <p className="text-lg font-bold tabular-nums leading-tight" style={{ color: 'var(--color-text-primary)' }}>$84,210.55</p>
      <p className="text-[11px] font-semibold" style={{ color: 'var(--color-card-green)' }}>Up $2,604 this month</p>
    </div>
  );
}
