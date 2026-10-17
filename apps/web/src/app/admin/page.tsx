'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useAdminStats } from '@/hooks/useAdmin';
import AdminStatTiles from './components/AdminStatTiles';
import SignupsChart from './components/SignupsChart';
import PlansPanel from './components/PlansPanel';
import EngagementPanel from './components/EngagementPanel';
import HealthPanel from './components/HealthPanel';
import UsersTable from './components/UsersTable';

export default function AdminPage() {
  const { data, loading, notFound, error, reload } = useAdminStats();
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => { reload(); setRefreshKey((k) => k + 1); };

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto pt-14 md:pt-0">
        <div className="px-4 sm:px-6 md:px-8 py-6 flex flex-col gap-5">
          {notFound ? (
            <div className="flex-1 min-h-[50vh] flex flex-col items-center justify-center text-center gap-2">
              <p className="text-2xl font-bold">Not found</p>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>This page does not exist.</p>
            </div>
          ) : (
            <>
              {!data && loading && (
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
              )}
              {data && (
              <div className="flex items-end justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="font-bold tracking-tight" style={{ fontSize: 'clamp(26px, 3vw, 38px)' }}>Admin</h1>
                  <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    {`Updated ${new Date(data.generatedAt).toLocaleTimeString()}`}
                  </p>
                </div>
                <button type="button" onClick={refresh} disabled={loading}
                  className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-40"
                  style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
              )}

              {error && (
                <div className="flex items-center justify-between gap-4 rounded-2xl px-5 py-3.5 flex-wrap"
                  style={{ background: 'color-mix(in srgb, var(--color-rose) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 25%, transparent)' }}>
                  <span className="text-sm" style={{ color: 'var(--color-rose)' }}>{error}</span>
                  <button type="button" onClick={reload} className="text-xs font-semibold uppercase cursor-pointer" style={{ color: 'var(--color-rose)' }}>Retry</button>
                </div>
              )}

              {data && (
                <>
                  <AdminStatTiles s={data} />
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                    {/* Panel's colSpan={2} only spans at xl, so the wide panels are wrapped to span a full row at md; Engagement fills the odd cell at md and sits beside Users at xl. */}
                    <div className="md:col-span-2 xl:col-span-2 min-w-0 flex flex-col [&>*]:flex-1"><SignupsChart weeks={data.users.weeklySignups} /></div>
                    <PlansPanel r={data.revenue} />
                    <HealthPanel h={data.health} />
                    <div className="md:col-span-2 xl:col-span-1 min-w-0 flex flex-col [&>*]:flex-1"><EngagementPanel e={data.engagement} total={data.users.total} /></div>
                    <div className="md:col-span-2 xl:col-span-3 min-w-0 flex flex-col [&>*]:flex-1"><UsersTable refreshKey={refreshKey} /></div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
