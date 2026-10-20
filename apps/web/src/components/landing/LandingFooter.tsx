import Link from 'next/link';
import Logo from '@/components/Logo';
import { container } from './landing-styles';

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  { heading: 'Product', links: [
    { href: '#features', label: 'Features' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/signup', label: 'Sign up' },
    { href: '/login', label: 'Log in' },
  ] },
  { heading: 'Legal', links: [
    { href: '/privacy', label: 'Privacy' },
    { href: '/terms', label: 'Terms' },
  ] },
  { heading: 'Support', links: [
    { href: 'mailto:support@budgetcofre.com', label: 'support@budgetcofre.com' },
    { href: '#faq', label: 'Questions' },
  ] },
];

export default function LandingFooter() {
  return (
    <footer style={{ borderTop: '1px solid var(--color-border)' }}>
      <div className={`${container} py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]`}>
        <div>
          <Link href="/" className="inline-flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
            <Logo size={26} />
            <span className="brand-name" style={{ color: 'var(--color-text-primary)' }}>Cofre</span>
          </Link>
          <p className="mt-3 text-sm max-w-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Budgeting on autopilot, with an AI that answers your money questions.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.heading} aria-label={c.heading}>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>{c.heading}</p>
            <ul className="flex flex-col gap-2 text-sm">
              {c.links.map((l) => (
                <li key={l.href}>
                  {l.href.startsWith('mailto:') || l.href.startsWith('#')
                    ? <a href={l.href} style={{ color: 'var(--color-text-secondary)' }}>{l.label}</a>
                    : <Link href={l.href} style={{ color: 'var(--color-text-secondary)' }}>{l.label}</Link>}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className={`${container} pb-8 text-xs`} style={{ color: 'var(--color-text-muted)' }}>
        © {new Date().getFullYear()} Cofre, Osmio Services
      </div>
    </footer>
  );
}
