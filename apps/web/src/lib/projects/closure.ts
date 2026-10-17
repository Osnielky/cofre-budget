/**
 * How a project ends, which depends on what kind of thing it is.
 *
 * You *sell* a held asset — a car, a house, a collection — and the sale price
 * realises a gain against cost basis. You *terminate* an ongoing operation — a
 * business, a service, a trading account — which has no sale price, only a
 * lifetime P&L. Calling either one by the other's name reads as a bug.
 *
 * KEEP IN SYNC with ProjectsService's closure validation in the API
 * (apps/api/src/projects/projects.service.ts). There is no shared library in
 * this workspace — only apps/ — so this rule is deliberately duplicated rather
 * than imported across the app boundary. The API is the authority; this copy
 * exists so the UI can label buttons without a round-trip.
 */

export type ProjectStatus = 'active' | 'sold' | 'terminated';
export type ClosureKind = 'sale' | 'termination';

export const SELLABLE_TYPES = ['vehicle', 'property', 'other'] as const;
export const TERMINABLE_TYPES = ['business', 'service', 'trading'] as const;

const STATUSES: ProjectStatus[] = ['active', 'sold', 'terminated'];

/**
 * Unknown types fall back to 'sale' rather than throwing: a legacy or
 * hand-written type should still be closable, just with the commoner verb.
 */
export function closureKind(type: string): ClosureKind {
  return (TERMINABLE_TYPES as readonly string[]).includes(type) ? 'termination' : 'sale';
}

export function closureActionLabel(type: string): string {
  return closureKind(type) === 'termination' ? 'Terminate' : 'Mark Sold';
}

export function closedStatusFor(type: string): Exclude<ProjectStatus, 'active'> {
  return closureKind(type) === 'termination' ? 'terminated' : 'sold';
}

/** Whether `status` is a legal destination for a project of this type. */
export function isValidClosure(type: string, status: string): boolean {
  if (!STATUSES.includes(status as ProjectStatus)) return false;
  if (status === 'active') return true;            // anything can be reactivated
  return status === closedStatusFor(type);
}

export function isClosed(status: string): boolean {
  return status === 'sold' || status === 'terminated';
}

/**
 * The projects a user may still file a transaction against.
 *
 * Use this for every *selectable* list — the category picker, the split modal,
 * suggestion chips. Never use it for a lookup by id: a transaction already
 * linked to a closed project still has to resolve its name, icon and colour, so
 * display paths must keep reading the full list or historical rows go blank.
 *
 * A project with no status at all counts as open; some callers carry a trimmed
 * Project shape that never loaded the field.
 */
export function selectableProjects<T extends { status?: string }>(projects: T[]): T[] {
  return projects.filter((p) => !isClosed(p.status ?? 'active'));
}

export function statusLabel(status: string): string {
  if (status === 'sold') return 'Sold';
  if (status === 'terminated') return 'Terminated';
  return 'Active';
}
