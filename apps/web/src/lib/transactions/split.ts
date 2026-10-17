const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * The amount row `idx` needs so the split adds up to `total`: the total minus
 * every other row. Null when there is nothing positive left for it, or when the
 * row already holds exactly that.
 */
export function fillRestAmount(total: number, amounts: string[], idx: number): string | null {
  const others = amounts.reduce((s, a, i) => (i === idx ? s : s + (parseFloat(a) || 0)), 0);
  const rest = cents(total - others);
  if (rest < 0.01) return null;
  const current = cents(parseFloat(amounts[idx]) || 0);
  if (Math.abs(current - rest) < 0.005) return null;
  return rest.toFixed(2);
}
