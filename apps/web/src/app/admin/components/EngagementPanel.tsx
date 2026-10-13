'use client';

import Panel from '@/components/dashboard/Panel';
import type { AdminStats } from '@/lib/admin/types';
import { Row } from './AdminStatTiles';

export default function EngagementPanel({ e, total }: { e: AdminStats['engagement']; total: number }) {
  const pct = (n: number) => (total > 0 ? ` · ${Math.round((n / total) * 100)}%` : '');
  return (
    <Panel title="Engagement">
      <div className="flex flex-col">
        <Row label="Active today" value={e.active1d} />
        <Row label="Active 7 days" value={e.active7d} />
        <Row label="Active 30 days" value={e.active30d} />
        <Row label="Linked a bank" value={`${e.withBankLink}${pct(e.withBankLink)}`} />
        <Row label="Use budgets" value={`${e.withBudgets}${pct(e.withBudgets)}`} />
        <Row label="Use projects" value={`${e.withProjects}${pct(e.withProjects)}`} />
        <Row label="Set a $1M goal" value={`${e.withNetWorthGoal}${pct(e.withNetWorthGoal)}`} />
        <Row label="Transactions / active user (30d)" value={e.avgTransactionsPerActiveUser} />
        <Row label="AI conversations (30d)" value={e.aiConversations30d} />
        <Row label="AI messages (30d)" value={e.aiMessages30d} />
        <Row label="Receipts imported" value={e.receiptsTotal} />
      </div>
    </Panel>
  );
}
