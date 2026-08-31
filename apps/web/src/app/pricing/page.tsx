'use client';

import { useRouter } from 'next/navigation';
import PricingCards from '@/components/PricingCards';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export default function PricingPage() {
  const router = useRouter();

  async function handleSelectPaid(tier: 'pro' | 'elite', interval: 'month' | 'year') {
    const res = await fetch(`${API}/billing/checkout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ tier, interval }),
    });
    if (res.status === 401) {
      router.push('/signup');
      return;
    }
    if (!res.ok) return;
    const { url } = await res.json();
    window.location.href = url;
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold text-center mb-2" style={{ color: 'var(--color-text-primary)' }}>
        Simple pricing
      </h1>
      <p className="text-center mb-10" style={{ color: 'var(--color-text-muted)' }}>
        Start free. Upgrade when you want your banks connected automatically.
      </p>
      <PricingCards onSelectFree={() => router.push('/signup')} onSelectPaid={handleSelectPaid} />
    </div>
  );
}
