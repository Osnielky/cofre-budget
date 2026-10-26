import Link from 'next/link';
import { glassCard } from './landing-styles';
import { TRIAL_DAYS } from '@/lib/plans';

const linkStyle = { color: 'var(--color-primary)' };

// Every answer stays inside the spec's "Allowed claims"; links are fine, numbers about others are not.
const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Is Cofre free?',
    a: `Yes — the Free plan is free forever and covers budgets, manual accounts, CSV import, goals and more. Automatic bank sync and Ask Cofre are part of Pro and Elite, which start with a ${TRIAL_DAYS}-day free trial.`,
  },
  {
    q: 'How does bank sync work?',
    a: 'You connect your bank through Plaid. Plaid sends Cofre your accounts, balances and up to 90 days of transactions; your bank login goes to Plaid, never to us.',
  },
  {
    q: 'Is my data safe?',
    a: 'Bank and Gmail access tokens are encrypted at rest (AES-256-GCM), passwords are hashed, and all traffic uses HTTPS. We don’t sell your data or use it for ads. You can disconnect a bank or Gmail any time.',
  },
  {
    q: 'Can I cancel?',
    a: `Any time, from Settings. Cancel during the ${TRIAL_DAYS}-day trial and you’re never charged.`,
  },
  {
    q: 'What does the AI see?',
    a: 'Ask Cofre is powered by Anthropic’s Claude. When you ask a question, it reads your transactions, categories, budgets, accounts, debts and net-worth goal to answer. It can suggest changes — like a budget or a category — but nothing changes until you confirm, and it can’t move money or pay bills.',
  },
  {
    q: 'How does Cofre compare to Mint, Monarch or YNAB?',
    a: (
      <>
        Mint closed in 2024 and most of the apps that replaced it have no free plan. We keep a dated, sourced comparison on the{' '}
        <Link href="/mint-alternative" style={linkStyle}>Mint alternatives</Link> page, with head-to-head pages for{' '}
        <Link href="/compare/monarch-money" style={linkStyle}>Monarch Money</Link>,{' '}
        <Link href="/compare/ynab" style={linkStyle}>YNAB</Link>,{' '}
        <Link href="/compare/copilot-money" style={linkStyle}>Copilot</Link> and{' '}
        <Link href="/compare/rocket-money" style={linkStyle}>Rocket Money</Link>. If you just want a quick number, the{' '}
        <Link href="/tools" style={linkStyle}>free calculators</Link> need no account.
      </>
    ),
  },
];

export default function LandingFaq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 scroll-mt-24">
      <h2 id="faq-heading" className="landing-display text-[36px] sm:text-[48px] text-center" style={{ color: 'var(--color-text-primary)' }}>
        Questions
      </h2>
      <div className="mt-10 flex flex-col gap-3">
        {FAQS.map((f) => (
          <details key={f.q} className="group rounded-2xl px-5 py-4" style={glassCard}>
            <summary className="cursor-pointer list-none flex items-center justify-between gap-4 font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {f.q}
              <span aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-45" style={{ color: 'var(--color-text-muted)' }}>+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
