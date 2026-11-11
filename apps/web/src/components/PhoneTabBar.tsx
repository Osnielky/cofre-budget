'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import Sheet from './motion/Sheet';
import Avatar from './Avatar';
import { useUser } from './UserProvider';
import { useLogout } from '@/hooks/useLogout';
import { activePhoneTab, phoneMoreItems, phoneTabs, isNavActive } from '@/lib/nav';
import { NAV_ICONS, AdminIcon, LifeBuoyIcon, MoreIcon, SettingsIcon, SignOutIcon } from './NavIcons';

/* Loaded on first tap only: the modal pulls in html-to-image, which no other page needs. */
const ReportProblemModal = dynamic(() => import('./support/ReportProblemModal'), { ssr: false });

const TABS = phoneTabs();
const MORE = phoneMoreItems();

/* The phone navigation (below md): a bottom bar with the four daily pages and a
   More tab that opens a sheet with the other five pages, the account rows and the
   user block — everything the sidebar holds at md and up. The bar is a flex
   sibling of <main> in the shell's column layout, so pages never pad for it. */
export default function PhoneTabBar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { logout, loggingOut } = useLogout();
  const [moreOpen, setMoreOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const active = activePhoneTab(pathname);

  /* Close the sheet whenever the route changes. */
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  const displayName = user?.name || user?.email?.split('@')[0] || '…';
  const tabCls = 'flex-1 flex flex-col items-center justify-center gap-1 min-h-14 no-underline cursor-pointer select-none';
  const color = (on: boolean) => ({ color: on ? 'var(--nav-icon-active)' : 'var(--color-text-secondary)' });

  return (
    <>
      <nav aria-label="Pages" data-testid="phone-tab-bar"
        className="md:hidden shrink-0 z-30 flex items-stretch px-1"
        style={{
          background: 'var(--color-surface)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          borderTop: '1px solid var(--color-border)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
        {TABS.map((t) => {
          const Icon = NAV_ICONS[t.icon];
          const on = active === t.href;
          return (
            <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined} className={tabCls} style={color(on)}>
              <Icon size={22} />
              <span className="text-fine leading-none" style={{ fontWeight: on ? 600 : 500 }}>{t.label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setMoreOpen(true)} className={tabCls} style={color(active === 'more')}
          aria-haspopup="dialog" aria-expanded={moreOpen} aria-current={active === 'more' ? 'page' : undefined}>
          <MoreIcon size={22} />
          <span className="text-fine leading-none" style={{ fontWeight: active === 'more' ? 600 : 500 }}>More</span>
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title="More" side="bottom" description="The other pages and your account">
        <div className="grid grid-cols-2 gap-2" role="list">
          {MORE.map((t) => {
            const Icon = NAV_ICONS[t.icon];
            const on = isNavActive(pathname, t.href);
            return (
              <Link key={t.href} href={t.href} role="listitem" aria-current={on ? 'page' : undefined}
                className="flex items-center gap-3 px-3 py-3 rounded-xl no-underline"
                style={{
                  background: on ? 'var(--nav-active-bg)' : 'var(--color-elevated)',
                  border: on ? 'var(--nav-active-border, 1px solid transparent)' : '1px solid var(--color-border)',
                  color: on ? 'var(--nav-active-fg, var(--color-text-primary))' : 'var(--color-text-primary)',
                }}>
                <span style={{ color: on ? 'var(--nav-icon-active)' : 'var(--color-text-secondary)' }}><Icon size={20} /></span>
                <span className="text-[15px] font-medium">{t.label}</span>
              </Link>
            );
          })}
        </div>

        <p className="text-fine font-semibold uppercase mt-5 mb-2 pl-1" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.28em' }}>Account</p>
        <div className="flex flex-col gap-1">
          {user?.isAdmin && (
            <MoreRow href="/admin" on={isNavActive(pathname, '/admin')} icon={<AdminIcon size={20} />} label="Admin" />
          )}
          <MoreRow href="/settings" on={isNavActive(pathname, '/settings')} icon={<SettingsIcon size={20} />} label="Settings" />
          <MoreRow onClick={() => { setMoreOpen(false); setReporting(true); }} icon={<LifeBuoyIcon size={20} />} label="Report a problem" />
        </div>

        <div className="mt-4 p-3 rounded-2xl flex items-center gap-3" style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)' }}>
          <Avatar name={user?.name} email={user?.email} src={user?.avatarUrl} size={36} rounded={12} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold truncate leading-tight" style={{ color: 'var(--color-text-primary)' }}>{displayName}</p>
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
              <p className="text-fine truncate leading-tight" style={{ color: 'var(--color-text-muted)' }}>{user.email}</p>
            )}
            {user?.isDemo && (
              <p className="text-fine truncate leading-tight" style={{ color: 'var(--color-text-muted)' }}>Demo sandbox</p>
            )}
            {user && !user.isDemo && user.plan === 'free' && (
              <Link href="/settings?tab=billing" className="text-fine font-semibold leading-tight hover:underline" style={{ color: 'var(--color-primary)' }}>Upgrade to Pro</Link>
            )}
            {user && !user.isDemo && user.plan === 'pro' && (
              <Link href="/settings?tab=billing" className="text-fine font-semibold leading-tight hover:underline" style={{ color: 'var(--color-primary)' }}>Upgrade to Elite</Link>
            )}
            {user?.isDemo && (
              <Link href="/signup" className="text-fine font-semibold leading-tight hover:underline" style={{ color: 'var(--color-primary)' }}>Create your own account</Link>
            )}
          </div>
          <button type="button" onClick={logout} disabled={loggingOut} title={user?.isDemo ? 'Leave demo' : 'Sign out'} aria-label={user?.isDemo ? 'Leave demo' : 'Sign out'}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/20 shrink-0 disabled:opacity-40"
            style={{ color: 'var(--color-text-muted)' }}>
            {loggingOut ? <span className="text-fine">…</span> : <SignOutIcon size={15} />}
          </button>
        </div>
      </Sheet>

      {reporting && <ReportProblemModal onClose={() => setReporting(false)} />}
    </>
  );
}

function MoreRow({ href, onClick, on = false, icon, label }: { href?: string; onClick?: () => void; on?: boolean; icon: React.ReactNode; label: string }) {
  const cls = 'w-full flex items-center gap-3 px-3 py-3 rounded-xl no-underline text-[15px] font-medium cursor-pointer text-left';
  const style = {
    background: on ? 'var(--nav-active-bg)' : 'transparent',
    border: on ? 'var(--nav-active-border, 1px solid transparent)' : '1px solid transparent',
    color: on ? 'var(--nav-active-fg, var(--color-text-primary))' : 'var(--color-text-primary)',
  };
  const inner = <><span style={{ color: on ? 'var(--nav-icon-active)' : 'var(--color-text-secondary)' }}>{icon}</span><span>{label}</span></>;
  if (href) return <Link href={href} aria-current={on ? 'page' : undefined} className={cls} style={style}>{inner}</Link>;
  return <button type="button" onClick={onClick} className={cls} style={style}>{inner}</button>;
}
