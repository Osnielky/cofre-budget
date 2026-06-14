'use client';

import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.13)',
  borderRadius: 'var(--radius-input)',
  color: '#F2F1EA',
};

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reset') === '1') {
      setInfo('Password updated. Sign in with your new password.');
    }
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '');
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password: form.get('password') }),
      });
      if (res.ok) {
        router.push('/dashboard');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data.code === 'EMAIL_NOT_VERIFIED') {
        // Trigger a fresh code, then send them to verify.
        fetch(`${API}/auth/resend-code`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ email }),
        }).catch(() => {});
        router.push(`/verify?email=${encodeURIComponent(email)}`);
        return;
      }
      throw new Error();
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex items-center justify-center min-h-dvh px-4 py-10 sm:py-14 overflow-x-hidden">
      {/* ── Night-sky backdrop ── */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage: [
            'radial-gradient(120% 90% at 50% 50%, transparent 52%, rgba(4,8,16,0.60) 100%)',
            'radial-gradient(720px 540px at 32% 42%, rgba(201,160,92,0.10), transparent 62%)',
            'linear-gradient(180deg, rgba(5,9,18,0.38) 0%, rgba(5,9,18,0.16) 45%, rgba(5,9,18,0.68) 100%)',
            'url(/login-bg.jpg)',
          ].join(', '),
          backgroundSize: 'cover',
          backgroundPosition: 'center 68%',
          backgroundAttachment: 'fixed',
        }}
      />
      <div className="relative w-full max-w-6xl flex items-center justify-center lg:justify-between gap-12 lg:pl-12 lg:pr-0">

        {/* ── Quote ── */}
        <div className="hidden lg:flex flex-col max-w-xl pb-10">
          <span className="text-[11px] uppercase mb-7" style={{ color: 'rgba(221,184,119,0.65)', letterSpacing: '0.34em' }}>
            Cofre · Wealth &amp; Budget
          </span>
          <p style={{
            fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 'clamp(40px, 4.2vw, 60px)',
            lineHeight: 1.18,
            letterSpacing: '0.01em',
            background: 'linear-gradient(115deg, #EED9AE 0%, #DDB877 38%, #C9A05C 68%, #A87F45 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            textShadow: '0 0 60px rgba(201,160,92,0.18)',
          }}>
            “If you can’t measure it, you can’t improve it.”
          </p>
          <div className="rounded-full mt-8 mb-5" style={{ width: 56, height: 2, background: '#C9A05C', opacity: 0.8 }} />
          <span className="text-[11px] uppercase" style={{ color: 'rgba(242,241,234,0.45)', letterSpacing: '0.30em' }}>
            Peter Drucker
          </span>
        </div>

        {/* ── Login card ── */}
        <div
        className="relative w-full max-w-md lg:shrink-0 flex flex-col items-center px-6 sm:px-9 pt-11 pb-10 rounded-3xl"
        style={{
          background: 'linear-gradient(165deg, rgba(18,27,48,0.30) 0%, rgba(9,15,29,0.20) 100%)',
          backdropFilter: 'blur(18px) saturate(140%)',
          WebkitBackdropFilter: 'blur(18px) saturate(140%)',
          border: '1px solid rgba(255,255,255,0.11)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 90px rgba(201,160,92,0.07), inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
      >
        {/* ── Emblem ── */}
        <span className="w-[72px] h-[72px] rounded-full flex items-center justify-center"
          style={{
            border: '1px solid rgba(201,160,92,0.45)',
            boxShadow: '0 0 0 4px rgba(201,160,92,0.10), 0 14px 40px rgba(201,160,92,0.18)',
            background: 'rgba(201,160,92,0.08)',
            color: '#DDB877',
          }}>
          <Logo size={38} className="block" />
        </span>

        {/* ── Wordmark ── */}
        <h1 className="mt-5 font-bold tracking-tight" style={{ fontSize: 38, lineHeight: 1, color: '#F2F1EA' }}>Cofre</h1>
        <p className="mt-3 text-[10px] uppercase" style={{ color: 'rgba(242,241,234,0.55)', letterSpacing: '0.34em' }}>
          Wealth &amp; Budget
        </p>
        <div className="rounded-full mt-5 mb-8" style={{ width: 56, height: 2, background: '#C9A05C', opacity: 0.9 }} />

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5" suppressHydrationWarning>
          <label className="flex flex-col gap-2">
            <span className="text-[10.5px] font-semibold uppercase"
              style={{ color: 'rgba(221,184,119,0.85)', letterSpacing: '0.22em' }}>
              Email
            </span>
            <input
              name="email" type="email" required autoComplete="email"
              placeholder="you@example.com"
              className="px-4 py-3 text-sm outline-none transition-colors"
              style={inputStyle}
            />
          </label>

          <label className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase"
                style={{ color: 'rgba(221,184,119,0.85)', letterSpacing: '0.22em' }}>
                Password
              </span>
              <Link href="/forgot-password" className="text-[11px] transition-colors hover:brightness-125"
                style={{ color: 'rgba(221,184,119,0.70)' }}>
                Forgot?
              </Link>
            </div>
            <input
              name="password" type="password" required autoComplete="current-password"
              placeholder="••••••••"
              className="px-4 py-3 text-sm outline-none transition-colors"
              style={inputStyle}
            />
          </label>

          {info && (
            <p className="text-sm text-center" style={{ color: 'rgba(221,184,119,0.85)' }}>{info}</p>
          )}
          {error && (
            <p className="text-sm text-center" style={{ color: 'var(--color-rose)' }}>{error}</p>
          )}

          <button
            type="submit" disabled={loading}
            className="btn-gold mt-2 py-4 rounded-full text-[12.5px] font-semibold uppercase transition-all disabled:opacity-60 cursor-pointer"
            style={{ letterSpacing: '0.18em' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* ── Divider ── */}
        <div className="w-full flex items-center gap-4 my-6">
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.12)' }} />
          <span className="text-[10px] uppercase" style={{ color: 'rgba(242,241,234,0.45)', letterSpacing: '0.28em' }}>or</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>

        {/* ── Google ── */}
        <a
          href={`${API}/auth/google`}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-full text-[12.5px] font-semibold uppercase no-underline transition-all hover:brightness-125"
          style={{
            letterSpacing: '0.14em',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.14)',
            color: '#F2F1EA',
          }}
        >
          <GoogleIcon />
          Continue with Google
        </a>

        {/* ── Create account ── */}
        <p className="mt-7 text-[12.5px]" style={{ color: 'rgba(242,241,234,0.55)' }}>
          New to Cofre?{' '}
          <Link href="/register" className="font-semibold transition-colors hover:brightness-125" style={{ color: '#DDB877' }}>
            Create an account
          </Link>
        </p>
        </div>{/* end login card */}

      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
