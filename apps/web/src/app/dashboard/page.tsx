export default function DashboardPage() {
  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: 'var(--color-base)' }}>

      {/* Sidebar */}
      <aside className="w-52 shrink-0 flex flex-col gap-6 p-5" style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--color-card-violet)' }}>O</div>
          <span className="font-semibold text-sm">Osnielky</span>
        </div>
        <nav className="flex flex-col gap-1">
          {['Dashboard', 'Transactions', 'Budgets', 'Goals', 'Reports'].map((item, i) => (
            <a key={item} href="#"
              className="px-3 py-2 text-sm font-medium rounded-xl transition-colors hover:text-white"
              style={{
                color: i === 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                background: i === 0 ? 'var(--color-elevated)' : 'transparent',
              }}
            >{item}</a>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

        {/* Stat cards */}
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {[
            { label: 'BALANCE',   value: '$0.00',  sub: 'Current balance',    bg: 'var(--color-card-violet)' },
            { label: 'INCOME',    value: '$0.00',  sub: 'This month',         bg: 'var(--color-card-green)' },
            { label: 'EXPENSES',  value: '$0.00',  sub: 'This month',         bg: 'var(--color-card-orange)' },
            { label: 'SAVINGS',   value: '0%',     sub: 'Savings rate',       bg: 'var(--color-card-amber)' },
            { label: 'BUDGET',    value: '$0.00',  sub: 'Remaining',          bg: 'var(--color-card-sky)' },
          ].map((c) => (
            <div key={c.label} className="p-5 flex flex-col gap-1" style={{ background: c.bg, borderRadius: 'var(--radius-card)' }}>
              <span className="text-[10px] font-bold tracking-widest text-white/70 uppercase">{c.label}</span>
              <span className="text-4xl font-extrabold text-white leading-none mt-1">{c.value}</span>
              <span className="text-xs text-white/70 mt-1">{c.sub}</span>
            </div>
          ))}
        </div>

        {/* Recent transactions placeholder */}
        <div className="p-5 flex flex-col gap-4" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-card)' }}>
          <p className="font-semibold">Recent Transactions</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No transactions yet.</p>
        </div>
      </main>
    </div>
  );
}
