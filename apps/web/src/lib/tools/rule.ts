/* Public 50/30/20 calculator. Everything is integer cents, like the budgets model. */

export interface RuleSplit { needs: number; wants: number; savings: number }

const toCents = (dollars: number) => (Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : 0);

/** 50% needs, 30% wants, the rest (20% plus any rounding) savings. */
export function splitIncome(takeHome: number): RuleSplit {
  const total = toCents(takeHome);
  const needs = Math.floor(total * 0.5);
  const wants = Math.floor(total * 0.3);
  return { needs, wants, savings: total - needs - wants };
}

export interface BucketCompare {
  target: number;
  /** Null when the visitor did not enter it. */
  actual: number | null;
  /** actual − target; positive means over the guideline. Null without an actual. */
  delta: number | null;
}

export interface RuleCompare { needs: BucketCompare; wants: BucketCompare; savings: BucketCompare }

/** Targets from the rule beside what the visitor actually spends; savings is what is left. */
export function compareToRule(takeHome: number, needsActual: number | null, wantsActual: number | null): RuleCompare {
  const t = splitIncome(takeHome);
  const total = toCents(takeHome);
  const needs = needsActual === null ? null : toCents(needsActual);
  const wants = wantsActual === null ? null : toCents(wantsActual);
  const savings = needs === null || wants === null ? null : total - needs - wants;
  const bucket = (target: number, actual: number | null): BucketCompare => ({
    target, actual, delta: actual === null ? null : actual - target,
  });
  return { needs: bucket(t.needs, needs), wants: bucket(t.wants, wants), savings: bucket(t.savings, savings) };
}
