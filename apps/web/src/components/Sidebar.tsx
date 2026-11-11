'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import Logo from './Logo';
import Avatar from './Avatar';
import { useUser } from './UserProvider';
import { useLogout } from '@/hooks/useLogout';
import { NAV_GROUPS, isNavActive } from '@/lib/nav';
import { NAV_ICONS, AdminIcon, LifeBuoyIcon, SettingsIcon, SignOutIcon } from './NavIcons';

/* Loaded on first click only: the modal pulls in html-to-image, which no other page needs. */
const ReportProblemModal = dynamic(() => import('./support/ReportProblemModal'), { ssr: false });

/* The sidebar, from md up. Two widths: a 76px icon rail on tablets (md–lg) so
   content keeps most of the screen, and the full 256px column from lg. Labels,
   section headings and the user block's text only render at lg; the rail shows
   icons with title tooltips and a hairline between the groups. Below md the
   shell shows PhoneTopBar and PhoneTabBar instead (app/(app)/layout.tsx).

   The pages come from lib/nav.ts (Overview · Money · Wealth); NavIcons draws them. */
export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { logout, loggingOut } = useLogout();
  const [reporting, setReporting] = useState(false);

  const displayName = user?.name || user?.email?.split('@')[0] || '…';

  const rowCls = 'flex items-center justify-center lg:justify-start gap-3.5 px-0 lg:px-3.5 py-2 rounded-xl text-[15px] transition-all relative';
  const rowStyle = (active: boolean) => ({
    color: active ? 'var(--nav-active-fg, var(--color-text-primary))' : 'var(--color-text-secondary)',
    background: active ? 'var(--nav-active-bg)' : 'transparent',
    border: active ? 'var(--nav-active-border, 1px solid transparent)' : '1px solid transparent',
    letterSpacing: '0.03em',
    fontWeight: active ? 500 : 400,
  });
  const hoverOn = (active: boolean) => (e: React.MouseEvent<HTMLElement>) => { if (!active) e.currentTarget.style.background = 'var(--color-elevated)'; };
  const hoverOff = (active: boolean) => (e: React.MouseEvent<HTMLElement>) => { if (!active) e.currentTarget.style.background = 'transparent'; };
  const bar = (
    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full" style={{ background: 'var(--nav-active-bar)' }} />
  );

  return (
    <aside className="hidden md:flex w-[76px] lg:w-64 shrink-0 flex-col" style={{
      background: 'var(--color-surface)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      borderRight: '1px solid var(--color-border)',
    }}>

      {/* ── Brand ── */}
      <div className="px-0 lg:px-6 pt-5 pb-3 mb-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <Link href="/dashboard" className="flex items-center justify-center lg:justify-start gap-3.5 no-underline" title="Cofre">
          <span className="w-11 h-11 lg:w-14 lg:h-14 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
            style={{
              color: 'var(--color-primary)',
              border: '1px solid color-mix(in srgb, var(--color-primary) 45%, transparent)',
              boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-primary) 10%, transparent)',
            }}>
            <Logo size={30} className="block scale-[0.8] lg:scale-100" />
          </span>
          <div className="hidden lg:flex flex-col gap-1.5">
            <span className="brand-name" style={{ color: 'var(--color-text-primary)' }}>
              Cofre
            </span>
            <span className="text-fine uppercase leading-none whitespace-nowrap"
              style={{ color: 'var(--color-text-muted)', letterSpacing: '0.18em' }}>
              Wealth &amp; Budget
            </span>
          </div>
        </Link>
      </div>

      {/* ── Nav: three groups by job. Headings at lg; the rail separates the groups
          with a hairline. Scrolls on its own when a short window cannot hold every row. ── */}
      <nav className="flex flex-col px-2.5 lg:px-4 flex-1 min-h-0 overflow-y-auto pt-1" aria-label="Pages">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.id} className="flex flex-col gap-1" role="group" aria-labelledby={`nav-group-${group.id}`}>
            <p id={`nav-group-${group.id}`} className={`hidden lg:block text-fine font-semibold uppercase pl-3 mb-1 ${gi === 0 ? 'mt-1' : 'mt-2.5'}`}
              style={{ color: 'var(--color-text-muted)', letterSpacing: '0.28em' }}>{group.label}</p>
            {gi > 0 && (
              <span aria-hidden="true" className="block lg:hidden h-px mx-3 my-2" style={{ background: 'var(--color-border)' }} />
            )}
            {group.items.map(({ label, href, icon }) => {
              const Icon = NAV_ICONS[icon];
              const active = isNavActive(pathname, href);
              return (
                <Link key={href} href={href} title={label} aria-current={active ? 'page' : undefined}
                  className={`${rowCls} group`} style={rowStyle(active)} onMouseEnter={hoverOn(active)} onMouseLeave={hoverOff(active)}>
                  {active && bar}
                  <span style={{ color: active ? 'var(--nav-icon-active)' : 'var(--color-text-secondary)', transition: 'color .15s' }}>
                    <Icon />
                  </span>
                  <span className="hidden lg:inline">{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Account ── */}
      <div className="px-2.5 lg:px-4 pb-2 pt-1 flex flex-col gap-1 shrink-0">
        <p className="hidden lg:block text-fine font-semibold uppercase pl-3 mb-1"
          style={{ color: 'var(--color-text-muted)', letterSpacing: '0.28em' }}>Account</p>
        {user?.isAdmin && (() => {
          const active = isNavActive(pathname, '/admin');
          return (
            <Link href="/admin" title="Admin" aria-current={active ? 'page' : undefined}
              className={rowCls} style={rowStyle(active)} onMouseEnter={hoverOn(active)} onMouseLeave={hoverOff(active)}>
              {active && bar}
              <span style={{ color: active ? 'var(--nav-icon-active)' : 'var(--color-text-muted)' }}><AdminIcon /></span>
              <span className="hidden lg:inline">Admin</span>
            </Link>
          );
        })()}
        <button type="button" onClick={() => setReporting(true)} title="Report a problem"
          className={`w-full ${rowCls} cursor-pointer`} style={rowStyle(false)} onMouseEnter={hoverOn(false)} onMouseLeave={hoverOff(false)}>
          <span style={{ color: 'var(--color-text-muted)' }}><LifeBuoyIcon /></span>
          <span className="hidden lg:inline">Report a problem</span>
        </button>
        {reporting && <ReportProblemModal onClose={() => setReporting(false)} />}
        {(() => {
          const active = isNavActive(pathname, '/settings');
          return (
            <Link href="/settings" title="Settings" aria-current={active ? 'page' : undefined}
              className={rowCls} style={rowStyle(active)} onMouseEnter={hoverOn(active)} onMouseLeave={hoverOff(active)}>
              {active && bar}
              <span style={{ color: active ? 'var(--nav-icon-active)' : 'var(--color-text-muted)' }}><SettingsIcon /></span>
              <span className="hidden lg:inline">Settings</span>
            </Link>
          );
        })()}
      </div>

      {/* ── User block ── */}
      <div className="mx-2 lg:mx-3 mb-3 p-2 lg:p-3 rounded-2xl flex flex-col lg:flex-row items-center gap-2 lg:gap-2.5"
        style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)' }}
        title={user?.email ?? undefined}>
        <Avatar name={user?.name} email={user?.email} src={user?.avatarUrl} size={32} rounded={12} />
        <div className="flex-1 min-w-0 hidden lg:block">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold truncate leading-tight" style={{ color: 'var(--color-text-primary)' }}>
              {displayName}
            </p>
            {user && (
              <span className="text-fine font-bold px-1.5 py-0.5 rounded-md shrink-0"
                style={user.plan !== 'free'
                  ? { background: 'color-mix(in srgb, var(--color-primary) 16%, transparent)', color: 'var(--color-primary)' }
                  : { background: 'color-mix(in srgb, var(--color-text-muted) 16%, transparent)', color: 'var(--color-text-muted)' }}>
                {user.plan === 'elite' ? 'Elite' : user.plan === 'pro' ? 'Pro' : 'Basic'}
              </span>
            )}
          </div>
          {user?.email && !user.isDemo && (
            <p className="text-fine truncate leading-tight" style={{ color: 'var(--color-text-muted)' }}>
              {user.email}
            </p>
          )}
          {user?.isDemo && (
            <p className="text-fine truncate leading-tight" style={{ color: 'var(--color-text-muted)' }}>
              Demo sandbox
            </p>
          )}
          {user && !user.isDemo && user.plan === 'free' && (
            <Link href="/settings?tab=billing" className="text-fine font-semibold leading-tight hover:underline"
              style={{ color: 'var(--color-primary)' }}>
              Upgrade to Pro
            </Link>
          )}
          {user && !user.isDemo && user.plan === 'pro' && (
            <Link href="/settings?tab=billing" className="text-fine font-semibold leading-tight hover:underline"
              style={{ color: 'var(--color-primary)' }}>
              Upgrade to Elite
            </Link>
          )}
          {user?.isDemo && (
            <Link href="/signup" className="text-fine font-semibold leading-tight hover:underline"
              style={{ color: 'var(--color-primary)' }}>
              Create your own account
            </Link>
          )}
        </div>
        <button onClick={logout} disabled={loggingOut} title={user?.isDemo ? 'Leave demo' : 'Sign out'} aria-label={user?.isDemo ? 'Leave demo' : 'Sign out'}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20 shrink-0 disabled:opacity-40"
          style={{ color: 'var(--color-text-muted)' }}>
          {loggingOut ? <span className="text-fine">…</span> : <SignOutIcon />}
        </button>
      </div>

    </aside>
  );
}
