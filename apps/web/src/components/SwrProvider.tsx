'use client';

import { SWRConfig } from 'swr';
import { DEDUPE_MS } from '@/hooks/useApi';

/* One client cache for the whole app (see hooks/useApi). The options here are
   the defaults every useApi call inherits; the cache itself is SWR's global
   map, which lives for the tab and is emptied on logout (lib/api/cache). */
export default function SwrProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: DEDUPE_MS, keepPreviousData: true, shouldRetryOnError: false }}>
      {children}
    </SWRConfig>
  );
}
