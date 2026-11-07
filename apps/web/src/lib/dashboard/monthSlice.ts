/* The dashboard shows one month but also keeps the year to date for its
   trends, so the month's rows are already in the year's response whenever
   the month falls inside it. Pure. */

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from: `${month}-01`, to };
}

/** True when every row of `month` is inside a year-to-date list that runs from `yearFrom` to `yearTo`. */
export function monthWithin(month: string, yearFrom: string, yearTo: string): boolean {
  const { from, to } = monthRange(month);
  return from >= yearFrom && from <= yearTo && (to <= yearTo || from.slice(0, 7) === yearTo.slice(0, 7));
}

export function sliceMonth<T extends { date: string }>(rows: T[], month: string): T[] {
  return rows.filter((r) => r.date.slice(0, 7) === month);
}
