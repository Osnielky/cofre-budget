const MS_PER_DAY = 86_400_000;
const MS_PER_YEAR = MS_PER_DAY * 365.25;
const MAX_PROJECTION_YEARS = 100;

export const NET_WORTH_TARGET = 1_000_000;

export interface GoalProgressInput {
  current: number;
  targetDate: string | null;
  baselineValue: number | null;
  baselineDate: string | null;
  now: Date;
}

export interface GoalProgress {
  onTrackPct: number | null;
  projectedDate: string | null;
}

export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Pacing math for the fixed $1,000,000 net-worth goal.
 * - Already met: 100% on track, projected date = today.
 * - No target date, or baseline captured today (not enough elapsed time to
 *   judge pace): both fields null.
 * - Otherwise: onTrackPct compares actual progress since baseline against the
 *   progress required at this point in time to hit the target by targetDate.
 *   projectedDate extrapolates the current linear rate forward; null when the
 *   rate is zero or negative (losing ground can't be projected to a date).
 */
export function computeGoalProgress(input: GoalProgressInput): GoalProgress {
  const { current, targetDate, baselineValue, baselineDate, now } = input;

  if (current >= NET_WORTH_TARGET) {
    return { onTrackPct: 100, projectedDate: toDateOnly(now) };
  }
  if (targetDate == null || baselineValue == null || baselineDate == null) {
    return { onTrackPct: null, projectedDate: null };
  }

  const baseline = new Date(`${baselineDate}T00:00:00`);
  const target = new Date(`${targetDate}T00:00:00`);
  const elapsedMs = now.getTime() - baseline.getTime();
  const elapsedDays = elapsedMs / MS_PER_DAY;
  if (elapsedDays < 1) {
    return { onTrackPct: null, projectedDate: null };
  }

  const progressSoFar = current - baselineValue;
  const rate = progressSoFar / elapsedDays; // dollars per day
  let projectedDate: string | null = null;
  if (rate > 0) {
    const projectedMs = now.getTime() + ((NET_WORTH_TARGET - current) / rate) * MS_PER_DAY;
    const withinSaneRange = Number.isFinite(projectedMs) && projectedMs - now.getTime() <= MAX_PROJECTION_YEARS * MS_PER_YEAR;
    projectedDate = withinSaneRange ? toDateOnly(new Date(projectedMs)) : null;
  }

  const totalMs = target.getTime() - baseline.getTime();
  let onTrackPct: number | null = null;
  if (totalMs > 0) {
    const elapsedFraction = Math.min(1, elapsedMs / totalMs);
    const requiredProgress = (NET_WORTH_TARGET - baselineValue) * elapsedFraction;
    onTrackPct = requiredProgress !== 0 ? +((progressSoFar / requiredProgress) * 100).toFixed(1) : null;
  }

  return { onTrackPct, projectedDate };
}
