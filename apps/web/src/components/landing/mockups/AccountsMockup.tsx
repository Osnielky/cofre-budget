import { glassCard } from '../landing-styles';

const ACCOUNTS = [
  { name: 'Everyday Checking', mask: '4821', balance: '$3,248.17', accent: 'var(--color-card-green)' },
  { name: 'High-Yield Savings', mask: '0937', balance: '$12,560.00', accent: 'var(--color-card-sky)' },
  { name: 'Rewards Credit Card', mask: '1174', balance: '−$684.32', accent: 'var(--color-card-orange)' },
];

export default function AccountsMockup({ className = '' }: { className?: string }) {
  return (
    <figure aria-label="Three bank accounts synced automatically two minutes ago" className={`w-full max-w-md rounded-[var(--radius-card)] p-4 sm:p-5 ${className}`} style={glassCard}>
      <div aria-hidden="true">
        <div className="flex items-center justify-between text-xs mb-3">
          <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Linked accounts</span>
          <span className="flex items-center gap-1.5" style={{ color: 'var(--color-card-green)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-card-green)' }} />
            Synced 2 min ago
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {ACCOUNTS.map((a) => (
            <li key={a.mask} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm" style={{ background: 'var(--color-elevated)', borderLeft: `3px solid ${a.accent}` }}>
              <span className="min-w-0 truncate" style={{ color: 'var(--color-text-primary)' }}>
                {a.name} <span style={{ color: 'var(--color-text-muted)' }}>••{a.mask}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{a.balance}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
