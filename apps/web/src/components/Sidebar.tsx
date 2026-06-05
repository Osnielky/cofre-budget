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
    await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
    router.push('/login');
  }

  const displayName = user?.name || user?.email?.split('@')[0] || '…';
  const initials    = displayName.slice(0, 2).toUpperCase();

  return (
    <aside className="w-56 shrink-0 flex flex-col" style={{
      background: 'var(--color-surface)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      borderRight: '1px solid var(--color-border)',
    }}>

      {/* ── Logo ── */}
      <div className="px-5 pt-6 pb-4">
        <Link href="/dashboard" className="flex items-center gap-3 no-underline group">
          <Logo size={52} />
          <div>
            <p className="font-black text-sm tracking-widest uppercase leading-none"
              style={{ color: 'var(--color-text-primary)' }}>Cofre</p>
            <p className="text-[9px] font-bold tracking-widest uppercase leading-none mt-0.5"
              style={{ color: 'var(--color-primary)', opacity: 0.6 }}>Budget</p>
          </div>
        </Link>
      </div>

      {/* ── Nav ── */}
      <nav className="flex flex-col gap-0.5 px-3 flex-1 pt-2">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative"
              style={{
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                background: active ? 'var(--nav-active-bg)' : 'transparent',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(128,128,128,0.08)'; }}
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
      <div className="px-3 pb-2">
        {(() => {
          const active = pathname === '/settings';
          return (
            <Link href="/settings"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                background: active ? 'var(--nav-active-bg)' : 'transparent',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(128,128,128,0.08)'; }}
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
          style={{ background: 'linear-gradient(135deg, #9B6DFF 0%, #E879A0 100%)', color: 'white' }}>
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}

function TransactionsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16V4m0 0L3 8m4-4 4 4"/><path d="M17 8v12m0 0 4-4m-4 4-4-4"/>
    </svg>
  );
}

function BudgetsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 2a10 10 0 0 1 10 10"/>
    </svg>
  );
}

function ProjectsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
