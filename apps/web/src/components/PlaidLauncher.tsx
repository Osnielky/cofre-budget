'use client';

import { useEffect } from 'react';
import { usePlaidLink, type PlaidLinkOnSuccess, type PlaidLinkOnExit } from 'react-plaid-link';

/* Mount this only once a link token exists. `usePlaidLink` injects Plaid's
   script from cdn.plaid.com the moment it runs, token or not, so calling the
   hook at the top of the Cards and Settings pages loaded a third-party script
   on every visit. Here the script is fetched only when a link is actually
   about to open, and Link opens as soon as it is ready. Renders nothing. */
export default function PlaidLauncher({ token, onSuccess, onExit }: {
  token: string; onSuccess: PlaidLinkOnSuccess; onExit: PlaidLinkOnExit;
}) {
  const { open, ready } = usePlaidLink({ token, onSuccess, onExit });
  useEffect(() => { if (ready) open(); }, [ready, open]);
  return null;
}
