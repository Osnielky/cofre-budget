'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch('/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: window.location.href,
      }),
      keepalive: true,
    }).catch(() => { /* best-effort — nothing to do if this fails */ });
  }, [error]);

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="card-lift flex flex-col items-center gap-4 text-center max-w-md w-full p-8 rounded-2xl" style={glass}>
        <Logo size={40} className="text-(--color-primary)" />
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Something went wrong</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          An unexpected error occurred. It&rsquo;s been logged on our end — try again, or head back to your dashboard.
        </p>
        <div className="flex items-center gap-3 mt-2">
          <button onClick={reset} className="btn-gold py-2.5 px-5 text-sm font-semibold cursor-pointer" style={{ borderRadius: 14 }}>
            Try again
          </button>
          <Link href="/dashboard" className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
