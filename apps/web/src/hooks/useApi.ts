'use client';

import useSWR, { type KeyedMutator } from 'swr';
import { apiGet } from '@/lib/api/client';

/* The app's client cache. One SWR entry per API path, shared by every page
   that asks for it: Dashboard → Transactions → Dashboard paints the second
   dashboard from cache and refreshes it in the background instead of
   downloading the year again. Pass `null` as the path to skip the request.

   `data` is never undefined: the caller's `fallback` stands in until the first
   response (and keeps the previous response across a key change, so a month
   change on the dashboard does not blank the page). `loading` is true only
   while there is no data for this key yet.

   A response younger than DEDUPE_MS is reused as is; older ones paint at once
   and revalidate in the background, so an edit made on another page shows up
   on the next visit without ever blanking the screen. */
export const DEDUPE_MS = 10_000;
export interface ApiState<T> {
  data: T;
  error: Error | undefined;
  loading: boolean;
  mutate: KeyedMutator<T>;
}

export function useApi<T>(path: string | null, fallback: T): ApiState<T> {
  const { data, error, isLoading, mutate } = useSWR<T>(path, (p: string) => apiGet<T>(p), {
    revalidateOnFocus: false,
    dedupingInterval: DEDUPE_MS,
    keepPreviousData: true,
    shouldRetryOnError: false,
  });
  return { data: data ?? fallback, error, loading: path != null && isLoading && data === undefined, mutate };
}
