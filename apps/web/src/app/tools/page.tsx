import type { Metadata } from 'next';
import Link from 'next/link';
import MarketingShell from '@/components/marketing/MarketingShell';
import DemoCta from '@/components/marketing/DemoCta';
import { glassCard } from '@/components/landing/landing-styles';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Free money calculators',
  description: 'Free, no-login calculators from Cofre: when you reach $1M, how long a credit card takes to pay off, and your 50/30/20 budget.',
  alternates: { canonical: `${SITE_URL}/tools` },
};

const TOOLS = [
  {
    href: '/tools/millionaire-calculator',
    title: 'Millionaire calculator',
    body: 'Net worth today, what you add each month, expected return. Get the month you reach $1M and every milestone on the way.',
  },
  {
    href: '/tools/credit-card-payoff-calculator',
    title: 'Credit card payoff calculator',
    body: 'Balance, APR and payment. See how many months it takes, the interest you pay, and what $50 more a month changes.',
  },
  {
    href: '/tools/50-30-20-budget-calculator',
    title: '50/30/20 budget calculator',
    body: 'Split your take-home pay into needs, wants and savings, and compare it with what you spend now.',
  },
];

export default function ToolsPage() {
  return (
    <MarketingShell eyebrow="Free tools" title="Money calculators, no account needed" lead="Three quick answers. Cofre computes the same numbers from your real accounts every month, if you want to stop typing them in.">
      <div className="grid gap-4 sm:grid-cols-3">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="card-lift rounded-3xl p-6 flex flex-col gap-2 no-underline" style={glassCard}>
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{t.title}</h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{t.body}</p>
            <span className="mt-auto pt-2 text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Open →</span>
          </Link>
        ))}
      </div>
      <DemoCta campaign="tools-index" body="Connect your accounts or import a CSV and Cofre keeps these numbers current: net worth and milestones, card utilization and interest, and where every dollar went." />
    </MarketingShell>
  );
}
