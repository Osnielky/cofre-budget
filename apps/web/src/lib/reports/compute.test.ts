import { describe, it, expect } from 'vitest';
import type { Transaction, Category } from '@/lib/dashboard/types';
import { resolveRange } from './range';
import {
  summarize, monthlySeries, categoryRows, categoryStack, merchantRows, moneyFlow,
  weekdayProfile, cumulativeSpend, largestTransactions, insights, pctChange, merchantKey,
} from './compute';
import { toCsv } from './csv';

const cat = (id: string, name: string, type = 'expense'): Category => ({ id, name, icon: '•', color: `#${id.padEnd(6, '0').slice(0, 6)}`, type });
const groceries = cat('aaa111', 'Groceries'), dining = cat('bbb222', 'Dining'), salary = cat('ccc333', 'Salary', 'income');
const transfer = cat('ddd444', 'Internal Transfer', 'transfer');
const checking = { id: 'acc', bankName: 'Chase', accountName: 'Checking', accountType: 'checking', color: '#000', balance: 0 };
const brokerage = { ...checking, id: 'inv', accountType: 'investment' };

let seq = 0;
const tx = (date: string, amount: number, name: string, categoryRef: Category | null = groceries, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`, name, amount, date, source: 'manual', categoryRef, bankAccount: checking, projectId: null, ...extra,
});

const now = new Date(2026, 9, 27);
const range = resolveRange('this-month', now); // Oct 1–27 vs Sep

const cur = [
  tx('2026-10-02', 3000, 'ACME PAYROLL', salary),
  tx('2026-10-03', -120.5, 'Whole Foods'),
  tx('2026-10-10', -80, 'Whole Foods'),
  tx('2026-10-11', -60, 'Chipotle', dining),
  tx('2026-10-17', -45, 'Sushi Place', dining),     // Saturday
  tx('2026-10-18', -400, 'Best Buy', null),           // Sunday, uncategorized
  tx('2026-10-20', -500, 'Transfer to savings', transfer),
  tx('2026-10-21', -999, 'Vanguard buy', groceries, { bankAccount: brokerage }), // tracking account: excluded
];
const prev = [
  tx('2026-09-02', 3000, 'ACME PAYROLL', salary),
  tx('2026-09-05', -100, 'Whole Foods'),
  tx('2026-09-12', -300, 'Chipotle', dining),
  tx('2026-09-20', -50, 'Target', null),
];

describe('summarize', () => {
  it('applies the cash-flow rule and compares to the previous period', () => {
    const s = summarize(cur, prev, range.days);
    expect(s.income).toBe(3000);
    expect(s.spending).toBe(705.5);            // transfer and brokerage rows excluded
    expect(s.net).toBe(2294.5);
    expect(s.savingsRate).toBe(76.48);
    expect(s.txCount).toBe(6);
    expect(s.avgDaily).toBe(26.13);
    expect(s.prev.spending).toBe(450);
    expect(s.deltas.spending).toBe(56.78);
    expect(s.deltas.savingsRate).toBe(-8.52);
  });
  it('pctChange is null without a baseline', () => {
    expect(pctChange(10, 0)).toBeNull(); expect(pctChange(0, 10)).toBe(-100);
  });
});

describe('monthlySeries', () => {
  it('fills every month key, including empty ones, across a year boundary', () => {
    const pts = monthlySeries([...prev, ...cur], ['2026-08', '2026-09', '2026-10']);
    expect(pts.map((p) => p.spending)).toEqual([0, 450, 705.5]);
    expect(pts[2].net).toBe(2294.5); expect(pts[0].label).toBe('Aug');
  });
});

describe('categoryRows', () => {
  it('buckets spending with share, count and change vs previous', () => {
    const rows = categoryRows(cur, prev, 'expense');
    expect(rows.map((r) => r.name)).toEqual(['Uncategorized', 'Groceries', 'Dining']);
    const g = rows[1];
    expect(g.value).toBe(200.5); expect(g.count).toBe(2); expect(g.prevValue).toBe(100); expect(g.delta).toBe(100.5);
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(100, 0);
  });
  it('keeps a category that only existed in the previous period, with value 0', () => {
    const rows = categoryRows([], prev, 'expense');
    expect(rows.find((r) => r.name === 'Dining')?.value).toBe(0);
    expect(rows.find((r) => r.name === 'Dining')?.delta).toBe(-100);
  });
});

describe('categoryStack', () => {
  it('keeps the top N buckets and folds the rest into Other', () => {
    const stack = categoryStack([...prev, ...cur], ['2026-09', '2026-10'], 'expense', [], 1);
    expect(stack.series.map((s) => s.name)).toEqual(['Uncategorized', 'Other']);
    expect(stack.points[1]['other']).toBe(305.5);
    expect(stack.points[0]['uncat']).toBe(50);
  });
});

describe('merchantRows', () => {
  it('groups by normalised name, flags new merchants and builds a per-month series', () => {
    const rows = merchantRows(cur, prev, ['2026-10']);
    const wf = rows.find((r) => r.name === 'Whole Foods')!;
    expect(wf.total).toBe(200.5); expect(wf.count).toBe(2); expect(wf.avg).toBe(100.25);
    expect(wf.prevTotal).toBe(100); expect(wf.delta).toBe(100.5); expect(wf.isNew).toBe(false);
    expect(wf.series).toEqual([200.5]);
    expect(rows.find((r) => r.name === 'Best Buy')?.isNew).toBe(true);
    expect(rows[0].name).toBe('Best Buy');
  });
  it('merchantKey ignores case, spacing and trailing reference codes', () => {
    expect(merchantKey('WHOLE  foods ')).toBe('whole foods');
    expect(merchantKey('Amazon #A1B2C3')).toBe('amazon');
  });
});

describe('moneyFlow', () => {
  it('routes income through Cash to categories and Saved when there is a surplus', () => {
    const f = moneyFlow(cur);
    const names = f.nodes.map((n) => n.name);
    expect(names).toContain('Salary'); expect(names).toContain('Saved'); expect(names).not.toContain('Savings & credit');
    const saved = f.links.find((l) => f.nodes[l.target].name === 'Saved')!;
    expect(saved.value).toBe(2294.5);
    expect(f.links.filter((l) => f.nodes[l.source].name === 'Cash').reduce((s, l) => s + l.value, 0)).toBeCloseTo(3000, 2);
  });
  it('adds a deficit source when spending exceeds income', () => {
    const f = moneyFlow(cur.filter((t) => Number(t.amount) < 0));
    expect(f.nodes.map((n) => n.name)).toContain('Savings & credit');
    expect(f.links.find((l) => f.nodes[l.source].name === 'Savings & credit')!.value).toBe(705.5);
  });
});

describe('weekdayProfile', () => {
  it('counts occurrences of each weekday in the range and averages spend by them', () => {
    const w = weekdayProfile(cur, range);
    expect(w.map((d) => d.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(w[5].total).toBe(245.5);  // Oct 3 + Oct 10 + Oct 17 are Saturdays
    expect(w[5].occurrences).toBe(4); // Oct 3, 10, 17, 24
    expect(w[6].total).toBe(460);     // Oct 11 + Oct 18 are Sundays
  });
});

describe('cumulativeSpend', () => {
  it('accumulates by day of period and stops the current line at today', () => {
    const p = cumulativeSpend(cur, prev, range, new Date(2026, 9, 12));
    expect(p).toHaveLength(30);           // previous period (Sep) has 30 days
    expect(p[2].cur).toBe(120.5); expect(p[9].cur).toBe(200.5); expect(p[10].cur).toBe(260.5);
    expect(p[12].cur).toBeNull();         // after today
    expect(p[29].prev).toBe(450); expect(p[27].cur).toBeNull();
  });
});

describe('largestTransactions', () => {
  it('returns the biggest cash-flow expenses first', () => {
    expect(largestTransactions(cur, 2).map((t) => t.name)).toEqual(['Best Buy', 'Whole Foods']);
  });
});

describe('insights', () => {
  it('produces grounded sentences with the right tone', () => {
    const list = insights(cur, prev, range, [], now);
    const ids = list.map((i) => i.id);
    expect(ids).toContain('savings-rate');
    expect(list.find((i) => i.id === 'savings-rate')!.tone).toBe('bad');     // 76% vs 85%
    expect(list.find((i) => i.id === 'cat-down')!.text).toMatch(/Dining fell 65% to \$105/);
    expect(list.find((i) => i.id === 'new-merchants')!.text).toMatch(/\$445 went to 2 merchants/);
    expect(list.find((i) => i.id === 'largest')!.text).toMatch(/\$400 at Best Buy on Oct 18/);
    expect(list.find((i) => i.id === 'weekend')!.text).toMatch(/100% of your spending happened on weekends/);
    expect(list.find((i) => i.id === 'no-spend')!.text).toMatch(/22 of 27 days/);
    expect(list.find((i) => i.id === 'uncategorized')!.text).toMatch(/\$400 across 1 transaction/);
  });
  it('is quiet when there is nothing to say', () => {
    expect(insights([], [], range, [], now)).toEqual([]);
  });
});

describe('toCsv', () => {
  it('quotes commas, quotes and newlines and starts with a BOM', () => {
    const csv = toCsv([{ header: 'Name', value: (r: { n: string; v: number }) => r.n }, { header: 'Amount', value: (r) => r.v }], [{ n: 'Whole "Foods", Inc', v: 12.5 }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Whole ""Foods"", Inc",12.5');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
  it('neutralises spreadsheet formulas in text cells but leaves negative numbers numeric', () => {
    const cols = [{ header: 'Name', value: (r: { n: string; v: number }) => r.n }, { header: 'Amount', value: (r: { n: string; v: number }) => r.v }];
    const csv = toCsv(cols, [{ n: '=HYPERLINK("http://evil")', v: -42.5 }, { n: '+1-800-CALL', v: 1 }, { n: '@user', v: 2 }, { n: '-SUM(A1)', v: 3 }]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")",-42.5`);
    expect(csv).toContain(`'+1-800-CALL,1`);
    expect(csv).toContain(`'@user,2`);
    expect(csv).toContain(`'-SUM(A1),3`);
  });
});
