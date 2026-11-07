'use client';

import { useEffect, useRef } from 'react';
import { SWRConfig } from 'swr';
import { DEDUPE_MS } from '@/hooks/useApi';
import { clearApiCache } from '@/lib/api/cache';
import { useUser } from './UserProvider';

/* One client cache for the whole app (see hooks/useApi). The options here are
   the defaults every useApi call inherits; the cache itself is SWR's global
   map, which lives for the tab.

   It is emptied whenever the signed-in user changes (logout, or a login as
   someone else in the same tab), so one account's lists can never paint under
   another's session. The first value of the user (unknown → known) is not a
   change, so a normal page load does not refetch. */
export default function SwrProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const known = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (loading) return;
    const id = user?.id ?? null;
    if (known.current !== undefined && known.current !== id) void clearApiCache();
    known.current = id;
  }, [user?.id, loading]);

  return (
    <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: DEDUPE_MS, keepPreviousData: true, shouldRetryOnError: false }}>
      {children}
    </SWRConfig>
  );
}
