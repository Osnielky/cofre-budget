/* The icons of the page map (lib/nav.ts), shared by the sidebar, the phone tab bar
   and its More sheet. One stroke style (1.5 at 19px), sized by the surface. */

import type { JSX } from 'react';
import type { NavIcon } from '@/lib/nav';

export interface IconProps { size?: number }

const svgProps = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const,
});

export function DashboardIcon({ size = 19 }: IconProps) {
  return <svg {...svgProps(size)}><path d="M3 12l9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></svg>;
}

export function AskCofreIcon({ size = 19 }: IconProps) {
  /* Fixed-colour brand asset, not a themed vector icon. */
  return <img src="/ask-cofre-logo.png" alt="" width={size} height={size} style={{ objectFit: 'contain' }} />;
}

export function GoalsIcon({ size = 19 }: IconProps) {
  return <svg {...svgProps(size)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /></svg>;
}

export function TransactionsIcon({ size = 19 }: IconProps) {
  return <svg {...svgProps(size)}><path d="M3 6h18M3 12h18M3 18h12" /></svg>;
}

export function ReportsIcon({ size = 19 }: IconProps) {
  return <svg {...svgProps(size)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
}

export function BudgetsIcon({ size = 19 }: IconProps) {
  return <svg {...svgProps(size)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>;
}

export function ProjectsIcon({ size = 19 }: IconProps) {
  return <svg {...svgProps(size)}><path d="M4 19V5M9.3 19V9m5.4 10v-7M20 19V7" /></svg>;
}

export function CardsIcon({ size = 19 }: IconProps) {
  return <svg {...svgProps(size)}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M6 15h4" /></svg>;
}

export function DebtsIcon({ size = 19 }: IconProps) {
  return <svg {...svgProps(size)}><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>;
}

export function SettingsIcon({ size = 19 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function AdminIcon({ size = 19 }: IconProps) {
  return <svg {...svgProps(size)}><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg>;
}

export function LifeBuoyIcon({ size = 18 }: IconProps) {
  return (
    <svg {...svgProps(size)} strokeWidth={1.8}>
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
      <path d="M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M9.17 14.83l-4.24 4.24" />
    </svg>
  );
}

export function MoreIcon({ size = 19 }: IconProps) {
  return <svg {...svgProps(size)}><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></svg>;
}

export function SignOutIcon({ size = 13 }: IconProps) {
  return (
    <svg {...svgProps(size)} strokeWidth={2.5}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export const NAV_ICONS: Record<NavIcon, (p: IconProps) => JSX.Element> = {
  'dashboard': DashboardIcon, 'ask-cofre': AskCofreIcon,
  'transactions': TransactionsIcon, 'budgets': BudgetsIcon, 'reports': ReportsIcon,
  'goals': GoalsIcon, 'cards': CardsIcon, 'debts': DebtsIcon, 'projects': ProjectsIcon,
};
