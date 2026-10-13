'use client';

import { useEffect, useState } from 'react';
import Panel, { PanelEmpty } from '@/components/dashboard/Panel';
import { useAdminUsers } from '@/hooks/useAdmin';
import { relativeTime } from '@/lib/admin/format';
import type { AdminUserRow } from '@/lib/admin/types';

const PLAN = { free: 'Basic', pro: 'Pro', elite: 'Elite' } as const;
const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const sub = (u: AdminUserRow) => `${PLAN[u.plan]}${u.subscriptionStatus ? ` · ${u.subscriptionStatus.replace('_', ' ')}` : ''}`;

export default function UsersTable() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useAdminUsers(search, page);

  // Debounce typing; a new search always starts on page 1.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(input); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Panel title="Users" subtitle={data ? `${data.total.toLocaleString()} total` : undefined}
      legend={
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search email or name"
          aria-label="Search users" maxLength={100}
          className="px-3 py-1.5 rounded-lg text-sm outline-none w-full sm:w-64"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
      }>
      {error ? <PanelEmpty message={error} />
        : !data || (loading && !data.rows.length) ? <PanelEmpty message="Loading…" />
        : data.rows.length === 0 ? <PanelEmpty message="No users match." />
        : (
          <div className="flex flex-col gap-3" style={{ opacity: loading ? 0.6 : 1 }}>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                    {['User', 'Plan', 'Sign-up', 'Joined', 'Last seen', 'Banks', 'Transactions'].map((h) => (
                      <th key={h} className="py-2 pr-4 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((u) => (
                    <tr key={u.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td className="py-2.5 pr-4 min-w-0">
                        <p className="font-semibold truncate max-w-64">{u.name || '—'}</p>
                        <p className="text-xs truncate max-w-64" style={{ color: 'var(--color-text-muted)' }}>
                          {u.email}{u.emailVerified ? '' : ' · unverified'}
                        </p>
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">{sub(u)}</td>
                      <td className="py-2.5 pr-4 capitalize">{u.signupMethod}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">{date(u.createdAt)}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">{relativeTime(u.lastSeenAt)}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{u.bankLinks}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{u.transactions.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone cards */}
            <div className="md:hidden flex flex-col gap-2">
              {data.rows.map((u) => (
                <div key={u.id} className="rounded-xl p-3 text-sm" style={{ border: 'var(--glass-border)' }}>
                  <p className="font-semibold truncate">{u.name || '—'}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{u.email}{u.emailVerified ? '' : ' · unverified'}</p>
                  <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                    {sub(u)} · {u.signupMethod} · joined {date(u.createdAt)}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    Seen {relativeTime(u.lastSeenAt)} · {u.bankLinks} banks · {u.transactions.toLocaleString()} tx
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <span>Page {data.page} of {lastPage}</span>
              <div className="flex gap-2">
                {[{ label: '‹ Prev', to: data.page - 1, off: data.page <= 1 }, { label: 'Next ›', to: data.page + 1, off: data.page >= lastPage }].map((b) => (
                  <button key={b.label} type="button" disabled={b.off} onClick={() => setPage(b.to)}
                    className="px-3 py-1.5 rounded-lg font-semibold cursor-pointer disabled:opacity-30 disabled:cursor-default"
                    style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
    </Panel>
  );
}
