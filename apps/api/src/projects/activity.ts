/* Per-project activity for the overview cards: when the project last moved and
   its net by month for the trailing window. Pure. */

export interface MonthNet { month: string; income: number; expenses: number; net: number }

export interface ActivitySummary {
  /** Latest linked transaction date, or null when nothing is linked. */
  lastActivity: string | null;
  /** The trailing `months` calendar months ending this month, oldest first, every month present. */
  monthly: MonthNet[];
}

const cents = (n: number) => Math.round(n * 100) / 100 + 0;

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function activitySummary(txs: { date: string; amount: number | string }[], months = 6, now = new Date()): ActivitySummary {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) keys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  const byMonth = new Map(keys.map((k) => [k, { month: k, income: 0, expenses: 0, net: 0 }]));
  let last: string | null = null;
  for (const t of txs) {
    if (!last || t.date > last) last = t.date;
    const m = byMonth.get(t.date.slice(0, 7));
    if (!m) continue;
    const a = Number(t.amount) || 0;
    if (a >= 0) m.income += a; else m.expenses += -a;
    m.net += a;
  }
  return {
    lastActivity: last,
    monthly: keys.map((k) => { const m = byMonth.get(k)!; return { month: k, income: cents(m.income), expenses: cents(m.expenses), net: cents(m.net) }; }),
  };
}
