'use client';

import type { Insight } from '@/lib/reports/compute';
import { Empty } from './ui';

const TONE = { good: 'var(--color-green)', bad: 'var(--color-rose)', neutral: 'var(--color-sky)' } as const;

export default function InsightsList({ items }: { items: Insight[] }) {
  if (items.length === 0) return <Empty text="Nothing stands out yet. A few more weeks of transactions will give this page something to say." />;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((i) => (
        <li key={i.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5"
          style={{ background: `color-mix(in srgb, ${TONE[i.tone]} 6%, transparent)`, border: `1px solid color-mix(in srgb, ${TONE[i.tone]} 22%, transparent)` }}>
          <span aria-hidden="true" className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: TONE[i.tone] }} />
          <p className="text-[13px] leading-snug" style={{ color: 'var(--color-text-primary)' }}>{i.text}</p>
        </li>
      ))}
    </ul>
  );
}
