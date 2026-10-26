import { LEVELS } from '@/lib/goals/levels';
import { addMonths } from '@/lib/goals/pace';

/* The public "Road to $1M" calculator: pure math, no account needed. The ladder
   is the same LEVELS the Goals page uses, so a visitor who signs up sees the
   milestones they just calculated. */

/** 100 years: past this the answer is "never" rather than a date nobody will see. */
export const MAX_MONTHS = 1200;

export interface MillionaireInput {
  netWorth: number;
  /** Added at the end of every month. */
  monthly: number;
  /** Expected annual return, in percent (7 = 7%). Compounded monthly. */
  annualReturnPct: number;
  target: number;
  now: Date;
}

export interface Milestone {
  level: number;
  name: string;
  threshold: number;
  /** YYYY-MM the level is reached, or null if never within the cap. */
  month: string | null;
  /** Already at or above this level today. */
  reached: boolean;
}

export interface MillionaireResult {
  /** Whole months until the target, 0 if already there, null if never within the cap. */
  months: number | null;
  reachDate: string | null;
  milestones: Milestone[];
  /** Net worth at month 0, 12, 24… up to the target month (or the cap), for a chart. */
  series: { monthIndex: number; value: number }[];
}

export function projectMillionaire(input: MillionaireInput): MillionaireResult {
  const { now, target } = input;
  const rate = (Number.isFinite(input.annualReturnPct) ? input.annualReturnPct : 0) / 100 / 12;
  const monthly = Number.isFinite(input.monthly) ? input.monthly : 0;
  let value = Number.isFinite(input.netWorth) ? input.netWorth : 0;

  const thresholds = [...LEVELS.map((l) => l.threshold)];
  if (!thresholds.includes(target)) thresholds.push(target);
  const reachedAt = new Map<number, number>();
  for (const t of thresholds) if (value >= t) reachedAt.set(t, 0);

  const series: { monthIndex: number; value: number }[] = [{ monthIndex: 0, value: round2(value) }];
  let month = 0;
  while (!reachedAt.has(target) && month < MAX_MONTHS) {
    month += 1;
    value = value * (1 + rate) + monthly;
    for (const t of thresholds) if (!reachedAt.has(t) && value >= t) reachedAt.set(t, month);
    if (month % 12 === 0) series.push({ monthIndex: month, value: round2(value) });
  }
  const targetMonth = reachedAt.get(target);
  if (targetMonth !== undefined && targetMonth % 12 !== 0 && targetMonth > 0) {
    series.push({ monthIndex: targetMonth, value: round2(value) });
  }

  const milestones: Milestone[] = LEVELS.map((l) => {
    const m = reachedAt.get(l.threshold);
    return {
      level: l.n,
      name: l.name,
      threshold: l.threshold,
      month: m === undefined ? null : addMonths(now, m),
      reached: m === 0,
    };
  });

  return {
    months: targetMonth ?? null,
    reachDate: targetMonth === undefined ? null : addMonths(now, targetMonth),
    milestones,
    series,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
