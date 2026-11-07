'use client';

import { useCallback } from 'react';
import { useApi } from './useApi';
import { API } from '@/lib/api/client';

export interface NetWorthGoal {
  target: number;
  current: number;
  targetDate: string | null;
  baselineValue: number | null;
  baselineDate: string | null;
  onTrackPct: number | null;
  projectedDate: string | null;
}

/** Cached (hooks/useApi): the dashboard panel and the Goals page share one read. */
export function useNetWorthGoal() {
  const { data, loading, error, mutate } = useApi<NetWorthGoal | null>('/net-worth-goal', null);

  const reload = useCallback(() => { void mutate(); }, [mutate]);

  const setTargetDate = useCallback(async (targetDate: string | null): Promise<boolean> => {
    const res = await fetch(`${API}/net-worth-goal`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDate }),
    });
    if (res.ok) await mutate(await res.json(), { revalidate: false });
    return res.ok;
  }, [mutate]);

  return { data, loading, error: error ? 'Could not load your net worth goal.' : null, reload, setTargetDate };
}
