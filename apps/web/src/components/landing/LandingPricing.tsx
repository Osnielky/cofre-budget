'use client';

import { useRouter } from 'next/navigation';
import PricingCards from '@/components/PricingCards';
import { TRIAL_DAYS } from '@/lib/plans';
import { container, glassCard } from './landing-styles';

// Only signed-out visitors see the homepage, so every plan starts at signup.
// The trial itself is started from /pricing or Settings once they have an account.
export default function LandingPricing() {
  const router = useRouter();
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className={`${container} py-16 sm:py-24 scroll-mt-24`}>
      {/* Teaser band, Monarch-style, above the real cards. */}
      <div className="rounded-[28px] p-7 sm:p-10 grid lg:grid-cols-[minmax(0,1.3fr)_auto] gap-6 items-center" style={glassCard}>
        <div className="max-w-xl">
          <h2 id="pricing-heading" className="landing-display text-[34px] sm:text-[44px]" style={{ color: 'var(--color-text-primary)' }}>
            Try Pro free for {TRIAL_DAYS} days
          </h2>
          <p className="mt-3 text-base sm:text-lg leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Automatic bank sync, Ask Cofre and credit card details, with no ads and no data selling.
            The Free plan stays free.
          </p>
        </div>
        <a href="#plans" className="btn-gold px-7 py-3.5 rounded-full font-semibold text-center whitespace-nowrap lg:justify-self-end">
          View plans
        </a>
      </div>
      <div id="plans" className="mt-12 scroll-mt-24">
        <PricingCards onSelectFree={() => router.push('/signup')} onSelectPaid={() => router.push('/signup')} />
      </div>
    </section>
  );
}
