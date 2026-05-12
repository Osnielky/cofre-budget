'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
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
    <div className="flex items-center justify-center min-h-dvh" style={{ background: 'var(--color-base)' }}>
      <div className="w-full max-w-sm p-10 flex flex-col gap-8" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-card)' }}>

        <div className="text-center flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight">Cofre</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Budget tracker</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Email</span>
            <input
              name="email" type="email" required autoComplete="email"
              placeholder="you@example.com"
              className="px-4 py-3 text-sm outline-none transition-colors"
              style={{
                background: 'var(--color-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-input)',
                color: 'var(--color-text-primary)',
              }}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Password</span>
            <input
              name="password" type="password" required autoComplete="current-password"
              placeholder="••••••••"
              className="px-4 py-3 text-sm outline-none transition-colors"
              style={{
                background: 'var(--color-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-input)',
                color: 'var(--color-text-primary)',
              }}
            />
          </label>

          {error && (
            <p className="text-sm text-center" style={{ color: 'var(--color-card-orange)' }}>{error}</p>
          )}

          <button
            type="submit" disabled={loading}
            className="py-3 mt-1 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
            style={{ background: 'var(--color-card-violet)', borderRadius: 'var(--radius-card)' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
