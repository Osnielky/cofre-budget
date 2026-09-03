const SAFETY_BUFFER_PCT = 0.05;

export interface SafeToSpendInput {
  /** Actual income received so far this month (category type 'income'). */
  incomeSoFar: number;
  /** Sum of budgeted (planned) amounts across non-income budget rows for the month. */
  plannedSpending: number;
  now: Date;
}

export interface SafeToSpendResult {
  /** Income projected to full-month using the elapsed-day fraction, same technique as
   *  the savings-trend projection — avoids a misleadingly low number early in the month. */
  income: number;
  plannedSpending: number;
  safetyBuffer: number;
  safeAmount: number;
}

/**
 * How much the user can safely spend/save this month: projected income minus their
 * own planned (budgeted) spending minus a safety buffer (5% of projected income).
 */
export function computeSafeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const { incomeSoFar, plannedSpending, now } = input;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const frac = now.getDate() / daysInMonth;
  const income = frac > 0 ? +(incomeSoFar / frac).toFixed(2) : incomeSoFar;
  const safetyBuffer = +(income * SAFETY_BUFFER_PCT).toFixed(2);
  const safeAmount = +(income - plannedSpending - safetyBuffer).toFixed(2);
  return { income, plannedSpending: +plannedSpending.toFixed(2), safetyBuffer, safeAmount };
}
