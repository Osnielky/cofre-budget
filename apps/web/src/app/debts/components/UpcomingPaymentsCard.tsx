'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import Panel, { PanelEmpty } from '@/components/dashboard/Panel';
import { fmt, today } from '../format';
import type { Debt } from '../types';

const MAX_ROWS = 5;

function DatePill({ iso }: { iso: string }) {
  const [, m, d] = iso.split('-').map(Number);
  const month = new Date(2000, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
  return (
    <div className="w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0"
      style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
      <span className="text-[9px] font-bold uppercase leading-none" style={{ color: 'var(--color-text-muted)' }}>{month}</span>
      <span className="text-sm font-extrabold leading-tight">{d}</span>
    </div>
  );
}

function ArrowIcon({ out }: { out: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: out ? 'rotate(180deg)' : undefined }}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function UpcomingPaymentsCard({ debts }: { debts: Debt[] }) {
  const tc = useThemeColors();
  const t = today();
  const upcoming = debts
    .filter((d) => d.status === 'open' && !!d.dueDate && d.dueDate >= t)
    .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string))
    .slice(0, MAX_ROWS);
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long' });

  return (
    <Panel title="Upcoming Payments" subtitle={monthLabel}>
      {upcoming.length === 0 ? (
        <PanelEmpty message="No upcoming due dates on your open loans." />
      ) : (
        <div className="flex flex-col">
          {upcoming.map((d, i) => {
            const out = d.direction === 'owed';
            const color = out ? tc.violet : tc.green;
            return (
              <div key={d.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <DatePill iso={d.dueDate as string} />
                  {i < upcoming.length - 1 && (
                    <span className="flex-1 w-px my-1" style={{ minHeight: 20, borderLeft: '1px dashed var(--color-border)' }} />
                  )}
                </div>
                <div className="flex items-center gap-3 flex-1 min-w-0 pb-5">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
                    <ArrowIcon out={out} />
                  </span>
                  <span className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {out ? `You pay ${d.borrowerName}` : `${d.borrowerName} pays you`}
                  </span>
                  <span className="text-sm font-bold tabular-nums shrink-0" style={{ color }}>
                    {out ? '−' : '+'}${fmt(d.remaining)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
