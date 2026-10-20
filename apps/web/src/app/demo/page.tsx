'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { useUser } from '@/components/UserProvider';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

type Status = 'starting' | 'throttled' | 'error';

/**
 * "Try the demo" lands here. A signed-in real user keeps their session and goes
 * to the dashboard; everyone else gets a fresh private sandbox (POST /demo/start
 * sets the cookie) and is sent in.
 */
export default function DemoPage() {
  const router = useRouter();
  const { refetch } = useUser();
  const [status, setStatus] = useState<Status>('starting');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetch(`${API}/auth/me`, { credentials: 'include' });
        if (me.ok) {
          const user = await me.json().catch(() => null);
          if (user && !user.isDemo) { router.replace('/dashboard'); return; }
        }
        const res = await fetch(`${API}/demo/start`, { method: 'POST', credentials: 'include' });
        if (cancelled) return;
        if (res.status === 429) { setStatus('throttled'); return; }
        if (!res.ok) { setStatus('error'); return; }
        // The root UserProvider fetched the session once on mount (before the
        // cookie existed); refresh it so the sidebar and demo banner see the visitor.
        refetch();
        router.replace('/dashboard');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 text-center">
      <div className="max-w-sm flex flex-col items-center gap-4">
        <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 45%, transparent)' }}>
          <Logo size={30} />
        </span>
        {status === 'starting' && (
          <>
            <p className="text-lg font-semibold">Setting up your demo…</p>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              A private copy of a full year of sample data. Change anything you like; it is discarded when you leave.
            </p>
            <span aria-hidden="true" className="mt-2 w-6 h-6 rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent', animation: 'spin 0.9s linear infinite' }} />
          </>
        )}
        {status === 'throttled' && (
          <>
            <p className="text-lg font-semibold">The demo is busy right now</p>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Try again in a few minutes, or create a free account and start with your own data.</p>
            <Link href="/signup" className="btn-gold px-6 py-3 rounded-full font-semibold text-sm">Create a free account</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-lg font-semibold">Could not start the demo</p>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Something went wrong on our side. You can still create a free account.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => window.location.reload()} className="px-5 py-3 rounded-full font-semibold text-sm" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>Try again</button>
              <Link href="/signup" className="btn-gold px-5 py-3 rounded-full font-semibold text-sm">Create a free account</Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
