import { describe, it, expect } from 'vitest';
import { generateDemoData, type DemoData } from './demo-seed';

const opts = { year: 2026, today: '2026-10-20' };

function inYear(date: string) { return date >= '2026-01-01' && date <= '2026-12-31'; }

describe('generateDemoData', () => {
  const data: DemoData = generateDemoData(opts);

  it('is deterministic for the same inputs', () => {
    expect(generateDemoData(opts)).toEqual(data);
  });

  it('covers the whole year with a realistic volume', () => {
    expect(data.transactions.length).toBeGreaterThanOrEqual(900);
    expect(data.transactions.every((t) => inYear(t.date))).toBe(true);
    const months = new Set(data.transactions.map((t) => t.date.slice(0, 7)));
    expect(months.size).toBe(12);
  });

  it('only references accounts and categories it defines', () => {
    const accounts = new Set(data.accounts.map((a) => a.key));
    const categories = new Set(data.categories.map((c) => c.name));
    for (const t of data.transactions) {
      expect(accounts.has(t.accountKey)).toBe(true);
      if (t.category != null) expect(categories.has(t.category)).toBe(true);
    }
  });

  it('pairs every transfer so the two sides cancel out', () => {
    const byPair = new Map<string, number[]>();
    for (const t of data.transactions) {
      if (!t.transferPairKey) continue;
      byPair.set(t.transferPairKey, [...(byPair.get(t.transferPairKey) ?? []), t.amount]);
    }
    expect(byPair.size).toBeGreaterThan(20);
    for (const [, amounts] of byPair) {
      expect(amounts).toHaveLength(2);
      expect(Math.abs(amounts[0] + amounts[1])).toBeLessThan(0.005);
    }
  });

  it('reports each account balance as of today, consistent with its transactions', () => {
    for (const a of data.accounts) {
      const effect = data.transactions
        .filter((t) => t.accountKey === a.key && t.date <= opts.today)
        .reduce((s, t) => s + t.amount, 0);
      const expected = a.liability ? a.openingBalance - effect : a.openingBalance + effect;
      expect(a.balance).toBeCloseTo(expected, 2);
    }
  });

  it('budgets every month of the year', () => {
    const perMonth = new Map<string, number>();
    for (const b of data.budgets) perMonth.set(b.month, (perMonth.get(b.month) ?? 0) + 1);
    expect(perMonth.size).toBe(12);
    for (const [, n] of perMonth) expect(n).toBeGreaterThanOrEqual(9);
  });

  it('marks recurring rules as already materialised for the year', () => {
    expect(data.recurringRules).toHaveLength(5);
    for (const r of data.recurringRules) {
      expect(r.lastRunDate).toBeTruthy();
      expect(r.lastRunDate! <= '2026-12-31').toBe(true);
      expect(r.runCount).toBe(12);
    }
  });

  it('snapshots net worth on the 1st of each month up to today, rising over the year', () => {
    const dates = data.netWorthSnapshots.map((s) => s.date);
    expect(dates[0]).toBe('2026-01-01');
    expect(dates.at(-1)).toBe('2026-10-01');
    expect(dates.every((d) => d.endsWith('-01'))).toBe(true);
    const first = data.netWorthSnapshots[0].value;
    const last = data.netWorthSnapshots.at(-1)!.value;
    expect(last).toBeGreaterThan(first);
  });

  it('links project transactions to a project category of that project', () => {
    for (const t of data.transactions.filter((t) => t.projectKey)) {
      const p = data.projects.find((p) => p.key === t.projectKey)!;
      expect(p).toBeTruthy();
      if (t.projectCategoryName) expect(p.categories.some((c) => c.name === t.projectCategoryName)).toBe(true);
    }
    expect(data.projects.some((p) => p.status === 'sold' && p.salePrice != null)).toBe(true);
  });

  it('leaves a few transactions uncategorized each month for the review flow', () => {
    const uncat = data.transactions.filter((t) => t.category == null && !t.transferPairKey && !t.projectKey);
    expect(uncat.length).toBeGreaterThanOrEqual(12);
  });
});
