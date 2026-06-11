'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      if (!res.ok) throw new Error();
      router.push('/dashboard');
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-dvh px-4">
      {/* Card */}
      <div
        className="w-full max-w-sm flex flex-col overflow-hidden"
        style={{
          background: 'var(--color-surface)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: 'var(--glass-border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.10)',
          borderRadius: 'var(--radius-card)',
        }}
      >
        {/* Hero image */}
        <div className="relative w-full" style={{ height: '200px' }}>
          <Image
            src="/logo-chest.png"
            alt="Cofre"
            fill
            unoptimized
            priority
            style={{ objectFit: 'cover', objectPosition: 'center 30%' }}
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, transparent 30%, rgba(4,15,44,0.88) 100%)' }}
          />
          <div className="absolute bottom-0 left-0 right-0 px-7 pb-5 text-center">
            <h1 className="text-2xl font-bold tracking-tight" style={{ letterSpacing: '-0.02em' }}>
              Cofre
            </h1>
            <p className="text-xs mt-1 font-medium" style={{ color: 'rgba(255,255,255,0.50)' }}>
              Personal budget tracker
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="px-7 pb-7 pt-6 flex flex-col gap-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" suppressHydrationWarning>

            {/* Email */}
            <label className="flex flex-col gap-1.5">
              <span
                className="text-xs font-semibold tracking-wide"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Email
              </span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="px-4 py-3 text-sm outline-none transition-all duration-200"
                style={{
                  background:   'var(--color-elevated)',
                  border:       '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-input)',
                  color:        'var(--color-text-primary)',
                }}
                onFocus={e => {
                  e.currentTarget.style.border = '1px solid rgba(245,200,66,0.55)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,200,66,0.12)';
                }}
                onBlur={e => {
                  e.currentTarget.style.border = '1px solid var(--color-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </label>

            {/* Password */}
            <label className="flex flex-col gap-1.5">
              <span
                className="text-xs font-semibold tracking-wide"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Password
              </span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="px-4 py-3 text-sm outline-none transition-all duration-200"
                style={{
                  background:   'var(--color-elevated)',
                  border:       '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-input)',
                  color:        'var(--color-text-primary)',
                }}
                onFocus={e => {
                  e.currentTarget.style.border = '1px solid rgba(245,200,66,0.55)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,200,66,0.12)';
                }}
                onBlur={e => {
                  e.currentTarget.style.border = '1px solid var(--color-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </label>

            {/* Error */}
            {error && (
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.25)', color: '#F87171' }}
              >
                <ErrorIcon />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="py-3 mt-1 text-sm font-semibold transition-all duration-150 disabled:opacity-60"
              style={{
                background:    loading ? 'rgba(245,200,66,0.75)' : '#F5C842',
                borderRadius:  'var(--radius-input)',
                color:         '#010D1E',
                fontWeight:    700,
                letterSpacing: '0.01em',
                cursor:        loading ? 'not-allowed' : 'pointer',
                boxShadow:     loading ? 'none' : '0 4px 16px rgba(245,200,66,0.28)',
              }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 22px rgba(245,200,66,0.40)'; }}
              onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(245,200,66,0.28)'; }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>or</span>
            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
          </div>

          {/* Google */}
          <a
            href={`${API}/auth/google`}
            className="flex items-center justify-center gap-3 py-3 text-sm font-semibold transition-all duration-150"
            style={{
              background:   'var(--color-elevated)',
              border:       '1px solid var(--color-border)',
              borderRadius: 'var(--radius-input)',
              color:        'var(--color-text-primary)',
              cursor:       'pointer',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.border     = '1px solid rgba(255,255,255,0.14)';
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.border     = '1px solid var(--color-border)';
              (e.currentTarget as HTMLElement).style.background = 'var(--color-elevated)';
            }}
          >
            <GoogleIcon />
            Continue with Google
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Icons ── */

function ErrorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
