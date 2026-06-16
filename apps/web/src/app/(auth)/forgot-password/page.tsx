'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import AuthShell, { authInputStyle } from '@/components/AuthShell';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const labelCls = 'text-[10.5px] font-semibold uppercase';
const labelStyle: React.CSSProperties = { color: 'rgba(221,184,119,0.85)', letterSpacing: '0.22em' };

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    try {
      await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: form.get('email') }),
      });
    } catch { /* always show the same message — enumeration-safe */ }
    finally { setLoading(false); setSent(true); }
  }

  if (sent) {
    return (
      <AuthShell>
        <p className="text-base text-center font-semibold" style={{ color: '#F2F1EA' }}>Check your email</p>
        <p className="text-sm text-center mt-3 leading-relaxed" style={{ color: 'rgba(242,241,234,0.7)' }}>
          If that email is registered, we sent a link to reset your password. The link expires in 1 hour.
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
      <p className="text-sm text-center mb-5 leading-relaxed" style={{ color: 'rgba(242,241,234,0.7)' }}>
        Enter your email and we’ll send you a link to reset your password.
      </p>
      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5" suppressHydrationWarning>
        <label className="flex flex-col gap-2">
          <span className={labelCls} style={labelStyle}>Email</span>
          <input name="email" type="email" required autoComplete="email" placeholder="you@example.com"
            className="px-4 py-3 text-sm outline-none transition-colors" style={authInputStyle} />
        </label>
        <button type="submit" disabled={loading}
          className="btn-gold mt-2 py-4 rounded-full text-[12.5px] font-semibold uppercase transition-all disabled:opacity-60 cursor-pointer"
          style={{ letterSpacing: '0.18em' }}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="mt-5 text-[12px]" style={{ color: 'rgba(242,241,234,0.6)' }}>
        <Link href="/login" className="no-underline hover:underline" style={{ color: 'rgba(221,184,119,0.9)' }}>Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
