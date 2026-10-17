'use client';

import type { AdminStats } from '@/lib/admin/types';
import { money } from '@/lib/admin/format';

const glass: React.CSSProperties = {
  background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)',
};

/** Label/value line used by every admin panel. */
export function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span className="font-semibold tabular-nums" style={{ color: tone ?? 'var(--color-text-primary)' }}>{value}</span>
    </div>
  );
}

export default function AdminStatTiles({ s }: { s: AdminStats }) {
  const paying = s.revenue.subscriptions.active;
  const tiles = [
    { label: 'Total users', value: s.users.total.toLocaleString(), sub: `${s.users.verified} verified` },
    { label: 'New (30 days)', value: s.users.new30d.toLocaleString(), sub: `${s.users.new7d} this week` },
    { label: 'Active (7 days)', value: s.engagement.active7d.toLocaleString(), sub: `${s.engagement.active1d} today` },
    { label: 'Est. MRR', value: money(s.revenue.mrrEstimate), sub: 'list prices, active subs' },
    { label: 'Paying subs', value: paying.toLocaleString(), sub: `${s.revenue.subscriptions.trialing} trialing` },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
      {tiles.map((t) => (
        <div key={t.label} className="card-lift rounded-2xl p-5 min-w-0" style={glass}>
          <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{t.label}</p>
          <p className="text-2xl font-bold tabular-nums mt-1 truncate">{t.value}</p>
          <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{t.sub}</p>
        </div>
      ))}
    </div>
  );
}
