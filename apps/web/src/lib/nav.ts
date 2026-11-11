/* The app's page map (CLAUDE.md → lib/nav.ts). One list, grouped by the job the
   pages do, that every navigation surface reads — the sidebar, the phone tab
   bar and its More sheet, the command palette — so a page is never added to
   one and forgotten in another.

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

/** The pages that are not in NAV_GROUPS but still have a title in the shell. */
export const ACCOUNT_PAGES: { label: string; href: string }[] = [
  { label: 'Settings', href: '/settings' },
  { label: 'Admin', href: '/admin' },
];

/** `/settings/plaid-oauth-redirect` still lights up Settings; `/cards` never lights up `/c`. */
export function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* ── Phones ──
   The bottom tab bar holds the four pages a person opens most days; everything
   else sits one tap away in the More sheet, in sidebar order. */

export const PHONE_TAB_HREFS = ['/dashboard', '/transactions', '/budgets', '/ask-cofre'] as const;

export function phoneTabs(): NavItem[] {
  return PHONE_TAB_HREFS.flatMap((href) => NAV_ITEMS.filter((i) => i.href === href));
}

export function phoneMoreItems(): NavItem[] {
  const tabs = new Set<string>(PHONE_TAB_HREFS);
  return NAV_ITEMS.filter((i) => !tabs.has(i.href));
}

/** Which tab lights up: a tab's href, 'more' for any other app page, null off the map. */
export function activePhoneTab(pathname: string | null): string | 'more' | null {
  const tab = PHONE_TAB_HREFS.find((href) => isNavActive(pathname, href));
  if (tab) return tab;
  const elsewhere = [...phoneMoreItems(), ...ACCOUNT_PAGES].some((i) => isNavActive(pathname, i.href));
  return elsewhere ? 'more' : null;
}

/** The title the phone top bar shows for a route: the page's nav label, else the app name. */
export function pageTitleFor(pathname: string | null): string {
  const page = [...NAV_ITEMS, ...ACCOUNT_PAGES].find((i) => isNavActive(pathname, i.href));
  return page?.label ?? 'Cofre';
}
