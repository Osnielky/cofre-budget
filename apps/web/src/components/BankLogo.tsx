'use client';

import { useState } from 'react';
import type { Bank } from './BankSelect';

/* The one bank logo. Every account row, the bank picker and the dashboard's
   Accounts panel used to ask logo.clearbit.com first; that hostname no longer
   resolves, so each logo cost a failed DNS lookup (and a console error) before
   a fallback painted. The icon is now the bank's own favicon through Google's
   favicon service, and when that fails too, a lettermark in the bank's colour.
   A domain that failed once is remembered for the session so lists do not
   retry it on every row. */

const failed = new Set<string>();

export function faviconUrl(domain: string, size = 128): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

export default function BankLogo({ bank, size, radius = 6, className = '' }: {
  bank: Bank;
  size: number;
  radius?: number;
  className?: string;
}) {
  const [err, setErr] = useState(() => failed.has(bank.domain));

  if (err) {
    return (
      <span className={`inline-flex items-center justify-center shrink-0 font-black text-white select-none ${className}`}
        style={{ width: size, height: size, borderRadius: radius, background: bank.color, fontSize: Math.round(size * 0.36), lineHeight: 1 }}
        role="img" aria-label={bank.name}>
        {bank.abbr}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- third-party favicon by domain
    <img src={faviconUrl(bank.domain)} alt={bank.name} width={size} height={size} loading="lazy"
      className={`shrink-0 ${className}`}
      style={{ objectFit: 'contain', borderRadius: radius, display: 'block' }}
      onError={() => { failed.add(bank.domain); setErr(true); }} />
  );
}
