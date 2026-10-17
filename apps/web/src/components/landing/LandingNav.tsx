import Link from 'next/link';
import Logo from '@/components/Logo';

export default function LandingNav() {
  return (
    <header className="sticky top-0 z-40" style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--color-border)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)' }}>
      <nav aria-label="Main" className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 shrink-0" style={{ color: 'var(--color-card-amber)' }}>
          <Logo size={28} />
          <span className="brand-name" style={{ color: 'var(--color-text-primary)' }}>Cofre</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-2 text-sm font-medium">
          <Link href="#pricing" className="hidden sm:inline-block px-3 py-2 rounded-lg" style={{ color: 'var(--color-text-secondary)' }}>Pricing</Link>
          <Link href="/login" className="px-3 py-2 rounded-lg" style={{ color: 'var(--color-text-secondary)' }}>Log in</Link>
          <Link href="/signup" className="btn-gold px-4 py-2 rounded-xl font-semibold whitespace-nowrap">Start free</Link>
        </div>
      </nav>
    </header>
  );
}
