'use client';

import { useState, FormEvent, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthShell, { authInputStyle } from '@/components/AuthShell';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const labelCls = 'text-[10.5px] font-semibold uppercase';
const labelStyle: React.CSSProperties = { color: 'rgba(221,184,119,0.85)', letterSpacing: '0.22em' };

function ResetInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) throw new Error();
      setDone(true);
    } catch {
      setError('That reset link is invalid or expired.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <>
        <p className="text-base text-center font-semibold" style={{ color: '#F2F1EA' }}>Password updated</p>
        <p className="text-sm text-center mt-3" style={{ color: 'rgba(242,241,234,0.7)' }}>You can sign in with your new password.</p>
        <Link href="/login" className="btn-gold mt-7 py-3.5 px-8 rounded-full text-[12.5px] font-semibold uppercase no-underline transition-all"
          style={{ letterSpacing: '0.18em' }}>
          Sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5" suppressHydrationWarning>
        <label className="flex flex-col gap-2">
          <span className={labelCls} style={labelStyle}>New password</span>
          <input name="password" type="password" required autoComplete="new-password" placeholder="At least 8 characters"
            className="px-4 py-3 text-sm outline-none transition-colors" style={authInputStyle} />
        </label>
        <label className="flex flex-col gap-2">
          <span className={labelCls} style={labelStyle}>Confirm password</span>
          <input name="confirm" type="password" required autoComplete="new-password" placeholder="••••••••"
            className="px-4 py-3 text-sm outline-none transition-colors" style={authInputStyle} />
        </label>

        {error && (
          <p className="text-sm text-center" style={{ color: 'var(--color-rose)' }}>
            {error}{' '}
            <Link href="/forgot-password" className="underline" style={{ color: 'rgba(221,184,119,0.95)' }}>Request a new one</Link>
          </p>
        )}

        <button type="submit" disabled={loading || !token}
          className="btn-gold mt-2 py-4 rounded-full text-[12.5px] font-semibold uppercase transition-all disabled:opacity-60 cursor-pointer"
          style={{ letterSpacing: '0.18em' }}>
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <ResetInner />
      </Suspense>
    </AuthShell>
  );
}
