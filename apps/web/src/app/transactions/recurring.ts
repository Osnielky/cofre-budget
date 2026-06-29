export interface RecurringInfo {
  normalized: string;
  displayName: string;
  occurrences: { date: string; month: string; amount: number }[];
  medianAmount: number;
  frequency: 'weekly' | 'monthly' | 'irregular';
}

export interface TxSlice {
  name: string;
  amount: number | string;
  date: string;
}

export function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+conf#\S+/gi, '')           // strip confirmation codes
    .replace(/\s+\d{4,}\S*/g, '')           // strip long numeric codes
    .replace(/\s+[a-z]{2}$/i, '')           // strip trailing state abbrev
    .replace(/[^a-z0-9\s]/g, '')            // strip special characters
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildRecurringMap(transactions: TxSlice[]): Map<string, RecurringInfo> {
  const groups = new Map<string, { raw: string; amounts: number[]; dates: string[] }>();

  for (const tx of transactions) {
    const key = normalize(tx.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { raw: tx.name, amounts: [], dates: [] });
    const g = groups.get(key)!;
    g.amounts.push(Math.abs(Number(tx.amount)));
    g.dates.push(tx.date);
  }

  const result = new Map<string, RecurringInfo>();

  for (const [key, g] of groups) {
    const months = new Set(g.dates.map((d) => d.slice(0, 7)));
    if (months.size < 2) continue;

    const sorted = [...g.dates].sort();
    const intervals = sorted.slice(1).map((d, i) => {
      const diff = new Date(d).getTime() - new Date(sorted[i]).getTime();
      return diff / (1000 * 60 * 60 * 24);
    });
    const avg = intervals.length > 0 ? intervals.reduce((a, b) => a + b) / intervals.length : 30;
    const frequency: RecurringInfo['frequency'] =
      avg <= 10 ? 'weekly' : avg <= 35 ? 'monthly' : 'irregular';

    const sortedAmts = [...g.amounts].sort((a, b) => a - b);
    const medianAmount = sortedAmts[Math.floor(sortedAmts.length / 2)];

    const occurrences = g.dates
      .map((date, i) => ({ date, month: date.slice(0, 7), amount: g.amounts[i] }))
      .sort((a, b) => b.date.localeCompare(a.date));

    result.set(key, {
      normalized: key,
      displayName: g.raw,
      occurrences,
      medianAmount,
      frequency,
    });
  }

  return result;
}
