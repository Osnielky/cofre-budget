'use client';

import Panel from '@/components/dashboard/Panel';
import { useThemeColors } from '@/components/ThemeProvider';
import type { AdminStats } from '@/lib/admin/types';
import { money } from '@/lib/admin/format';
import { Row } from './AdminStatTiles';

export default function PlansPanel({ r }: { r: AdminStats['revenue'] }) {
  const tc = useThemeColors();
  return (
    <Panel title="Plans & subscriptions">
      <div className="flex flex-col">
        <Row label="Free" value={r.plans.free} />
        <Row label="Pro" value={r.plans.pro} />
        <Row label="Elite" value={r.plans.elite} />
        <Row label="Active subscriptions" value={r.subscriptions.active} />
        <Row label="Trialing" value={r.subscriptions.trialing} />
        <Row label="Past due" value={r.subscriptions.past_due} tone={r.subscriptions.past_due ? tc.amber : undefined} />
        <Row label="Canceling at period end" value={r.cancelingAtPeriodEnd} />
        <Row label="New subscriptions (30d)" value={r.new30d} />
        <Row label="Canceled (30d)" value={r.canceled30d} />
        <Row label="Est. MRR" value={money(r.mrrEstimate)} />
      </div>
    </Panel>
  );
}
