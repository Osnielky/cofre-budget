/**
 * The decisions behind "Link a transfer", kept out of the modal so they can be
 * tested without rendering anything.
 *
 * A transfer is one movement of money seen twice: it leaves one account and
 * arrives in another. Everything here follows from that — the two legs carry
 * opposite signs, sit in different accounts, and each belongs to at most one
 * pair.
 */

export interface LinkTx {
  id: string;
  name: string;
  amount: number | string;
  date: string;
  bankAccountId: string | null;
  counterpartTxId?: string | null;
}

export function amountOf(tx: Pick<LinkTx, 'amount'>): number {
  return Number(tx.amount);
}

/** Whole cents, so two amounts can be compared without float noise. */
function cents(n: number): number {
  return Math.round(Math.abs(n) * 100);
}

/**
 * Could `candidate` be the other leg of `src`'s transfer?
 *
 * Amounts deliberately do NOT have to match: the search tab lets you pick a leg
 * by hand, and fees or FX can make the two sides differ. What cannot bend is
 * the shape of a transfer — opposite directions, different accounts, and
 * neither side already spoken for.
 */
export function isEligibleCounterpart(src: LinkTx, candidate: LinkTx): boolean {
  if (candidate.id === src.id) return false;
  if (!candidate.bankAccountId || candidate.bankAccountId === src.bankAccountId) return false;
  // Already half of another pair — linking it here would quietly break that one.
  if (candidate.counterpartTxId) return false;
  const a = Math.sign(amountOf(src));
  const b = Math.sign(amountOf(candidate));
  return a !== 0 && b !== 0 && a !== b;
}

/** Whole days between two YYYY-MM-DD dates. */
export function dayGap(a: string, b: string): number {
  const ms = Math.abs(new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime());
  return Math.round(ms / 86_400_000);
}

/**
 * How to describe a candidate, derived from the values rather than assumed.
 *
 * The old modal hardcoded "Same amount" and printed it whether or not the
 * amounts were equal, which is how a +$9.50 deposit was described as the same
 * amount as a -$10.00 payment.
 */
export function describeMatch(src: LinkTx, candidate: LinkTx): { sameAmount: boolean; dayDiff: number; label: string } {
  const sameAmount = cents(amountOf(src)) === cents(amountOf(candidate));
  const dayDiff = dayGap(src.date, candidate.date);
  const when = dayDiff === 0 ? 'same date' : `${dayDiff} day${dayDiff === 1 ? '' : 's'} apart`;
  const label = sameAmount
    ? (dayDiff === 0 ? 'Same amount and date' : `Same amount, ${when}`)
    : `Amounts differ, ${when}`;
  return { sameAmount, dayDiff, label };
}

/**
 * Lay the pair out as money flows: the leg that left an account is always FROM,
 * the leg that arrived is always TO. A payment and a deposit therefore read the
 * same way round, so the arrow never points backwards.
 */
export function orientSides(src: LinkTx, counterpart: LinkTx | null): {
  from: LinkTx | null;
  to: LinkTx | null;
  srcIsFrom: boolean;
} {
  const srcIsFrom = amountOf(src) < 0;
  return srcIsFrom
    ? { from: src, to: counterpart, srcIsFrom }
    : { from: counterpart, to: src, srcIsFrom };
}

/**
 * Eligible transactions matching a free-text query, closest date first so the
 * likeliest leg surfaces without scrolling.
 */
export function searchCandidates(src: LinkTx, pool: LinkTx[], query: string): LinkTx[] {
  const q = query.trim().toLowerCase();
  return pool
    .filter((c) => isEligibleCounterpart(src, c))
    .filter((c) => !q || c.name.toLowerCase().includes(q))
    .sort((a, b) => dayGap(src.date, a.date) - dayGap(src.date, b.date));
}
