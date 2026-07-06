'use client';

import { useState, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthShell from '@/components/AuthShell';
import { useUser } from '@/components/UserProvider';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const fieldStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.13)',
  borderRadius: 14,
  color: '#F2F1EA',
};

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { refetch } = useUser();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [resent, setResent] = useState(false);

  const verified = params.get('verified') === '1';
  const linkError = params.get('error') === 'verify';

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(''); setUnverified(false); setResent(false); setLoading(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '');
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password: form.get('password') }),
      });
      if (res.status === 403) {
        const data = await res.json().catch(() => null);
        if (data?.code === 'EMAIL_UNVERIFIED') { setUnverified(true); setPendingEmail(email); return; }
        throw new Error();
      }
      if (!res.ok) throw new Error();
      refetch();                 // reload the user context so the new session shows immediately
      router.push('/dashboard');
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    await fetch(`${API}/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: pendingEmail }),
    });
    setResent(true);
  }

  return (
    <>
      {verified && (
        <p className="w-full text-sm text-center mb-4" style={{ color: 'var(--color-green)' }}>
          Email verified — please sign in.
        </p>
      )}
      {linkError && (
        <p className="w-full text-sm text-center mb-4" style={{ color: 'var(--color-rose)' }}>
          That verification link is invalid or expired. Sign in to get a new one.
        </p>
      )}

      <div className="w-full mb-6">
        <h2 className="text-[19px] font-bold" style={{ color: '#F2F1EA' }}>Welcome back</h2>
        <p className="mt-1 text-[13px]" style={{ color: 'rgba(242,241,234,0.55)' }}>
          Sign in to manage your money with clarity.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4" suppressHydrationWarning>
        <label className="relative block">
          <span className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'rgba(242,241,234,0.45)' }}>
            <MailIcon />
          </span>
          <input name="email" type="email" required autoComplete="email" placeholder="Email address"
            aria-label="Email address"
            className="w-full pl-12 pr-4 py-3.5 text-sm outline-none transition-colors placeholder:text-[rgba(242,241,234,0.4)]"
            style={fieldStyle} />
        </label>

        <label className="relative block">
          <span className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'rgba(242,241,234,0.45)' }}>
            <LockIcon />
          </span>
          <input name="password" type={showPw ? 'text' : 'password'} required autoComplete="current-password"
            placeholder="Password" aria-label="Password"
            className="w-full pl-12 pr-12 py-3.5 text-sm outline-none transition-colors placeholder:text-[rgba(242,241,234,0.4)]"
            style={fieldStyle} />
          <button type="button" onClick={() => setShowPw(v => !v)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
            className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer transition-colors hover:opacity-80"
            style={{ color: 'rgba(242,241,234,0.45)' }}>
            {showPw ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </label>

        <div className="flex items-center justify-between text-[12.5px]">
          <label className="flex items-center gap-2 cursor-pointer select-none" style={{ color: 'rgba(242,241,234,0.7)' }}>
            <input type="checkbox" name="remember" className="w-4 h-4 rounded cursor-pointer"
              style={{ accentColor: '#1E90FF' }} />
            Remember me
          </label>
          <Link href="/forgot-password" className="no-underline hover:underline" style={{ color: '#4DA6FF' }}>
            Forgot password?
          </Link>
        </div>

        {error && <p className="text-sm text-center" style={{ color: 'var(--color-rose)' }}>{error}</p>}

        {unverified && (
          <div className="text-sm text-center flex flex-col gap-1.5" style={{ color: 'var(--color-amber)' }}>
            <span>Please verify your email before signing in.</span>
            {resent
              ? <span style={{ color: 'var(--color-green)' }}>New link sent — check your inbox.</span>
              : <button type="button" onClick={resend} className="underline cursor-pointer" style={{ color: '#4DA6FF' }}>Resend verification email</button>}
          </div>
        )}

        <button type="submit" disabled={loading}
          className="btn-gold mt-1 py-3.5 text-[15px] font-semibold transition-all disabled:opacity-60 cursor-pointer"
          style={{ borderRadius: 14 }}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <div className="w-full flex items-center gap-4 my-6">
        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.12)' }} />
        <span className="text-[12px]" style={{ color: 'rgba(242,241,234,0.5)' }}>or continue with</span>
        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.12)' }} />
      </div>

      <a href={`${API}/auth/google`}
        className="w-full flex items-center justify-center gap-3 py-3.5 text-[14.5px] font-semibold no-underline transition-all hover:brightness-125"
        style={{ borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: '#F2F1EA' }}>
        <GoogleIcon />
        Continue with Google
      </a>

      <p className="mt-7 text-[13px]" style={{ color: 'rgba(242,241,234,0.55)' }}>
        New here?{' '}
        <Link href="/signup" className="no-underline hover:underline font-semibold" style={{ color: '#4DA6FF' }}>
          Create account
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <LoginInner />
      </Suspense>
    </AuthShell>
  );
}

function MailIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="M2 7l9.1 6.1a2 2 0 0 0 2.2 0L22 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3.5 8 10 8a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
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
