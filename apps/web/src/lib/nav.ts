/* The app's page map (CLAUDE.md → lib/nav.ts). One list, grouped by the job the
   pages do, that every navigation surface reads — the sidebar today, the phone
   tab bar and the command palette next — so a page is never added to one and
   forgotten in another.

     Overview  Dashboard · Ask Cofre          where am I, and ask
     Money     Transactions · Budgets · Reports   the month's money
     Wealth    Goals · Cards · Debts · Projects   what builds or costs over years

   Icons are drawn by the surface (`icon` is a key into its own icon map); this
   file stays pure so it can be tested and imported anywhere. */

export type NavIcon =
  | 'dashboard' | 'ask-cofre'
  | 'transactions' | 'budgets' | 'reports'
  | 'goals' | 'cards' | 'debts' | 'projects';

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
}

export interface NavGroup {
  id: 'overview' | 'money' | 'wealth';
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview', label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
      { label: 'Ask Cofre', href: '/ask-cofre', icon: 'ask-cofre' },
    ],
  },
  {
    id: 'money', label: 'Money',
    items: [
      { label: 'Transactions', href: '/transactions', icon: 'transactions' },
      { label: 'Budgets', href: '/budgets', icon: 'budgets' },
      { label: 'Reports', href: '/reports', icon: 'reports' },
    ],
  },
  {
    id: 'wealth', label: 'Wealth',
    items: [
      { label: 'Goals', href: '/goals', icon: 'goals' },
      { label: 'Cards', href: '/cards', icon: 'cards' },
      { label: 'Debts', href: '/debts', icon: 'debts' },
      { label: 'Projects', href: '/projects', icon: 'projects' },
    ],
  },
];

/** Every page in sidebar order. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** `/settings/plaid-oauth-redirect` still lights up Settings; `/cards` never lights up `/c`. */
export function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
