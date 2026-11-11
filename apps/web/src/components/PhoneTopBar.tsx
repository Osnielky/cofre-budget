'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from './Logo';
import { pageTitleFor } from '@/lib/nav';
import { usePrimaryAction } from './shell/PrimaryAction';

/* The phone top bar (below md): the logo, the open page's name and the page's one
   primary action — the `<HeaderAction primary>` the page registered, which hides
   itself in the page header at this width. The page name comes from the page map,
   so it is right on the first paint; pages keep an sr-only h1 of their own. */
export default function PhoneTopBar() {
  const pathname = usePathname();
  const action = usePrimaryAction();
  const title = pageTitleFor(pathname);

  const text = action
    ? (action.shortLabel === null ? null : (action.shortLabel ?? action.label))
    : null;
  const a11y = action ? (action.ariaLabel ?? (typeof action.label === 'string' ? action.label : undefined)) : undefined;
  const cls = `btn-gold inline-flex items-center justify-center gap-1.5 ${text === null ? 'w-9 h-9' : 'px-3 h-9'} text-sm font-semibold rounded-xl no-underline shrink-0 disabled:opacity-40`;

  return (
    <div className="md:hidden fixed top-0 inset-x-0 h-14 z-30 flex items-center gap-3 px-4" style={{
      background: 'var(--color-surface)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <Link href="/dashboard" className="flex items-center shrink-0 no-underline" aria-label="Cofre home" style={{ color: 'var(--color-primary)' }}>
        <Logo size={24} className="block" />
      </Link>
      <p className="flex-1 min-w-0 truncate text-[17px] font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }} data-testid="phone-title">
        {title}
      </p>
      {action && (action.href
        ? (
          <Link href={action.href} className={cls} aria-label={a11y} title={a11y} data-testid="phone-primary">
            {action.icon}{text !== null && <span>{text}</span>}
          </Link>
        ) : (
          <button type="button" onClick={action.invoke} disabled={action.disabled} className={cls} aria-label={a11y} title={a11y} data-testid="phone-primary">
            {action.icon}{text !== null && <span>{text}</span>}
          </button>
        ))}
    </div>
  );
}
