import Link from 'next/link';
import Logo from '@/components/Logo';
import { container } from './landing-styles';

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  { heading: 'Product', links: [
    { href: '/#features', label: 'Features' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/demo', label: 'Demo' },
    { href: '/signup', label: 'Sign up' },
    { href: '/login', label: 'Log in' },
  ] },
  { heading: 'Free tools', links: [
    { href: '/tools/millionaire-calculator', label: 'Millionaire calculator' },
    { href: '/tools/credit-card-payoff-calculator', label: 'Card payoff calculator' },
    { href: '/tools/50-30-20-budget-calculator', label: '50/30/20 calculator' },
    { href: '/mint-alternative', label: 'Mint alternatives' },
    { href: '/compare/monarch-money', label: 'vs Monarch Money' },
    { href: '/compare/ynab', label: 'vs YNAB' },
  ] },
  { heading: 'Legal', links: [
    { href: '/privacy', label: 'Privacy' },
    { href: '/terms', label: 'Terms' },
  ] },
  { heading: 'Support', links: [
    { href: 'mailto:support@budgetcofre.com', label: 'support@budgetcofre.com' },
    { href: '/#faq', label: 'Questions' },
  ] },
];

export default function LandingFooter() {
  return (
    <footer style={{ borderTop: '1px solid var(--color-border)' }}>
      <div className={`${container} py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr_1fr_1fr]`}>
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
                  {l.href.startsWith('mailto:')
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
