import Link from 'next/link';
import Logo from '@/components/Logo';

// Anchors are absolute so the bar also works from /tools and /compare pages.
const LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/tools', label: 'Free tools' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/demo', label: 'Try the demo' },
];

/** Floating glass bar inset from the edges; collapses to logo + Log in + Start free on phones. */
export default function LandingNav() {
  return (
    <header className="sticky top-0 z-40 px-3 sm:px-6 pt-3">
      <nav aria-label="Main" className="max-w-6xl mx-auto h-14 px-4 sm:px-5 rounded-2xl flex items-center justify-between gap-3"
        style={{ background: 'var(--header-bg)', border: '1px solid var(--color-border)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', boxShadow: '0 10px 30px rgba(3, 8, 20, 0.35)' }}>
        <Link href="/" className="flex items-center gap-2 shrink-0" style={{ color: 'var(--color-primary)' }}>
          <Logo size={26} />
          <span className="brand-name" style={{ color: 'var(--color-text-primary)' }}>Cofre</span>
        </Link>
        <div className="hidden md:flex items-center gap-1 text-sm font-medium">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="px-2 lg:px-3 py-2 rounded-lg whitespace-nowrap transition-colors hover:text-[var(--color-text-primary)]" style={{ color: 'var(--color-text-secondary)' }}>
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1 sm:gap-2 text-sm font-medium">
          <Link href="/login" className="px-3 py-2 rounded-lg whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>Log in</Link>
          <Link href="/signup" className="btn-gold px-4 py-2 rounded-full font-semibold whitespace-nowrap">Start free</Link>
        </div>
      </nav>
    </header>
  );
}
