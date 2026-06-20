'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Logo from './Logo';
import { useUser } from './UserProvider';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const NAV = [
  { label: 'Dashboard',    href: '/dashboard',    icon: DashboardIcon },
  { label: 'Transactions', href: '/transactions', icon: TransactionsIcon },
  { label: 'Budgets',      href: '/budgets',      icon: BudgetsIcon },
  { label: 'Projects',     href: '/projects',     icon: ProjectsIcon },
];

export default function Sidebar() {
  const pathname   = usePathname();
  const router     = useRouter();
  const { user } = useUser();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      // Network error or API down — log out client-side anyway.
    } finally {
      router.push('/login');
      setLoggingOut(false);
    }
  }

  const displayName = user?.name || user?.email?.split('@')[0] || '…';
  const initials    = displayName.slice(0, 2).toUpperCase();

  return (
    <aside className="w-64 shrink-0 flex flex-col" style={{
      background: 'var(--color-surface)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      borderRight: '1px solid var(--color-border)',
    }}>

      {/* ── Brand ── */}
      <div className="px-6 pt-7 pb-6 mb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <Link href="/dashboard" className="flex items-center gap-3.5 no-underline">
          <span className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
            style={{
              color: 'var(--color-primary)',
              border: '1px solid color-mix(in srgb, var(--color-primary) 45%, transparent)',
              boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-primary) 10%, transparent)',
            }}>
            <Logo size={30} className="block" />
          </span>
          <div className="flex flex-col gap-1.5">
            <span className="brand-name" style={{ color: 'var(--color-text-primary)' }}>
              Cofre
            </span>
            <span className="text-[9.5px] uppercase leading-none"
              style={{ color: 'var(--color-text-muted)', letterSpacing: '0.32em' }}>
              Wealth &amp; Budget
            </span>
          </div>
        </Link>
      </div>

      {/* ── Nav ── */}
      <nav className="flex flex-col gap-1.5 px-4 flex-1 pt-2">
        <p className="text-[10.5px] font-semibold uppercase pl-3 mb-1.5 mt-1"
          style={{ color: 'var(--color-text-muted)', letterSpacing: '0.28em' }}>Overview</p>
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href}
              className="flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-[15px] transition-all group relative"
              style={{
                color: active ? 'var(--nav-active-fg, var(--color-text-primary))' : 'var(--color-text-secondary)',
                background: active ? 'var(--nav-active-bg)' : 'transparent',
                border: active ? 'var(--nav-active-border, 1px solid transparent)' : '1px solid transparent',
                letterSpacing: '0.03em',
                fontWeight: active ? 500 : 400,
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--color-elevated)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                  style={{ background: 'var(--nav-active-bar)' }} />
              )}
              <span style={{ color: active ? 'var(--nav-icon-active)' : 'var(--color-text-secondary)', transition: 'color .15s' }}>
                <Icon />
              </span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* ── Settings ── */}
      <div className="px-4 pb-2 flex flex-col gap-1.5">
        <p className="text-[10.5px] font-semibold uppercase pl-3 mb-1.5"
          style={{ color: 'var(--color-text-muted)', letterSpacing: '0.28em' }}>Account</p>
        {(() => {
          const active = pathname === '/settings';
          return (
            <Link href="/settings"
              className="flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-[15px] transition-all relative"
              style={{
                color: active ? 'var(--nav-active-fg, var(--color-text-primary))' : 'var(--color-text-secondary)',
                background: active ? 'var(--nav-active-bg)' : 'transparent',
                border: active ? 'var(--nav-active-border, 1px solid transparent)' : '1px solid transparent',
                letterSpacing: '0.03em',
                fontWeight: active ? 500 : 400,
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--color-elevated)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                  style={{ background: 'var(--nav-active-bar)' }} />
              )}
              <span style={{ color: active ? 'var(--nav-icon-active)' : 'var(--color-text-muted)' }}><SettingsIcon /></span>
              Settings
            </Link>
          );
        })()}
      </div>

      {/* ── User block ── */}
      <div className="mx-3 mb-4 p-3 rounded-2xl flex items-center gap-2.5"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-violet) 100%)', color: '#fff' }}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate leading-tight" style={{ color: 'var(--color-text-primary)' }}>
            {displayName}
          </p>
          {user?.email && (
            <p className="text-[10px] truncate leading-tight" style={{ color: 'var(--color-text-muted)' }}>
              {user.email}
            </p>
          )}
        </div>
        <button onClick={handleLogout} disabled={loggingOut} title="Sign out"
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20 shrink-0 disabled:opacity-40"
          style={{ color: 'var(--color-text-muted)' }}>
          {loggingOut ? <span className="text-[10px]">…</span> : <SignOutIcon />}
        </button>
      </div>

    </aside>
  );
}

function DashboardIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>
    </svg>
  );
}

function TransactionsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M3 12h18M3 18h12"/>
    </svg>
  );
}

function BudgetsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
    </svg>
  );
}

function ProjectsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V5M9.3 19V9m5.4 10v-7M20 19V7"/>
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}
