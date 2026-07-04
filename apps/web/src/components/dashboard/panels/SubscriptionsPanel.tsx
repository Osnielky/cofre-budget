'use client';

import Panel, { PanelEmpty } from '../Panel';

export default function SubscriptionsPanel() {
  return (
    <Panel title="Subscriptions" subtitle="Overview" colSpan={2}>
      <PanelEmpty message="Subscription tracking is coming soon. Once recurring detection lands, cofre will total your subscriptions, count active services, and flag price increases here." />
    </Panel>
  );
}
