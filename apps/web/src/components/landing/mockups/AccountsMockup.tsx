const ACCOUNTS = [
  { name: 'Everyday Checking', mask: '4821', balance: '$3,248.17', accent: 'var(--color-card-green)', when: '1 min ago' },
  { name: 'High-Yield Savings', mask: '0937', balance: '$12,560.00', accent: 'var(--color-card-sky)', when: '1 min ago' },
  { name: 'Rewards Credit Card', mask: '1174', balance: '−$684.32', accent: 'var(--color-card-orange)', when: '1 min ago' },
  { name: 'Brokerage', mask: '5560', balance: '$23,410.00', accent: 'var(--color-card-violet)', when: 'manual' },
];

export default function AccountsMockup({ className = '' }: { className?: string }) {
  return (
    <figure aria-label="Four accounts, three synced a minute ago and one entered manually" className={`landing-mock w-full max-w-md p-4 sm:p-5 ${className}`}>
      <div aria-hidden="true">
        {/* Header keeps its right side empty: the net-worth chip floats there on the landing page. */}
        <div className="flex items-center gap-1.5 text-xs mb-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-card-green)' }} />
          Accounts
        </div>
        <ul className="flex flex-col gap-2">
          {ACCOUNTS.map((a) => (
            <li key={a.mask} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm" style={{ background: 'var(--color-elevated)', borderLeft: `3px solid ${a.accent}` }}>
              <span className="min-w-0">
                <span className="block truncate" style={{ color: 'var(--color-text-primary)' }}>{a.name}</span>
                <span className="block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>•••• {a.mask}</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{a.balance}</span>
                <span className="block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{a.when}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
