'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlaidLink } from 'react-plaid-link';
import Sidebar from '@/components/Sidebar';
import type { PreviewExchangeResult } from '@/components/PlaidMergeReviewModal';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

/* Landing page for Plaid Link's OAuth round trip (required by banks like Chase,
   BofA, Wells Fargo). The Link token and connect-vs-reconnect intent were stashed
   in sessionStorage before the browser navigated to the bank's OAuth page, since
   React state doesn't survive that navigation.

   `receivedRedirectUri` is only passed once `linkToken` is populated — react-plaid-link's
   internal guard only skips creating a Plaid instance when token, publicKey, AND
   receivedRedirectUri are ALL falsy, so passing a truthy receivedRedirectUri alongside
   an empty token (the state on first render, before the mount effect below runs) would
   otherwise create a doomed empty-token Plaid instance whose later teardown fires onExit
   and navigates away before the real Link handler ever opens. */
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

  const clearHandoffState = () => {
    sessionStorage.removeItem('plaidLinkToken');
    sessionStorage.removeItem('plaidLinkMode');
    sessionStorage.removeItem('plaidReconnectItemId');
  };

  const onSuccess = async (publicToken: string, metadata: any) => {
    const mode = sessionStorage.getItem('plaidLinkMode');
    try {
      if (mode === 'reconnect') {
        const itemId = sessionStorage.getItem('plaidReconnectItemId');
        if (itemId) {
          const res = await fetch(`${API}/plaid/reconnect/${itemId}/complete`, { method: 'POST', credentials: 'include' });
          if (!res.ok) throw new Error();
        }
      } else {
        const res = await fetch(`${API}/plaid/exchange/preview`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({
            public_token: publicToken,
            institution_id: metadata.institution?.institution_id ?? '',
            institution_name: metadata.institution?.name ?? 'Unknown Bank',
          }),
        });
        if (!res.ok) throw new Error();
        const preview: PreviewExchangeResult = await res.json();

        if (preview.hasManualAccounts) {
          /* This page doesn't have the manual-account list Settings uses to render
             PlaidMergeReviewModal — hand the preview off via sessionStorage so
             Settings can pick it up and show the modal once it mounts. */
          sessionStorage.setItem('plaidPendingMergeReview', JSON.stringify(preview));
        } else {
          const confirmRes = await fetch(`${API}/plaid/exchange/confirm`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({
              plaid_item_id: preview.plaidItemId,
              decisions: preview.accounts.map((a) => ({ plaidAccountId: a.plaidAccountId, action: 'new' })),
            }),
          });
          if (!confirmRes.ok) throw new Error();
        }
      }
      clearHandoffState();
      router.replace('/settings');
    } catch {
      clearHandoffState();
      sessionStorage.setItem(
        'plaidPendingError',
        mode === 'reconnect'
          ? 'Reconnected, but refresh failed. Try syncing manually.'
          : 'Bank connected but account import failed. Try syncing manually.',
      );
      router.replace('/settings');
    }
  };

  const { open, ready, error } = usePlaidLink({
    token: linkToken ?? '',
    receivedRedirectUri: linkToken ? window.location.href : undefined,
    onSuccess,
    onExit: () => { clearHandoffState(); router.replace('/settings'); },
  });

  useEffect(() => { if (linkToken && ready) open(); }, [linkToken, ready, open]);
  useEffect(() => { if (error) setStatus('error'); }, [error]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex items-center justify-center px-6 text-center">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {status === 'error' ? 'Could not complete bank connection. Return to Settings and try again.' : 'Finishing bank connection…'}
        </p>
      </main>
    </div>
  );
}
