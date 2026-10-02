'use client';

import { useRouter } from 'next/navigation';
import PricingCards from '@/components/PricingCards';
import { TRIAL_DAYS } from '@/lib/plans';

// Only signed-out visitors see the homepage, so every plan starts at signup.
// The trial itself is started from /pricing or Settings once they have an account.
export default function LandingPricing() {
  const router = useRouter();
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 scroll-mt-20">
      <h2 id="pricing-heading" className="text-3xl sm:text-4xl font-bold tracking-tight text-center" style={{ color: 'var(--color-text-primary)' }}>
        Simple pricing
      </h2>
      <p className="mt-3 mb-10 text-center" style={{ color: 'var(--color-text-secondary)' }}>
        Start free. Pro and Elite come with a {TRIAL_DAYS}-day free trial — cancel any time.
      </p>
      <PricingCards onSelectFree={() => router.push('/signup')} onSelectPaid={() => router.push('/signup')} />
    </section>
  );
}
