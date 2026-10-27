/* Pure report calculations. Every number on the Reports page comes from here,
   using the dashboard's cash-flow rule (`inCashFlow`) and bucketing
   (`makeBucketer`) so the three screens never disagree. Amounts: positive =
   income, negative = spending. */

import type { Transaction } from '@/lib/dashboard/types';
import { inCashFlow, makeBucketer, type Bucket, type BucketProject } from '@/lib/dashboard/derive';
import { dayCount, parseYmd, shortMonth, ymd, type ReportRange } from './range';

const r2 = (n: number) => Math.round(n * 100) / 100;
const abs = (t: Transaction) => Math.abs(Number(t.amount));
const isIncome = (t: Transaction) => Number(t.amount) > 0;
const isSpend = (t: Transaction) => Number(t.amount) < 0;
const dayOf = (t: Transaction) => t.date.slice(0, 10);
const monthOf = (t: Transaction) => t.date.slice(0, 7);
const sum = (txs: Transaction[]) => r2(txs.reduce((s, t) => s + abs(t), 0));

/** % change, null when there is nothing to compare against. */
export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return r2(((cur - prev) / Math.abs(prev)) * 100);
}

export const flow = (txs: Transaction[]) => txs.filter(inCashFlow);

/* ── Summary ─────────────────────────────────────────────────────────── */

export interface PeriodTotals { income: number; spending: number; net: number; savingsRate: number | null; txCount: number }
export interface Summary extends PeriodTotals {
  avgDaily: number;
  prev: PeriodTotals;
  deltas: { income: number | null; spending: number | null; net: number | null; savingsRate: number | null };
}

export function totals(txs: Transaction[]): PeriodTotals {
  const f = flow(txs);
  const income = sum(f.filter(isIncome));
  const spending = sum(f.filter(isSpend));
  const net = r2(income - spending);
  return { income, spending, net, savingsRate: income > 0 ? r2((net / income) * 100) : null, txCount: f.length };
}

export function summarize(cur: Transaction[], prev: Transaction[], days: number): Summary {
  const c = totals(cur), p = totals(prev);
  return {
    ...c,
    avgDaily: days > 0 ? r2(c.spending / days) : 0,
    prev: p,
    deltas: {
      income: pctChange(c.income, p.income),
      spending: pctChange(c.spending, p.spending),
      net: pctChange(c.net, p.net),
      savingsRate: c.savingsRate != null && p.savingsRate != null ? r2(c.savingsRate - p.savingsRate) : null,
    },
  };
}

/* ── Monthly series ──────────────────────────────────────────────────── */

export interface MonthPoint { key: string; label: string; income: number; spending: number; net: number }

export function monthlySeries(txs: Transaction[], months: string[]): MonthPoint[] {
  const f = flow(txs);
  return months.map((key) => {
    const inMonth = f.filter((t) => monthOf(t) === key);
    const income = sum(inMonth.filter(isIncome)), spending = sum(inMonth.filter(isSpend));
    return { key, label: shortMonth(key), income, spending, net: r2(income - spending) };
  });
}

/* ── Categories ──────────────────────────────────────────────────────── */

export interface CategoryRow extends Bucket { value: number; share: number; count: number; prevValue: number; delta: number | null }

export function categoryRows(cur: Transaction[], prev: Transaction[], dir: 'income' | 'expense', projects: BucketProject[] = []): CategoryRow[] {
  const bucket = makeBucketer(projects);
  const pick = dir === 'income' ? isIncome : isSpend;
  const rows = new Map<string, CategoryRow>();
  for (const t of flow(cur).filter(pick)) {
    const b = bucket(t);
    const row = rows.get(b.id) ?? { ...b, value: 0, share: 0, count: 0, prevValue: 0, delta: null };
    row.value = r2(row.value + abs(t)); row.count += 1;
    rows.set(b.id, row);
  }
  for (const t of flow(prev).filter(pick)) {
    const b = bucket(t);
    const row = rows.get(b.id) ?? { ...b, value: 0, share: 0, count: 0, prevValue: 0, delta: null };
    row.prevValue = r2(row.prevValue + abs(t));
    rows.set(b.id, row);
  }
  const list = [...rows.values()].sort((a, b) => b.value - a.value || b.prevValue - a.prevValue);
  const total = list.reduce((s, x) => s + x.value, 0);
  for (const row of list) { row.share = total > 0 ? r2((row.value / total) * 100) : 0; row.delta = pctChange(row.value, row.prevValue); }
  return list;
}

export interface StackSeries { id: string; name: string; color: string }
export interface CategoryStack { points: Array<Record<string, number | string>>; series: StackSeries[] }

const OTHER: Bucket = { id: 'other', name: 'Other', icon: '·', color: '#6B6B8A' };

/** Per-month totals for the top N buckets of the whole period, the rest folded into Other. */
export function categoryStack(txs: Transaction[], months: string[], dir: 'income' | 'expense', projects: BucketProject[] = [], topN = 6): CategoryStack {
  const bucket = makeBucketer(projects);
  const pick = dir === 'income' ? isIncome : isSpend;
  const f = flow(txs).filter(pick);
  const periodTotals = new Map<string, { b: Bucket; v: number }>();
  for (const t of f) { const b = bucket(t); const e = periodTotals.get(b.id) ?? { b, v: 0 }; e.v += abs(t); periodTotals.set(b.id, e); }
  const top = [...periodTotals.values()].sort((a, b) => b.v - a.v).slice(0, topN).map((e) => e.b);
  const topIds = new Set(top.map((b) => b.id));
  const hasOther = periodTotals.size > top.length;
  const series: StackSeries[] = [...top, ...(hasOther ? [OTHER] : [])].map((b) => ({ id: b.id, name: b.name, color: b.color }));
  const points = months.map((key) => {
    const p: Record<string, number | string> = { key, label: shortMonth(key) };
    for (const s of series) p[s.id] = 0;
    for (const t of f) {
      if (monthOf(t) !== key) continue;
      const id = topIds.has(bucket(t).id) ? bucket(t).id : 'other';
      p[id] = r2((p[id] as number) + abs(t));
    }
    return p;
  });
  return { points, series };
}

/* ── Merchants ───────────────────────────────────────────────────────── */

export interface MerchantRow {
  name: string; total: number; count: number; avg: number;
  prevTotal: number; delta: number | null; isNew: boolean; series: number[];
}

export const merchantKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[#*]\s*\S+$/, '').trim();

export function merchantRows(cur: Transaction[], prev: Transaction[], months: string[], dir: 'income' | 'expense' = 'expense'): MerchantRow[] {
  const pick = dir === 'income' ? isIncome : isSpend;
  const rows = new Map<string, MerchantRow & { names: Map<string, number> }>();
  const get = (t: Transaction) => {
    const k = merchantKey(t.name);
    let row = rows.get(k);
    if (!row) { row = { name: t.name.trim(), total: 0, count: 0, avg: 0, prevTotal: 0, delta: null, isNew: false, series: months.map(() => 0), names: new Map() }; rows.set(k, row); }
    row.names.set(t.name.trim(), (row.names.get(t.name.trim()) ?? 0) + 1);
    return row;
  };
  for (const t of flow(cur).filter(pick)) {
    const row = get(t);
    row.total = r2(row.total + abs(t)); row.count += 1;
    const i = months.indexOf(monthOf(t)); if (i >= 0) row.series[i] = r2(row.series[i] + abs(t));
  }
  const seenBefore = new Set(flow(prev).filter(pick).map((t) => merchantKey(t.name)));
  for (const t of flow(prev).filter(pick)) { const row = rows.get(merchantKey(t.name)); if (row) row.prevTotal = r2(row.prevTotal + abs(t)); }
  return [...rows.entries()]
    .filter(([, r]) => r.count > 0)
    .map(([k, r]) => {
      const name = [...r.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const { names: _n, ...rest } = r; void _n;
      return { ...rest, name, avg: r2(r.total / r.count), delta: pctChange(r.total, r.prevTotal), isNew: !seenBefore.has(k) };
    })
    .sort((a, b) => b.total - a.total);
}

/* ── Money flow (Sankey) ─────────────────────────────────────────────── */

export interface FlowNode { name: string; color: string; kind: 'income' | 'hub' | 'spend' | 'saved' | 'deficit' }
export interface FlowLink { source: number; target: number; value: number }
export interface MoneyFlow { nodes: FlowNode[]; links: FlowLink[]; income: number; spending: number }

export function moneyFlow(cur: Transaction[], projects: BucketProject[] = [], maxCats = 8, hubColor = '#1E90FF', savedColor = '#22C55E', deficitColor = '#FF6B6B'): MoneyFlow {
  const incomeRows = categoryRows(cur, [], 'income', projects);
  const spendRows = categoryRows(cur, [], 'expense', projects);
  const income = r2(incomeRows.reduce((s, r) => s + r.value, 0));
  const spending = r2(spendRows.reduce((s, r) => s + r.value, 0));
  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];
  const add = (n: FlowNode) => nodes.push(n) - 1;
  const fold = (rows: CategoryRow[]) => {
    const top = rows.slice(0, maxCats);
    const rest = rows.slice(maxCats);
    if (rest.length) top.push({ ...OTHER, value: r2(rest.reduce((s, r) => s + r.value, 0)), share: 0, count: rest.reduce((s, r) => s + r.count, 0), prevValue: 0, delta: null });
    return top.filter((r) => r.value > 0);
  };
  const hub = add({ name: 'Cash', color: hubColor, kind: 'hub' });
  for (const r of fold(incomeRows)) links.push({ source: add({ name: r.name, color: r.color, kind: 'income' }), target: hub, value: r.value });
  if (spending > income) links.push({ source: add({ name: 'Savings & credit', color: deficitColor, kind: 'deficit' }), target: hub, value: r2(spending - income) });
  for (const r of fold(spendRows)) links.push({ source: hub, target: add({ name: r.name, color: r.color, kind: 'spend' }), value: r.value });
  if (income > spending) links.push({ source: hub, target: add({ name: 'Saved', color: savedColor, kind: 'saved' }), value: r2(income - spending) });
  return { nodes, links, income, spending };
}

/* ── Weekday profile ─────────────────────────────────────────────────── */

export interface WeekdayPoint { day: string; total: number; occurrences: number; avg: number }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function weekdayProfile(txs: Transaction[], range: Pick<ReportRange, 'from' | 'to'>): WeekdayPoint[] {
  const total = DAYS.map(() => 0), occ = DAYS.map(() => 0);
  for (let d = parseYmd(range.from); ymd(d) <= range.to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) occ[(d.getDay() + 6) % 7] += 1;
  for (const t of flow(txs).filter(isSpend)) total[(parseYmd(dayOf(t)).getDay() + 6) % 7] += abs(t);
  return DAYS.map((day, i) => ({ day, total: r2(total[i]), occurrences: occ[i], avg: occ[i] ? r2(total[i] / occ[i]) : 0 }));
}

/* ── Pace (cumulative spend by day of period) ────────────────────────── */

export interface PacePoint { day: number; cur: number | null; prev: number | null }

export function cumulativeSpend(cur: Transaction[], prev: Transaction[], range: ReportRange, now: Date): PacePoint[] {
  const build = (txs: Transaction[], from: string, days: number) => {
    const per = new Array<number>(days).fill(0);
    for (const t of flow(txs).filter(isSpend)) { const i = dayCount(from, dayOf(t)) - 1; if (i >= 0 && i < days) per[i] += abs(t); }
    let acc = 0; return per.map((v) => (acc = r2(acc + v)));
  };
  const curDays = range.days, prevDays = dayCount(range.prevFrom, range.prevTo);
  const c = build(cur, range.from, curDays), p = build(prev, range.prevFrom, prevDays);
  const today = ymd(now);
  const elapsed = today < range.from ? 0 : Math.min(curDays, dayCount(range.from, today));
  const n = Math.max(curDays, prevDays);
  return Array.from({ length: n }, (_, i) => ({ day: i + 1, cur: i < elapsed ? c[i] : null, prev: i < prevDays ? p[i] : null }));
}

/* ── Largest expenses ────────────────────────────────────────────────── */

export function largestTransactions(cur: Transaction[], n = 5): Transaction[] {
  return flow(cur).filter(isSpend).sort((a, b) => abs(b) - abs(a)).slice(0, n);
}

/* ── Insights ────────────────────────────────────────────────────────── */

export interface Insight { id: string; tone: 'good' | 'bad' | 'neutral'; text: string }

const money = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const pct = (n: number) => `${Math.abs(Math.round(n))}%`;

export function insights(cur: Transaction[], prev: Transaction[], range: ReportRange, projects: BucketProject[] = [], now: Date = new Date()): Insight[] {
  const out: Insight[] = [];
  const s = summarize(cur, prev, range.days);
  const hasPrev = flow(prev).length > 0;

  if (s.savingsRate != null && s.prev.savingsRate != null) {
    const d = s.savingsRate - s.prev.savingsRate;
    if (Math.abs(d) >= 3) out.push({ id: 'savings-rate', tone: d > 0 ? 'good' : 'bad', text: `You kept ${pct(s.savingsRate)} of your income, ${d > 0 ? 'up' : 'down'} from ${pct(s.prev.savingsRate)} in the previous period.` });
  } else if (s.savingsRate != null && s.income > 0) {
    out.push({ id: 'savings-rate', tone: s.savingsRate >= 20 ? 'good' : s.savingsRate < 0 ? 'bad' : 'neutral', text: s.savingsRate < 0 ? `You spent ${money(-s.net)} more than you earned.` : `You kept ${pct(s.savingsRate)} of your income (${money(s.net)}).` });
  }

  const cats = categoryRows(cur, prev, 'expense', projects).filter((r) => r.id !== 'uncat');
  if (hasPrev) {
    const up = cats.filter((r) => r.prevValue >= 25 && r.value - r.prevValue >= 50 && (r.delta ?? 0) >= 20).sort((a, b) => (b.value - b.prevValue) - (a.value - a.prevValue))[0];
    if (up) out.push({ id: 'cat-up', tone: 'bad', text: `${up.icon} ${up.name} rose ${pct(up.delta!)} to ${money(up.value)} (${money(up.value - up.prevValue)} more than before).` });
    const down = cats.filter((r) => r.prevValue >= 50 && r.prevValue - r.value >= 50 && (r.delta ?? 0) <= -20).sort((a, b) => (b.prevValue - b.value) - (a.prevValue - a.value))[0];
    if (down) out.push({ id: 'cat-down', tone: 'good', text: `${down.icon} ${down.name} fell ${pct(down.delta!)} to ${money(down.value)}, saving ${money(down.prevValue - down.value)}.` });
  }

  const merchants = merchantRows(cur, prev, range.months);
  if (hasPrev) {
    const fresh = merchants.filter((m) => m.isNew);
    const freshTotal = fresh.reduce((x, m) => x + m.total, 0);
    if (fresh.length && freshTotal >= 50) out.push({ id: 'new-merchants', tone: 'neutral', text: `${money(freshTotal)} went to ${fresh.length} merchant${fresh.length === 1 ? '' : 's'} you had not paid in the previous period${fresh[0] ? `, led by ${fresh[0].name}` : ''}.` });
  }
  if (merchants[0] && s.spending > 0 && merchants[0].total / s.spending >= 0.15) {
    out.push({ id: 'top-merchant', tone: 'neutral', text: `${merchants[0].name} took ${pct((merchants[0].total / s.spending) * 100)} of your spending (${money(merchants[0].total)} over ${merchants[0].count} transaction${merchants[0].count === 1 ? '' : 's'}).` });
  }

  const big = largestTransactions(cur, 1)[0];
  if (big && s.spending > 0 && abs(big) / s.spending >= 0.1) out.push({ id: 'largest', tone: 'neutral', text: `Your largest expense was ${money(abs(big))} at ${big.name.trim()} on ${parseYmd(big.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.` });

  const wk = weekdayProfile(cur, range);
  const weekend = wk[5].total + wk[6].total;
  if (s.spending >= 200 && weekend / s.spending >= 0.4) out.push({ id: 'weekend', tone: 'neutral', text: `${pct((weekend / s.spending) * 100)} of your spending happened on weekends.` });

  const elapsedTo = ymd(now) < range.to ? ymd(now) : range.to;
  if (elapsedTo >= range.from) {
    const spendDays = new Set(flow(cur).filter(isSpend).map(dayOf));
    const elapsed = dayCount(range.from, elapsedTo);
    const quiet = elapsed - spendDays.size;
    if (s.spending > 0 && elapsed >= 7 && quiet > 0) out.push({ id: 'no-spend', tone: 'good', text: `${quiet} of ${elapsed} days had no spending at all.` });
  }

  const uncat = categoryRows(cur, [], 'expense', projects).find((r) => r.id === 'uncat');
  if (uncat && uncat.value >= 20) out.push({ id: 'uncategorized', tone: 'bad', text: `${money(uncat.value)} across ${uncat.count} transaction${uncat.count === 1 ? '' : 's'} is still uncategorized, so these reports are missing it.` });

  return out;
}
