'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useUser } from './UserProvider';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

/**
 * Sends one page-view beacon per route change to the API's cookie-less counter
 * (see apps/api/src/analytics). The referrer is only meaningful for the first
 * page of a visit; client-side navigations send none.
 */
export default function PageViewBeacon() {
  const pathname = usePathname();
  const { user, loading } = useUser();
  const first = useRef(true);
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || loading || lastSent.current === pathname) return;
    lastSent.current = pathname;
    // The first page of a visit carries the referrer and the landing query string (UTM tags);
    // later client-side navigations send neither.
    const body = JSON.stringify({
      path: pathname,
      referrer: first.current ? document.referrer : undefined,
      search: first.current ? window.location.search : undefined,
      entry: first.current,
      viewportWidth: window.innerWidth,
      signedIn: !!user,
      isDemo: !!user?.isDemo,
    });
    first.current = false;
    fetch(`${API}/analytics/view`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body, credentials: 'include', keepalive: true,
    }).catch(() => {});
  }, [pathname, loading, user]);

  return null;
}
