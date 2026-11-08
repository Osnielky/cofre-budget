'use client';

import { useEffect } from 'react';
import { preload } from 'swr';
import { apiGet } from '@/lib/api/client';
import { dashboardKeys } from '@/lib/dashboard/keys';

/* Mounted once in the signed-in layout. The moment the shell is on screen it
   starts the requests the dashboard (and most other pages) will ask for, so by
   the time the page's code has loaded and its hooks mount, the responses are in
   flight or already cached — SWR dedupes the page's own call onto these. Keys
   are shared with useDashboardData through lib/dashboard/keys. */
export default function PrefetchAppData() {
  useEffect(() => {
    for (const key of dashboardKeys()) void preload(key, (p: string) => apiGet(p)).catch(() => undefined);
  }, []);
  return null;
}
