'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Logo from './Logo';
import Avatar from './Avatar';
import { useUser } from './UserProvider';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const NAV = [
  { label: 'Dashboard',    href: '/dashboard',    icon: DashboardIcon },
  { label: 'Goals',        href: '/goals',        icon: GoalsIcon },
  { label: 'Transactions', href: '/transactions', icon: TransactionsIcon },
  { label: 'Budgets',      href: '/budgets',      icon: BudgetsIcon },
  { label: 'Projects',     href: '/projects',     icon: ProjectsIcon },
  { label: 'Debts',        href: '/debts',        icon: DebtsIcon },
];

export default function Sidebar() {
  const pathname   = usePathname();
  const router     = useRouter();
  const { user } = useUser();
  const [loggingOut, setLoggingOut] = useState(false);
  const [open, setOpen] = useState(false);

  /* Close the mobile drawer whenever the route changes. */
  useEffect(() => { setOpen(false); }, [pathname]);

  /* Lock body scroll while the mobile drawer is open. */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

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

  return (
    <>
    {/* ── Mobile top bar (hidden on md+) ── */}
    <div className="md:hidden fixed top-0 inset-x-0 h-14 z-30 flex items-center gap-3 px-4" style={{
      background: 'var(--color-surface)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <button onClick={() => setOpen(true)} aria-label="Open menu"
        className="w-9 h-9 -ml-1 rounded-lg flex items-center justify-center transition-colors"
        style={{ color: 'var(--color-text-secondary)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-elevated)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
        <MenuIcon />
      </button>
      <Link href="/dashboard" className="flex items-center gap-2 no-underline">
        <span className="flex items-center" style={{ color: 'var(--color-primary)' }}>
          <Logo size={22} className="block" />
        </span>
        <span className="brand-name text-base" style={{ color: 'var(--color-text-primary)' }}>Cofre</span>
      </Link>
    </div>

    {/* ── Backdrop ── */}
    {open && (
      <div onClick={() => setOpen(false)} aria-hidden
        className="md:hidden fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} />
    )}

    <aside className={`w-64 shrink-0 flex flex-col fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-out md:static md:z-auto md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`} style={{
      background: 'var(--color-surface)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      borderRight: '1px solid var(--color-border)',
    }}>

      {/* Close button — mobile only */}
      <button onClick={() => setOpen(false)} aria-label="Close menu"
        className="md:hidden absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center transition-colors z-10"
        style={{ color: 'var(--color-text-muted)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-elevated)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
        <CloseIcon />
      </button>

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
        <Avatar name={user?.name} email={user?.email} src={user?.avatarUrl} size={32} rounded={12} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold truncate leading-tight" style={{ color: 'var(--color-text-primary)' }}>
              {displayName}
            </p>
            {user && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                style={user.plan !== 'free'
                  ? { background: 'color-mix(in srgb, var(--color-primary) 16%, transparent)', color: 'var(--color-primary)' }
                  : { background: 'color-mix(in srgb, var(--color-text-muted) 16%, transparent)', color: 'var(--color-text-muted)' }}>
                {user.plan === 'elite' ? 'Elite' : user.plan === 'pro' ? 'Pro' : 'Basic'}
              </span>
            )}
          </div>
          {user?.email && (
            <p className="text-[10px] truncate leading-tight" style={{ color: 'var(--color-text-muted)' }}>
              {user.email}
            </p>
          )}
          {user && user.plan === 'free' && (
            <Link href="/settings?tab=billing" className="text-[10px] font-semibold leading-tight hover:underline"
              style={{ color: 'var(--color-primary)' }}>
              Upgrade to Pro
            </Link>
          )}
          {user && user.plan === 'pro' && (
            <Link href="/settings?tab=billing" className="text-[10px] font-semibold leading-tight hover:underline"
              style={{ color: 'var(--color-primary)' }}>
              Upgrade to Elite
            </Link>
          )}
        </div>
        <button onClick={handleLogout} disabled={loggingOut} title="Sign out"
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20 shrink-0 disabled:opacity-40"
          style={{ color: 'var(--color-text-muted)' }}>
          {loggingOut ? <span className="text-[10px]">…</span> : <SignOutIcon />}
        </button>
      </div>

    </aside>
    </>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>
    </svg>
  );
}

function GoalsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
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

function DebtsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  );
}

function ReceiptsIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
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
