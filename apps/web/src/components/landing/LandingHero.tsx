import Link from 'next/link';
import { HOME_HEADLINE } from '@/lib/seo';
import { TRIAL_DAYS } from '@/lib/plans';
import { tint } from './landing-styles';
import ChatMockup from './mockups/ChatMockup';
import AccountsMockup from './mockups/AccountsMockup';

export default function LandingHero() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16 grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08]" style={{ color: 'var(--color-text-primary)' }}>
          {HOME_HEADLINE}
        </h1>
        <p className="mt-5 text-lg max-w-xl" style={{ color: 'var(--color-text-secondary)' }}>
          Cofre pulls in every transaction automatically and lets you ask about your money in plain English —
          so you can cut the waste and see your path to $1M.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link href="/signup" className="btn-gold px-6 py-3.5 rounded-xl font-semibold text-center">Start free</Link>
          <Link href="#pricing" className="px-6 py-3.5 rounded-xl font-semibold text-center" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', background: 'var(--color-elevated)' }}>
            See pricing
          </Link>
        </div>
        <p className="mt-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Free forever plan · Pro includes a {TRIAL_DAYS}-day free trial
        </p>
      </div>
      <div className="relative flex flex-col items-center lg:items-end gap-4">
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: tint('var(--color-primary)', 16), color: 'var(--color-primary)' }}>
          Bank sync &amp; Ask Cofre · Pro
        </span>
        <AccountsMockup className="lg:mr-16" />
        <ChatMockup className="lg:-mt-6" />
      </div>
    </section>
  );
}
