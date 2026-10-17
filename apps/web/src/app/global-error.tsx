'use client';

import { useEffect } from 'react';

/**
 * Last-resort fallback for errors thrown by the root layout itself — Next
 * requires this to render its own <html>/<body>, so it can't rely on
 * globals.css or ThemeProvider, unlike error.tsx.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch('/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      }),
      keepalive: true,
    }).catch(() => { /* best-effort — nothing to do if this fails */ });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100dvh', background: '#0B1220', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: '0 16px' }}>
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center', color: '#E6EDF7', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Cofre hit a snag</h1>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>
            Something went wrong loading the app. It&rsquo;s been logged on our end — please try again.
          </p>
          <button
            onClick={reset}
            style={{
              background: 'linear-gradient(180deg, #4DA6FF, #1E78E0)',
              color: '#fff',
              border: 'none',
              borderRadius: 14,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
