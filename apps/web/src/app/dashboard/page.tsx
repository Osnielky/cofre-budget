import type React from 'react';
import Logo from '@/components/Logo';

export default function DashboardPage() {
  const glass = {
    background: 'rgba(35, 35, 47, 0.50)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
  } as React.CSSProperties;

  const glassDeep = {
    ...glass,
    background: 'rgba(25, 25, 38, 0.65)',
    boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
  } as React.CSSProperties;

  return (
    <div className="flex h-dvh overflow-hidden">

      {/* Sidebar */}
      <aside
        className="w-52 shrink-0 flex flex-col gap-6 p-5"
        style={{ ...glassDeep, borderRight: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderRadius: 0, boxShadow: 'none' }}
      >
        <div className="flex items-center gap-3">
          <Logo size={32} />
          <span className="font-bold text-sm tracking-tight">Cofre</span>
        </div>

        <nav className="flex flex-col gap-1">
          {['Dashboard', 'Transactions', 'Budgets', 'Goals', 'Reports'].map((item, i) => (
            <a
              key={item} href="#"
              className="px-3 py-2 text-sm font-medium rounded-xl transition-colors hover:text-white"
              style={{
                color: i === 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                background: i === 0 ? 'rgba(155,109,255,0.15)' : 'transparent',
                border: i === 0 ? '1px solid rgba(155,109,255,0.25)' : '1px solid transparent',
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
            { label: 'BALANCE',  value: '$0.00', sub: 'Current balance', accent: '#9B6DFF' },
            { label: 'INCOME',   value: '$0.00', sub: 'This month',       accent: '#4FBF7F' },
            { label: 'EXPENSES', value: '$0.00', sub: 'This month',       accent: '#F07A3E' },
            { label: 'SAVINGS',  value: '0%',    sub: 'Savings rate',     accent: '#F5C842' },
            { label: 'BUDGET',   value: '$0.00', sub: 'Remaining',        accent: '#4BA8D8' },
          ].map((c) => (
            <div
              key={c.label}
              className="p-5 flex flex-col gap-1 relative overflow-hidden"
              style={{
                background: `rgba(${hexToRgb(c.accent)}, 0.12)`,
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: `1px solid rgba(${hexToRgb(c.accent)}, 0.25)`,
                boxShadow: `0 4px 24px rgba(${hexToRgb(c.accent)}, 0.10)`,
                borderRadius: 'var(--radius-card)',
              }}
            >
              {/* Glow orb */}
              <div
                className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none"
                style={{ background: c.accent, opacity: 0.12, filter: 'blur(20px)' }}
              />
              <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: c.accent, opacity: 0.8 }}>{c.label}</span>
              <span className="text-4xl font-extrabold text-white leading-none mt-1">{c.value}</span>
              <span className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{c.sub}</span>
            </div>
          ))}
        </div>

        {/* Recent transactions */}
        <div
          className="p-5 flex flex-col gap-4"
          style={{ ...glass, borderRadius: 'var(--radius-card)' }}
        >
          <p className="font-semibold">Recent Transactions</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No transactions yet.</p>
        </div>
      </main>
    </div>
  );
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
