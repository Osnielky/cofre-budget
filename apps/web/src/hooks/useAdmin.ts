'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminStats, AdminUsersPage, AdminTraffic, AdminTicket, AdminTicketPage, TicketStatus } from '@/lib/admin/types';

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

export function useAdminUsers(search: string, page: number, refreshKey = 0) {
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
  }, [search, page, refreshKey]);

  return { data, loading, error };
}

/** POST /admin/demo/reset-owner — rebuilds the Rockefeller demo account from the seed. */
export async function resetDemoOwner(): Promise<void> {
  const r = await fetch(`${API}/admin/demo/reset-owner`, { method: 'POST', credentials: 'include' });
  if (!r.ok) throw new Error(`Could not reset the demo account (${r.status}).`);
}

export function useAdminTraffic(refreshKey = 0) {
  const [data, setData] = useState<AdminTraffic | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    fetch(`${API}/admin/traffic`, { credentials: 'include', signal: ctrl.signal })
      .then(async (r) => { if (!r.ok) throw new Error(`Could not load traffic (${r.status}).`); setData(await r.json()); })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => ctrl.abort();
  }, [refreshKey]);
  return { data, error };
}

export function useAdminTickets(status: TicketStatus | 'all', page: number, refreshKey = 0) {
  const [data, setData] = useState<AdminTicketPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    const qs = new URLSearchParams({ page: String(page) });
    if (status !== 'all') qs.set('status', status);
    fetch(`${API}/admin/tickets?${qs}`, { credentials: 'include', signal: ctrl.signal })
      .then(async (r) => { if (!r.ok) throw new Error(`Could not load tickets (${r.status}).`); setData(await r.json()); })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => ctrl.abort();
  }, [status, page, refreshKey]);
  return { data, error };
}

export async function fetchAdminTicket(id: string): Promise<AdminTicket> {
  const r = await fetch(`${API}/admin/tickets/${id}`, { credentials: 'include' });
  if (!r.ok) throw new Error(r.status === 404 ? 'That ticket no longer exists.' : `Could not load the ticket (${r.status}).`);
  return r.json();
}

export async function patchAdminTicket(id: string, body: { status?: TicketStatus; reply?: string | null; adminNote?: string | null }): Promise<AdminTicket> {
  const r = await fetch(`${API}/admin/tickets/${id}`, {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `Could not update the ticket (${r.status}).`);
  return r.json();
}

/** The screenshot URL for an admin view (the API checks the admin allowlist). */
export const adminTicketScreenshotUrl = (id: string) => `${API}/support/tickets/${id}/screenshot`;
