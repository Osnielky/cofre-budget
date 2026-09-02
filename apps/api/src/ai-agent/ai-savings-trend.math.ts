export interface MonthlyNet { month: string; net: number }

/**
 * Projects the last entry in `monthlyNets` (assumed to be the current,
 * possibly-partial month) to a full-month figure using the elapsed-day
 * fraction, and averages the actual (unprojected) net across all entries.
 */
export function computeSavingsTrend(monthlyNets: MonthlyNet[], now: Date): { projected: number; sixMonthAvg: number } {
  const current = monthlyNets.at(-1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const frac = now.getDate() / daysInMonth;
  const projected = current && frac > 0 ? +(current.net / frac).toFixed(2) : (current?.net ?? 0);

  const sixMonthAvg = monthlyNets.length > 0
    ? +(monthlyNets.reduce((s, m) => s + m.net, 0) / monthlyNets.length).toFixed(2)
    : 0;

  return { projected, sixMonthAvg };
}
