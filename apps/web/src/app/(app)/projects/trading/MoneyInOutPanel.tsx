'use client';

import { money, panel } from '../TradingPerformance';
import type { MonthFlow } from '@/lib/projects/trading';
import { useNarrowScreen } from '@/hooks/useNarrowScreen';

const short = (key: string) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(key.slice(5, 7)) - 1];

export default function MoneyInOutPanel({ months }: { months: MonthFlow[] }) {
  const narrow = useNarrowScreen();
  const shown = months.slice(narrow ? -6 : -12);
  const max = Math.max(1, ...shown.flatMap((m) => [m.in, m.out]));
  const totalIn = shown.reduce((s, m) => s + m.in, 0), totalOut = shown.reduce((s, m) => s + m.out, 0);
  if (totalIn === 0 && totalOut === 0) return null;
  const H = 120;
  return (
    <div className="p-3 sm:p-4" style={panel} data-testid="money-in-out">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <p className="text-fine font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Money in & out by month</p>
        <div className="flex items-center gap-3 text-fine" style={{ color: 'var(--color-text-muted)' }}>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--color-green)' }} />to you {money(totalOut)}</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--color-rose)' }} />from you {money(totalIn)}</span>
        </div>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map((m) => (
          <div key={m.month} className="flex flex-col items-center gap-1 min-w-0">
            <div className="w-full flex items-end justify-center gap-0.5" style={{ height: H }} title={`${short(m.month)}: to you ${money(m.out)} · from you ${money(m.in)}`}>
              <div className="w-[38%] rounded-t" style={{ height: `${(m.out / max) * 100}%`, background: 'var(--color-green)', opacity: 0.85 }} />
              <div className="w-[38%] rounded-t" style={{ height: `${(m.in / max) * 100}%`, background: 'var(--color-rose)', opacity: 0.85 }} />
            </div>
            <span className="text-fine" style={{ color: m.in || m.out ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>{short(m.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
