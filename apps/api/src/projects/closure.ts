/**
 * How a project ends, which depends on what kind of thing it is.
 *
 * You *sell* a held asset — a car, a house, a collection — and the sale price
 * realises a gain against cost basis. You *terminate* an ongoing operation — a
 * business, a service, a trading account — which has no sale price, only a
 * lifetime P&L.
 *
 * This is the authority. The web app carries a copy for labelling buttons
 * without a round-trip (apps/web/src/lib/projects/closure.ts); there is no
 * shared library in this workspace — only apps/ — so the rule is deliberately
 * duplicated. Change both together.
 */

export type ProjectStatus = 'active' | 'sold' | 'terminated';

export const SELLABLE_TYPES = ['vehicle', 'property', 'other'];
export const TERMINABLE_TYPES = ['business', 'service', 'trading'];

const STATUSES: ProjectStatus[] = ['active', 'sold', 'terminated'];

/** Unknown types fall back to 'sold' so a legacy row stays closable. */
export function closedStatusFor(type: string): Exclude<ProjectStatus, 'active'> {
  return TERMINABLE_TYPES.includes(type) ? 'terminated' : 'sold';
}

/** Whether `status` is a legal destination for a project of this type. */
export function isValidClosure(type: string, status: string): boolean {
  if (!STATUSES.includes(status as ProjectStatus)) return false;
  if (status === 'active') return true;            // anything can be reactivated
  return status === closedStatusFor(type);
}
