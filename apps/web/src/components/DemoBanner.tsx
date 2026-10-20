'use client';

import Link from 'next/link';
import { useUser } from './UserProvider';

/** Fixed bottom strip shown only inside a public demo sandbox. Mounted from the root layout. */
export default function DemoBanner() {
  const { user } = useUser();
  if (!user?.isDemo) return null;
  return (
    <div role="status" className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-md z-[60] rounded-2xl px-4 py-3 flex items-center gap-3 text-sm"
      style={{ background: 'var(--popover-bg)', border: '1px solid color-mix(in srgb, var(--color-card-amber) 45%, transparent)', boxShadow: 'var(--glass-shadow)' }}>
      <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--color-card-amber)' }} />
      <p className="flex-1 min-w-0 leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
        <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>You’re in the demo.</span>{' '}
        Changes are discarded when you leave.
      </p>
      <Link href="/signup" className="btn-gold shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap">
        Create account
      </Link>
    </div>
  );
}
