/* The cache keys the dashboard reads (hooks/useApi: one SWR entry per API path).
   They live here so the signed-in layout can start the same requests the moment
   the shell mounts (components/PrefetchAppData.tsx) — a page that then asks for
   the same key joins the request in flight instead of starting its own. The
   strings must match useDashboardData byte for byte, which is why both read
   them from here. */

export const YEAR_LIST_LIMIT = 5000;

/** Jan 1 of the viewer's local year → today (UTC date), the range the dashboard loads once. */
export function yearRange(today: Date = new Date()): { from: string; to: string } {
  return { from: `${today.getFullYear()}-01-01`, to: today.toISOString().slice(0, 10) };
}

/** The month the dashboard opens on: today's UTC month. */
export function currentMonth(today: Date = new Date()): string {
  return today.toISOString().slice(0, 7);
}

export function transactionsKey(from: string, to: string): string {
  return `/transactions?from=${from}&to=${to}&limit=${YEAR_LIST_LIMIT}`;
}

export function budgetsKey(month: string): string {
  return `/budgets?month=${month}`;
}

/** Lists several pages share; the layout warms them along with the dashboard's own. */
export const SHARED_LIST_KEYS = ['/bank-accounts', '/projects', '/debts'] as const;

/** Every key the dashboard needs on first paint, for the layout's prefetch. */
export function dashboardKeys(today: Date = new Date()): string[] {
  const { from, to } = yearRange(today);
  return [transactionsKey(from, to), budgetsKey(currentMonth(today)), ...SHARED_LIST_KEYS];
}
