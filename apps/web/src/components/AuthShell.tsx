import React from 'react';
import Logo from './Logo';

export const authInputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.13)',
  borderRadius: 'var(--radius-input)',
  color: '#F2F1EA',
};

/** Shared Gilded Noir layout for all auth pages: night-sky backdrop, quote
 *  panel, and the glass card. Page content renders inside the card. */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex items-center justify-center min-h-dvh px-4 py-10 sm:py-14 overflow-x-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage: [
            'radial-gradient(120% 90% at 50% 50%, transparent 52%, rgba(4,8,16,0.60) 100%)',
            'radial-gradient(720px 540px at 32% 42%, rgba(30,144,255,0.12), transparent 62%)',
            'linear-gradient(180deg, rgba(5,9,18,0.38) 0%, rgba(5,9,18,0.16) 45%, rgba(5,9,18,0.68) 100%)',
            'url(/login-bg.jpg)',
          ].join(', '),
          backgroundSize: 'cover',
          backgroundPosition: 'center 68%',
          backgroundAttachment: 'fixed',
        }}
      />
      <div className="relative w-full max-w-6xl flex items-center justify-center lg:justify-between gap-12 lg:pl-12 lg:pr-0">

        {/* Quote */}
        <div className="hidden lg:flex flex-col max-w-xl pb-10">
          <span className="text-[11px] uppercase mb-7" style={{ color: 'rgba(77,166,255,0.75)', letterSpacing: '0.34em' }}>
            Cofre · Wealth &amp; Budget
          </span>
          <p style={{
            fontWeight: 700,
            fontSize: 'clamp(38px, 4vw, 56px)',
            lineHeight: 1.16,
            letterSpacing: '-0.015em',
            fontStyle: 'italic',
            fontFamily: 'Georgia, serif',
            background: 'linear-gradient(160deg, #BF953F 0%, #FCF6BA 22%, #B38728 45%, #FBF5B7 60%, #AA771C 78%, #E8C84A 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            filter: 'drop-shadow(0 2px 12px rgba(184,134,11,0.55))',
          }}>
            "If you can't measure it, you can't improve it."
          </p>
          <div className="rounded-full mt-8 mb-5" style={{ width: 56, height: 2, background: '#1E90FF', opacity: 0.8 }} />
          <span className="text-[11px] uppercase" style={{ color: 'rgba(242,241,234,0.45)', letterSpacing: '0.30em' }}>
            Peter Drucker
          </span>
        </div>

        {/* Card */}
        <div
          className="relative w-full max-w-md lg:shrink-0 flex flex-col items-center px-6 sm:px-9 pt-11 pb-10 rounded-3xl"
          style={{
            background: 'linear-gradient(165deg, rgba(18,27,48,0.30) 0%, rgba(9,15,29,0.20) 100%)',
            backdropFilter: 'blur(18px) saturate(140%)',
            WebkitBackdropFilter: 'blur(18px) saturate(140%)',
            border: '1px solid rgba(255,255,255,0.11)',
            boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 90px rgba(30,144,255,0.08), inset 0 1px 0 rgba(255,255,255,0.12)',
          }}
        >
          {/* Emblem + wordmark (identical on every auth page) */}
          <span className="w-[72px] h-[72px] rounded-full flex items-center justify-center"
            style={{
              border: '1px solid rgba(30,144,255,0.45)',
              boxShadow: '0 0 0 4px rgba(30,144,255,0.10), 0 14px 40px rgba(30,144,255,0.20)',
              background: 'rgba(30,144,255,0.08)',
              color: '#4DA6FF',
            }}>
            <Logo size={38} className="block" />
          </span>
          <h1 className="mt-5 font-bold tracking-tight" style={{ fontSize: 38, lineHeight: 1, color: '#F2F1EA' }}>Cofre</h1>
          <p className="mt-3 text-[10px] uppercase" style={{ color: 'rgba(242,241,234,0.55)', letterSpacing: '0.34em' }}>
            Wealth &amp; Budget
          </p>
          <div className="rounded-full mt-5 mb-8" style={{ width: 56, height: 2, background: '#1E90FF', opacity: 0.9 }} />

          {children}
        </div>

      </div>
    </div>
  );
}
