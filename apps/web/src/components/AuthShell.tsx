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
      <div aria-hidden="true" className="auth-bg absolute inset-0" />
      <div className="relative w-full max-w-6xl flex items-center justify-center lg:justify-between gap-12 lg:pl-12 lg:pr-0">

        {/* Quote */}
        <div className="hidden lg:flex flex-col max-w-xl pb-10">
          <span className="text-[11px] uppercase mb-6" style={{ color: 'rgba(160,190,225,0.85)', letterSpacing: '0.34em' }}>
            Cofre · Wealth &amp; Budget
          </span>
          <p style={{
            fontFamily: 'var(--font-script), cursive',
            fontWeight: 400,
            fontSize: 'clamp(52px, 5.2vw, 80px)',
            lineHeight: 1.22,
            color: '#EEF3FA',
            textShadow: '0 2px 30px rgba(0,0,0,0.5)',
          }}>
            If you can't measure it,{' '}
            <span style={{
              background: 'linear-gradient(160deg, #BF953F 0%, #FCF6BA 25%, #D4A94C 50%, #FBF5B7 68%, #B38728 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              filter: 'drop-shadow(0 2px 14px rgba(184,134,11,0.45))',
            }}>
              you can't improve it.
            </span>
          </p>
          <div className="rounded-full mt-6 mb-5" style={{ width: 56, height: 2, background: 'rgba(238,243,250,0.55)' }} />
          <span className="text-[11px] uppercase" style={{ color: 'rgba(242,241,234,0.5)', letterSpacing: '0.30em' }}>
            Peter Drucker
          </span>
        </div>

        {/* Card */}
        <div
          className="relative w-full max-w-md lg:shrink-0 flex flex-col items-center px-6 sm:px-9 pt-11 pb-10 rounded-3xl"
          style={{
            background: 'linear-gradient(165deg, rgba(14,24,48,0.62) 0%, rgba(7,13,28,0.55) 100%)',
            backdropFilter: 'blur(20px) saturate(140%)',
            WebkitBackdropFilter: 'blur(20px) saturate(140%)',
            border: '1px solid rgba(77,166,255,0.30)',
            boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 70px rgba(30,144,255,0.16), inset 0 1px 0 rgba(255,255,255,0.10)',
          }}
        >
          {/* Emblem + wordmark (identical on every auth page) */}
          <span className="w-18 h-18 rounded-full flex items-center justify-center"
            style={{
              border: '1px solid rgba(77,166,255,0.55)',
              boxShadow: '0 0 0 5px rgba(30,144,255,0.12), 0 0 34px rgba(30,144,255,0.35)',
              background: 'rgba(30,144,255,0.10)',
              color: '#BFD9FF',
            }}>
            <Logo size={38} className="block" />
          </span>
          <h1 className="mt-5 font-bold" style={{ fontSize: 40, lineHeight: 1, color: '#F5F7FB', fontFamily: 'Georgia, serif', letterSpacing: '0.01em' }}>Cofre</h1>
          <p className="mt-3 text-[10px] uppercase mb-7" style={{ color: 'rgba(242,241,234,0.55)', letterSpacing: '0.34em' }}>
            Wealth &amp; Budget
          </p>

          {children}
        </div>

      </div>
    </div>
  );
}
