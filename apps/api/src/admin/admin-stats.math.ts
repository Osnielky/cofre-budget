const DAY = 24 * 60 * 60 * 1000;

/** Monday (UTC) of the week containing `d`, as YYYY-MM-DD. */
export function weekStartUtc(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY);
  return monday.toISOString().slice(0, 10);
}

/** `weeks` zero-filled weekly counts, oldest first, ending with the week containing `now`. */
export function weeklyBuckets(dates: Date[], now: Date, weeks: number): { week: string; count: number }[] {
  const current = new Date(`${weekStartUtc(now)}T00:00:00Z`).getTime();
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    week: new Date(current - (weeks - 1 - i) * 7 * DAY).toISOString().slice(0, 10),
    count: 0,
  }));
  const index = new Map(buckets.map((b, i) => [b.week, i]));
  for (const d of dates) {
    const i = index.get(weekStartUtc(d));
    if (i != null) buckets[i].count++;
  }
  return buckets;
}

/** Cutoff `days` before `now`. */
export function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY);
}
