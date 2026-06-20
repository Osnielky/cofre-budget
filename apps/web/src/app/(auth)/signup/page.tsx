'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import AuthShell, { authInputStyle } from '@/components/AuthShell';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const labelCls = 'text-[10.5px] font-semibold uppercase';
const labelStyle: React.CSSProperties = { color: 'rgba(221,184,119,0.85)', letterSpacing: '0.22em' };

export default function SignupPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '');
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');

    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password }),
      });
      if (res.status === 409) { setError('That email is already registered.'); return; }
      if (!res.ok) throw new Error();
      setDone(true);
    } catch {
      setError('Could not create your account. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthShell>
        <p className="text-base text-center font-semibold" style={{ color: '#F2F1EA' }}>Check your email</p>
        <p className="text-sm text-center mt-3 leading-relaxed" style={{ color: 'rgba(242,241,234,0.7)' }}>
          We sent a verification link to your inbox. Click it to activate your account, then sign in.
        </p>
        <Link href="/login" className="btn-gold mt-7 py-3.5 px-8 rounded-full text-[12.5px] font-semibold uppercase no-underline transition-all"
          style={{ letterSpacing: '0.18em' }}>
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4" suppressHydrationWarning>
        <label className="flex flex-col gap-2">
          <span className={labelCls} style={labelStyle}>Name</span>
          <input name="name" type="text" required autoComplete="name" placeholder="Your name"
            className="px-4 py-3 text-sm outline-none transition-colors" style={authInputStyle} />
        </label>
        <label className="flex flex-col gap-2">
          <span className={labelCls} style={labelStyle}>Email</span>
          <input name="email" type="email" required autoComplete="email" placeholder="you@example.com"
            className="px-4 py-3 text-sm outline-none transition-colors" style={authInputStyle} />
        </label>
        <label className="flex flex-col gap-2">
          <span className={labelCls} style={labelStyle}>Password</span>
          <input name="password" type="password" required autoComplete="new-password" placeholder="At least 8 characters"
            className="px-4 py-3 text-sm outline-none transition-colors" style={authInputStyle} />
        </label>
        <label className="flex flex-col gap-2">
          <span className={labelCls} style={labelStyle}>Confirm password</span>
          <input name="confirm" type="password" required autoComplete="new-password" placeholder="••••••••"
            className="px-4 py-3 text-sm outline-none transition-colors" style={authInputStyle} />
        </label>

        {error && <p className="text-sm text-center" style={{ color: 'var(--color-rose)' }}>{error}</p>}

        <button type="submit" disabled={loading}
          className="btn-gold mt-2 py-4 rounded-full text-[12.5px] font-semibold uppercase transition-all disabled:opacity-60 cursor-pointer"
          style={{ letterSpacing: '0.18em' }}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-5 text-[12px]" style={{ color: 'rgba(242,241,234,0.6)' }}>
        Already have an account?{' '}
        <Link href="/login" className="no-underline hover:underline" style={{ color: 'rgba(221,184,119,0.9)' }}>Sign in</Link>
      </p>
    </AuthShell>
  );
}
