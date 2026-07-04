'use client';

import Panel, { PanelEmpty } from '../Panel';

export default function RecurringTimelinePanel() {
  return (
    <Panel title="Recurring Expenses" subtitle="Upcoming">
      <PanelEmpty message="Recurring-payment detection is coming soon. Cofre will spot repeating charges (rent, Netflix, insurance) and preview them here." />
    </Panel>
  );
}
