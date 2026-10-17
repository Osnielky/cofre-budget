import Link from 'next/link';

const LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/login', label: 'Log in' },
];

export default function LandingFooter() {
  return (
    <footer className="mt-8" style={{ borderTop: '1px solid var(--color-border)' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <span>© {new Date().getFullYear()} Cofre · Osmio Services</span>
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} style={{ color: 'var(--color-text-secondary)' }}>{l.label}</Link>
          ))}
          <a href="mailto:support@budgetcofre.com" style={{ color: 'var(--color-text-secondary)' }}>support@budgetcofre.com</a>
        </nav>
      </div>
    </footer>
  );
}
