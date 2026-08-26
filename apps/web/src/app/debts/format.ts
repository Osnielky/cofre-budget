export function fmt(n: number) { return Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 2 }); }
export function today() { return new Date().toISOString().slice(0, 10); }

/** YYYY-MM-DD `n` days from today — used for "due soon" thresholds. */
export function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Compact date for the upcoming-payments timeline: "Sep 1". */
export function fmtDateShort(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
