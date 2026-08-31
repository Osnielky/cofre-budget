'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PricingCards from '@/components/PricingCards';
import { useUser } from '@/components/UserProvider';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export default function PricingPage() {
  const router = useRouter();
  const { user } = useUser();
  const [error, setError] = useState<string | null>(null);

  async function handleSelectPaid(tier: 'pro' | 'elite', interval: 'month' | 'year') {
    setError(null);
    try {
      const res = await fetch(`${API}/billing/checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ tier, interval }),
      });
      if (res.status === 401) {
        router.push('/signup');
        return;
      }
      if (!res.ok) {
        // Covers the 409 ConflictException thrown when the user already has an active/
        // trialing/past_due subscription, plus any other non-2xx (500, etc.) — this used
        // to be a silent no-op, which left a click at the top of the paid funnel doing
        // visibly nothing.
        const body = await res.json().catch(() => null);
        setError(typeof body?.message === 'string' ? body.message : 'Something went wrong — please try again.');
        return;
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setError('Something went wrong — please try again.');
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold text-center mb-2" style={{ color: 'var(--color-text-primary)' }}>
        Simple pricing
      </h1>
      <p className="text-center mb-10" style={{ color: 'var(--color-text-muted)' }}>
        Start free. Upgrade when you want your banks connected automatically.
      </p>
      {error && (
        <p className="text-center text-sm mb-8" style={{ color: 'var(--color-card-orange)' }}>{error}</p>
      )}
      <PricingCards
        onSelectFree={() => router.push('/signup')}
        onSelectPaid={handleSelectPaid}
        currentTier={user?.plan ?? 'free'}
      />
    </div>
  );
}
