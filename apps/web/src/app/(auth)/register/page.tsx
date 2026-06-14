'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import AuthShell, { authInputStyle, authLabelStyle, AuthLink, AuthError } from '@/components/AuthShell';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not create account');
      setStep('verify');
      setInfo(`We sent a 6-digit code to ${email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Invalid code');
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(''); setInfo('');
    try {
      await fetch(`${API}/auth/resend-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      setInfo('A new code is on its way.');
    } catch {
      setError('Could not resend the code');
    }
  }

  if (step === 'verify') {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle="Enter your verification code"
        footer={<button onClick={() => setStep('form')} className="text-[12.5px]" style={{ color: 'rgba(242,241,234,0.55)', cursor: 'pointer' }}>← Use a different email</button>}
      >
        <form onSubmit={handleVerify} className="w-full flex flex-col gap-5">
          {info && <p className="text-sm text-center" style={{ color: 'rgba(221,184,119,0.85)' }}>{info}</p>}
          <label className="flex flex-col gap-2">
            <span className="text-[10.5px] font-semibold uppercase" style={authLabelStyle}>Verification code</span>
            <input
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" autoFocus placeholder="000000"
              className="px-4 py-3 text-center text-2xl font-bold outline-none transition-colors"
              style={{ ...authInputStyle, letterSpacing: '0.4em' }}
            />
          </label>
          <AuthError message={error} />
          <button type="submit" disabled={loading || code.length !== 6}
            className="btn-gold mt-1 py-4 rounded-full text-[12.5px] font-semibold uppercase transition-all disabled:opacity-50 cursor-pointer"
            style={{ letterSpacing: '0.18em' }}>
            {loading ? 'Verifying…' : 'Verify & continue'}
          </button>
          <button type="button" onClick={handleResend}
            className="text-[12px] mt-1" style={{ color: '#DDB877', cursor: 'pointer' }}>
            Didn’t get it? Resend code
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Cofre · Wealth & Budget"
      footer={<span className="text-[12.5px]" style={{ color: 'rgba(242,241,234,0.55)' }}>Already have an account? <AuthLink href="/login">Sign in</AuthLink></span>}
    >
      <form onSubmit={handleRegister} className="w-full flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-[10.5px] font-semibold uppercase" style={authLabelStyle}>Name <span style={{ opacity: 0.5 }}>(optional)</span></span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
            placeholder="Jane Doe" className="px-4 py-3 text-sm outline-none transition-colors" style={authInputStyle} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[10.5px] font-semibold uppercase" style={authLabelStyle}>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email"
            placeholder="you@example.com" className="px-4 py-3 text-sm outline-none transition-colors" style={authInputStyle} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[10.5px] font-semibold uppercase" style={authLabelStyle}>Password</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required autoComplete="new-password"
            placeholder="At least 8 characters" className="px-4 py-3 text-sm outline-none transition-colors" style={authInputStyle} />
        </label>
        <AuthError message={error} />
        <button type="submit" disabled={loading}
          className="btn-gold mt-2 py-4 rounded-full text-[12.5px] font-semibold uppercase transition-all disabled:opacity-60 cursor-pointer"
          style={{ letterSpacing: '0.18em' }}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
