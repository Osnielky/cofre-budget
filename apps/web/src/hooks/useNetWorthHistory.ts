'use client';

import type { HistoryPoint } from '@/lib/goals/history';
import { useApi } from './useApi';

const NONE: { points: HistoryPoint[] } = { points: [] };

/** Cached (hooks/useApi): Goals and Reports both read it. */
export function useNetWorthHistory() {
  const { data, loading, error } = useApi<{ points: HistoryPoint[] }>('/net-worth-goal/history', NONE);
  return { points: data?.points ?? [], loading, error: error ? 'Could not load your net worth history.' : null };
}
