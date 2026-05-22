'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Logo from './Logo';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const NAV = [
  { label: 'Dashboard',    href: '/dashboard' },
  { label: 'Transactions', href: '/transactions' },
  { label: 'Budgets',      href: '/budgets' },
  { label: 'Projects',     href: '/projects' },
  { label: 'Reports',      href: '/reports' },
];

const BOTTOM_NAV = [
  { label: 'Settings', href: '/settings' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [user, setUser] = useState<{ name?: string; email: string } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((u) => { if (u) setUser(u); });
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
    router.push('/login');
  }

  const displayName = user?.name || user?.email?.split('@')[0] || '…';
  const initials    = displayName.slice(0, 2).toUpperCase();

  const linkStyle = (href: string) => ({
    color: pathname === href ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    background: pathname === href ? 'rgba(155,109,255,0.15)' : 'transparent',
    border: pathname === href ? '1px solid rgba(155,109,255,0.25)' : '1px solid transparent',
  });

  return (
    <aside
      className="w-52 shrink-0 flex flex-col gap-5 p-5"
      style={{
        background: 'rgba(25, 25, 38, 0.65)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* ── Brand + user block ── */}
      <div className="flex flex-col gap-3">
        {/* Logo + app name */}
        <Link href="/dashboard" className="flex items-center gap-2.5 no-underline">
          <Logo size={28} />
          <div>
            <p className="font-black text-xs tracking-widest uppercase leading-none"
              style={{ color: 'var(--color-text-primary)' }}>Cofre</p>
            <p className="text-[9px] font-bold tracking-widest uppercase leading-none mt-0.5"
              style={{ color: 'rgba(155,109,255,0.7)' }}>Budget</p>
          </div>
        </Link>

        {/* User card */}
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {/* Avatar */}
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0"
            style={{ background: 'linear-gradient(135deg, #9B6DFF 0%, #E879A0 100%)', color: 'white' }}>
            {initials}
          </div>
          {/* Name + email */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate leading-tight"
              style={{ color: 'var(--color-text-primary)' }}>
              {displayName}
            </p>
            {user?.email && (
              <p className="text-[10px] truncate leading-tight"
                style={{ color: 'var(--color-text-muted)' }}>
                {user.email}
              </p>
            )}
          </div>
          {/* Logout button */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="Sign out"
            className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20 shrink-0 disabled:opacity-40"
            style={{ color: 'var(--color-text-muted)' }}>
            {loggingOut ? (
              <span className="text-[10px]">…</span>
            ) : (
              <SignOutIcon />
            )}
          </button>
        </div>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-3 py-2 text-sm font-medium rounded-xl transition-colors hover:text-white"
            style={linkStyle(item.href)}
          >{item.label}</Link>
        ))}
      </nav>

      <nav className="flex flex-col gap-1">
        {BOTTOM_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-3 py-2 text-sm font-medium rounded-xl transition-colors hover:text-white"
            style={linkStyle(item.href)}
          >{item.label}</Link>
        ))}
      </nav>
    </aside>
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
