'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import AuthShell, { authInputStyle, authLabelStyle, AuthLink, AuthError } from '@/components/AuthShell';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      setStep('reset');
      setInfo(`If an account exists for ${email}, a reset code has been sent.`);
    } catch {
      setError('Something went wrong — try again');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, code: code.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not reset password');
      router.push('/login?reset=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'reset') {
    return (
      <AuthShell
        title="Set a new password"
        subtitle="Enter the code and your new password"
        footer={<button onClick={() => setStep('request')} className="text-[12.5px]" style={{ color: 'rgba(242,241,234,0.55)', cursor: 'pointer' }}>← Start over</button>}
      >
        <form onSubmit={handleReset} className="w-full flex flex-col gap-5">
          {info && <p className="text-sm text-center" style={{ color: 'rgba(221,184,119,0.85)' }}>{info}</p>}
          <label className="flex flex-col gap-2">
            <span className="text-[10.5px] font-semibold uppercase" style={authLabelStyle}>Reset code</span>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" autoFocus placeholder="000000"
              className="px-4 py-3 text-center text-2xl font-bold outline-none transition-colors"
              style={{ ...authInputStyle, letterSpacing: '0.4em' }} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[10.5px] font-semibold uppercase" style={authLabelStyle}>New password</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required autoComplete="new-password"
              placeholder="At least 8 characters" className="px-4 py-3 text-sm outline-none transition-colors" style={authInputStyle} />
          </label>
          <AuthError message={error} />
          <button type="submit" disabled={loading || code.length !== 6}
            className="btn-gold mt-1 py-4 rounded-full text-[12.5px] font-semibold uppercase transition-all disabled:opacity-50 cursor-pointer"
            style={{ letterSpacing: '0.18em' }}>
            {loading ? 'Updating…' : 'Reset password'}
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot password?"
      subtitle="We’ll email you a reset code"
      footer={<span className="text-[12.5px]" style={{ color: 'rgba(242,241,234,0.55)' }}>Remembered it? <AuthLink href="/login">Sign in</AuthLink></span>}
    >
      <form onSubmit={handleRequest} className="w-full flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-[10.5px] font-semibold uppercase" style={authLabelStyle}>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email"
            placeholder="you@example.com" className="px-4 py-3 text-sm outline-none transition-colors" style={authInputStyle} />
        </label>
        <AuthError message={error} />
        <button type="submit" disabled={loading}
          className="btn-gold mt-2 py-4 rounded-full text-[12.5px] font-semibold uppercase transition-all disabled:opacity-60 cursor-pointer"
          style={{ letterSpacing: '0.18em' }}>
          {loading ? 'Sending…' : 'Send reset code'}
        </button>
        <button type="button" onClick={() => setStep('reset')} className="text-[12px]" style={{ color: '#DDB877', cursor: 'pointer' }}>
          I already have a code
        </button>
      </form>
    </AuthShell>
  );
}
