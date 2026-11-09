'use client';

import StatTile from '@/components/StatTile';
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

/* The four debt figures on the shared StatTile; the net position's value takes the
   green / rose tone of its sign. */
export default function StatsRow({ netPosition, owedToYou, owedToYouCount, youOwe, youOweCount, dueThisMonth, dueThisMonthCount }: Props) {
  const tc = useThemeColors();
  const netColor = netPosition >= 0 ? tc.green : tc.rose;
  const cards: { label: string; value: string; sub: string; accent: string; valueTone?: string; icon: string; rotate: number }[] = [
    { label: 'Net Position', value: money(netPosition), sub: 'Receivables minus debts', accent: netColor, valueTone: netColor, icon: ICON_WALLET, rotate: 0 },
    { label: 'Owed to You', value: `$${fmt(owedToYou)}`, sub: `${owedToYouCount} active loan${owedToYouCount === 1 ? '' : 's'}`, accent: tc.green, icon: ICON_ARROW, rotate: 0 },
    { label: 'You Owe', value: `$${fmt(youOwe)}`, sub: `${youOweCount} active loan${youOweCount === 1 ? '' : 's'}`, accent: tc.violet, icon: ICON_ARROW, rotate: 180 },
    { label: 'Due This Month', value: `$${fmt(dueThisMonth)}`, sub: `${dueThisMonthCount} payment${dueThisMonthCount === 1 ? '' : 's'}`, accent: tc.sky, icon: ICON_CALENDAR, rotate: 0 },
  ];
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
      {cards.map((c) => (
        <StatTile key={c.label} label={c.label} value={c.value} sub={c.sub} accent={c.accent}
          valueTone={c.valueTone}
          icon={<Icon d={c.icon} rotate={c.rotate} />} />
      ))}
    </div>
  );
}
