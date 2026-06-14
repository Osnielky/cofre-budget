'use client';

import Link from 'next/link';
import Logo from '@/components/Logo';

export const authInputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.13)',
  borderRadius: 'var(--radius-input)',
  color: '#F2F1EA',
};

export const authLabelStyle: React.CSSProperties = {
  color: 'rgba(221,184,119,0.85)',
  letterSpacing: '0.22em',
};

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative flex items-center justify-center min-h-dvh px-4 py-10 sm:py-14 overflow-x-hidden">
      {/* Night-sky backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage: [
            'radial-gradient(120% 90% at 50% 50%, transparent 52%, rgba(4,8,16,0.60) 100%)',
            'radial-gradient(720px 540px at 50% 40%, rgba(201,160,92,0.10), transparent 62%)',
            'linear-gradient(180deg, rgba(5,9,18,0.38) 0%, rgba(5,9,18,0.16) 45%, rgba(5,9,18,0.68) 100%)',
            'url(/login-bg.jpg)',
          ].join(', '),
          backgroundSize: 'cover',
          backgroundPosition: 'center 68%',
          backgroundAttachment: 'fixed',
        }}
      />

      <div
        className="relative w-full max-w-md flex flex-col items-center px-6 sm:px-9 pt-11 pb-10 rounded-3xl"
        style={{
          background: 'linear-gradient(165deg, rgba(18,27,48,0.30) 0%, rgba(9,15,29,0.20) 100%)',
          backdropFilter: 'blur(18px) saturate(140%)',
          WebkitBackdropFilter: 'blur(18px) saturate(140%)',
          border: '1px solid rgba(255,255,255,0.11)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 90px rgba(201,160,92,0.07), inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
      >
        {/* Emblem */}
        <span
          className="w-[72px] h-[72px] rounded-full flex items-center justify-center"
          style={{
            border: '1px solid rgba(201,160,92,0.45)',
            boxShadow: '0 0 0 4px rgba(201,160,92,0.10), 0 14px 40px rgba(201,160,92,0.18)',
            background: 'rgba(201,160,92,0.08)',
            color: '#DDB877',
          }}
        >
          <Logo size={38} className="block" />
        </span>

        <h1 className="mt-5 font-bold tracking-tight text-center" style={{ fontSize: 30, lineHeight: 1.1, color: '#F2F1EA' }}>
          {title}
        </h1>
        <p className="mt-3 text-[11px] uppercase text-center" style={{ color: 'rgba(242,241,234,0.55)', letterSpacing: '0.20em' }}>
          {subtitle}
        </p>
        <div className="rounded-full mt-5 mb-8" style={{ width: 56, height: 2, background: '#C9A05C', opacity: 0.9 }} />

        {children}

        {footer && <div className="w-full mt-7 text-center">{footer}</div>}
      </div>
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-[12.5px] font-semibold transition-colors hover:brightness-125"
      style={{ color: '#DDB877' }}
    >
      {children}
    </Link>
  );
}

export function AuthError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="text-sm text-center w-full" style={{ color: 'var(--color-rose)' }}>
      {message}
    </p>
  );
}
