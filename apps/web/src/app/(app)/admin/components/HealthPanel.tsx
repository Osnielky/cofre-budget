'use client';

import Panel from '@/components/dashboard/Panel';
import { useThemeColors } from '@/components/ThemeProvider';
import type { AdminStats } from '@/lib/admin/types';
import { Row } from './AdminStatTiles';

const LOGS_URL =
  'https://console.cloud.google.com/logs/query;query=resource.labels.service_name%3D%22cofre-api%22%0Aseverity%3E%3DERROR?project=cofre-dev';

export default function HealthPanel({ h }: { h: AdminStats['health'] }) {
  const tc = useThemeColors();
  return (
    <Panel title="System health">
      <div className="flex flex-col">
        <Row label="Bank connections in error" value={h.plaidErrors.total} tone={h.plaidErrors.total ? tc.rose : tc.green} />
        {h.plaidErrors.byCode.map((c) => (
          <Row key={c.code} label={`· ${c.code}`} value={c.count} />
        ))}
        <Row label="Past-due subscriptions" value={h.pastDueSubscriptions} tone={h.pastDueSubscriptions ? tc.amber : undefined} />
      </div>
      <a href={LOGS_URL} target="_blank" rel="noopener noreferrer"
        className="text-xs font-semibold mt-1 hover:underline" style={{ color: 'var(--color-primary)' }}>
        Open API errors in Cloud Logging ↗
      </a>
    </Panel>
  );
}
