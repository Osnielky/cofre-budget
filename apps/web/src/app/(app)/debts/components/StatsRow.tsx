'use client';

import { useThemeColors } from '@/components/ThemeProvider';
import { fmt } from '../format';

function Icon({ d, rotate }: { d: string; rotate?: number }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}>
      <path d={d} />
    </svg>
  );
}
const ICON_WALLET = 'M21 12V7H5a2 2 0 0 1 0-4h14v4 M3 5v14a2 2 0 0 0 2 2h16v-5 M18 12a2 2 0 0 0 0 4h4v-4Z';
const ICON_ARROW = 'M7 17L17 7 M7 7h10v10';
const ICON_CALENDAR = 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z';

function money(n: number) { return `${n < 0 ? '-' : ''}$${fmt(n)}`; }

interface Props {
  netPosition: number;
  owedToYou: number; owedToYouCount: number;
  youOwe: number; youOweCount: number;
  dueThisMonth: number; dueThisMonthCount: number;
}

export default function StatsRow({ netPosition, owedToYou, owedToYouCount, youOwe, youOweCount, dueThisMonth, dueThisMonthCount }: Props) {
  const tc = useThemeColors();
  const netColor = netPosition >= 0 ? tc.green : tc.rose;
  const cards = [
    { label: 'Net Position', value: money(netPosition), sub: 'Receivables minus debts', accent: netColor, icon: ICON_WALLET, rotate: 0 },
    { label: 'Owed to You', value: `$${fmt(owedToYou)}`, sub: `${owedToYouCount} active loan${owedToYouCount === 1 ? '' : 's'}`, accent: tc.green, icon: ICON_ARROW, rotate: 0 },
    { label: 'You Owe', value: `$${fmt(youOwe)}`, sub: `${youOweCount} active loan${youOweCount === 1 ? '' : 's'}`, accent: tc.violet, icon: ICON_ARROW, rotate: 180 },
    { label: 'Due This Month', value: `$${fmt(dueThisMonth)}`, sub: `${dueThisMonthCount} payment${dueThisMonthCount === 1 ? '' : 's'}`, accent: tc.sky, icon: ICON_CALENDAR, rotate: 0 },
  ];
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="p-4 rounded-2xl flex flex-col gap-2.5"
          style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `color-mix(in srgb, ${c.accent} 18%, transparent)`, color: c.accent }}>
              <Icon d={c.icon} rotate={c.rotate} />
            </span>
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{c.label}</span>
          </div>
          <span className="text-xl font-extrabold leading-none tabular-nums">{c.value}</span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{c.sub}</span>
        </div>
      ))}
    </div>
  );
}
