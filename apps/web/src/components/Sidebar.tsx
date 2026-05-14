'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from './Logo';

const NAV = [
  { label: 'Dashboard',    href: '/dashboard' },
  { label: 'Transactions', href: '/transactions' },
  { label: 'Budgets',      href: '/budgets' },
  { label: 'Goals',        href: '/goals' },
  { label: 'Reports',      href: '/reports' },
];

const BOTTOM_NAV = [
  { label: 'Settings', href: '/settings' },
];

export default function Sidebar() {
  const pathname = usePathname();

  const linkStyle = (href: string) => ({
    color: pathname === href ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    background: pathname === href ? 'rgba(155,109,255,0.15)' : 'transparent',
    border: pathname === href ? '1px solid rgba(155,109,255,0.25)' : '1px solid transparent',
  });

  return (
    <aside
      className="w-52 shrink-0 flex flex-col gap-6 p-5"
      style={{
        background: 'rgba(25, 25, 38, 0.65)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <Link href="/dashboard" className="flex items-center gap-3 no-underline">
        <Logo size={32} />
        <span className="font-bold text-sm tracking-tight text-white">Cofre</span>
      </Link>

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
