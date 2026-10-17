'use client';

import { useEffect, useState } from 'react';
import type { HistoryPoint } from '@/lib/goals/history';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export function useNetWorthHistory() {
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/net-worth-goal/history`, { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error('request failed'); return r.json(); })
      .then((body: { points: HistoryPoint[] }) => { if (!cancelled) setPoints(body.points ?? []); })
      .catch(() => { if (!cancelled) setError('Could not load your net worth history.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { points, loading, error };
}
