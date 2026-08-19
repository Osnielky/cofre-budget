'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlaidLink } from 'react-plaid-link';
import Sidebar from '@/components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

/* Landing page for Plaid Link's OAuth round trip (required by banks like Chase,
   BofA, Wells Fargo). The Link token and connect-vs-reconnect intent were stashed
   in sessionStorage before the browser navigated to the bank's OAuth page, since
   React state doesn't survive that navigation. */
export default function PlaidOAuthRedirectPage() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'error'>('loading');

  useEffect(() => {
    const token = sessionStorage.getItem('plaidLinkToken');
    if (!token) {
      setStatus('error');
      return;
    }
    setLinkToken(token);
  }, []);

  const onSuccess = async (publicToken: string, metadata: any) => {
    const mode = sessionStorage.getItem('plaidLinkMode');
    try {
      if (mode === 'reconnect') {
        const itemId = sessionStorage.getItem('plaidReconnectItemId');
        if (itemId) {
          await fetch(`${API}/plaid/reconnect/${itemId}/complete`, { method: 'POST', credentials: 'include' });
        }
      } else {
        await fetch(`${API}/plaid/exchange`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({
            public_token: publicToken,
            institution_id: metadata.institution?.institution_id ?? '',
            institution_name: metadata.institution?.name ?? 'Unknown Bank',
          }),
        });
      }
    } finally {
      sessionStorage.removeItem('plaidLinkToken');
      sessionStorage.removeItem('plaidLinkMode');
      sessionStorage.removeItem('plaidReconnectItemId');
      router.replace('/settings');
    }
  };

  const { open, ready, error } = usePlaidLink({
    token: linkToken ?? '',
    receivedRedirectUri: typeof window !== 'undefined' ? window.location.href : '',
    onSuccess,
    onExit: () => router.replace('/settings'),
  });

  useEffect(() => { if (linkToken && ready) open(); }, [linkToken, ready, open]);
  useEffect(() => { if (error) setStatus('error'); }, [error]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {status === 'error' ? 'Could not complete bank connection. Return to Settings and try again.' : 'Finishing bank connection…'}
        </p>
      </main>
    </div>
  );
}
