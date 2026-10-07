/**
 * Months a per-panel picker can offer: every month with a transaction, plus the
 * header month and the panel's own month so the current selection is always
 * listed. Newest first.
 */
export function monthOptionKeys(txDates: string[], ...always: string[]): string[] {
  const keys = new Set(txDates.map((d) => d.slice(0, 7)));
  for (const m of always) keys.add(m);
  return [...keys].sort().reverse();
}

/**
 * A panel follows the header month until the user picks another one. Picking
 * the header month again clears the override, so the panel resumes following.
 */
export function nextOverride(picked: string, headerMonth: string): string | null {
  return picked === headerMonth ? null : picked;
}
