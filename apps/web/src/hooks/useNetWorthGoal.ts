'use client';

import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export interface NetWorthGoal {
  target: number;
  current: number;
  targetDate: string | null;
  baselineValue: number | null;
  baselineDate: string | null;
  onTrackPct: number | null;
  projectedDate: string | null;
}

export function useNetWorthGoal() {
  const [data, setData] = useState<NetWorthGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/net-worth-goal`, { credentials: 'include' });
      if (!res.ok) throw new Error('request failed');
      setData(await res.json());
    } catch {
      setError('Could not load your net worth goal.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const setTargetDate = useCallback(async (targetDate: string | null): Promise<boolean> => {
    const res = await fetch(`${API}/net-worth-goal`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDate }),
    });
    if (res.ok) setData(await res.json());
    return res.ok;
  }, []);

  return { data, loading, error, reload, setTargetDate };
}
