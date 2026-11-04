/* First and last calendar day of `now`'s local month as YYYY-MM-DD. Postgres validates
   date literals, so a bound like `2026-11-31` throws — always derive the real last day. */
export function monthBounds(now: Date): { start: string; end: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const mm = String(m + 1).padStart(2, '0');
  const last = new Date(y, m + 1, 0).getDate();
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}
