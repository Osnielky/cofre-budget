// The hero's "laptop": a compact dashboard with a net-worth line, three stat
// tiles and a budget strip. Fake data; chart colours are the app's identity set.
const NET_WORTH = 'M12 118 C 60 112, 96 104, 140 92 S 220 70, 262 56 S 330 30, 348 24';
const NET_AREA = `${NET_WORTH} L 348 130 L 12 130 Z`;

const STATS = [
  { label: 'Income', value: '$6,210', color: 'var(--color-card-green)' },
  { label: 'Expenses', value: '$2,443', color: 'var(--color-card-orange)' },
  { label: 'Saved', value: '$3,766', color: 'var(--color-card-violet)' },
];
const BUDGETS = [
  { label: 'Groceries', pct: 72, color: 'var(--color-card-green)' },
  { label: 'Dining', pct: 91, color: 'var(--color-card-orange)' },
  { label: 'Transport', pct: 40, color: 'var(--color-card-sky)' },
];

export default function DashboardMockup({ className = '' }: { className?: string }) {
  return (
    <figure aria-label="Cofre dashboard showing net worth rising to $84,210, this month's income, expenses and savings, and three budgets" className={`landing-mock w-full max-w-xl p-4 sm:p-5 ${className}`}>
      <div aria-hidden="true" className="flex flex-col gap-4 text-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-primary)' }} />
            Dashboard
          </div>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
            October 2026
          </span>
        </div>

        <div className="rounded-xl p-3.5" style={{ background: 'var(--color-elevated)' }}>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Net worth</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>$84,210.55</p>
            </div>
            <span className="text-xs font-semibold" style={{ color: 'var(--color-card-green)' }}>Up 3.2% this month</span>
          </div>
          <svg viewBox="0 0 360 132" className="w-full h-auto mt-2">
            <defs>
              <linearGradient id="landing-nw" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-card-sky)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--color-card-sky)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[30, 60, 90].map((y) => <line key={y} x1="12" x2="348" y1={y} y2={y} stroke="var(--color-border)" />)}
            <path d={NET_AREA} fill="url(#landing-nw)" />
            <path d={NET_WORTH} fill="none" stroke="var(--color-card-sky)" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="348" cy="24" r="4.5" fill="var(--color-card-sky)" />
          </svg>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--color-elevated)', borderTop: `2px solid ${s.color}` }}>
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
              <p className="font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {BUDGETS.map((b) => (
            <div key={b.label} className="flex items-center gap-3 text-xs">
              <span className="w-20 shrink-0" style={{ color: 'var(--color-text-secondary)' }}>{b.label}</span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
                <div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: b.color }} />
              </div>
              <span className="w-9 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{b.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}
