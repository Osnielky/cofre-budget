'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminStats, AdminUsersPage } from '@/lib/admin/types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export function useAdminStats() {
  const [data, setData] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${API}/admin/stats`, { credentials: 'include' })
      .then(async (r) => {
        if (r.status === 404) { setNotFound(true); return; }
        if (!r.ok) throw new Error(`Could not load stats (${r.status}).`);
        setData(await r.json());
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);
  return { data, loading, notFound, error, reload };
}

export function useAdminUsers(search: string, page: number) {
  const [data, setData] = useState<AdminUsersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ page: String(page) });
    if (search.trim()) qs.set('search', search.trim());
    fetch(`${API}/admin/users?${qs}`, { credentials: 'include', signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Could not load users (${r.status}).`);
        setData(await r.json());
      })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [search, page]);

  return { data, loading, error };
}
