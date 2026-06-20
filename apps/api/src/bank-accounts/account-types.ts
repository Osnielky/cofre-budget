/**
 * Account-type classification used by services for net-worth / balance / budget math.
 * Mirror of apps/web/src/lib/accountTypes.ts — keep the two in sync.
 *
 * The DB column is a free-form string (no enum), so legacy values keep working.
 */

/** Types whose balance represents money owed (subtract from net worth). */
export const LIABILITY_TYPES = new Set<string>([
  'credit',
  'line_of_credit',
  'mortgage',
  'other_liability',
  'loan', // legacy
]);

/** Tracking accounts: net-worth only — excluded from budgets / spending / cash flow. */
export const TRACKING_TYPES = new Set<string>([
  'investment',
  'mortgage',
  'other_asset',
  'other_liability',
]);

/** Accounts that accept CSV transaction imports. */
export const IMPORTABLE_TYPES = new Set<string>([
  'checking',
  'savings',
  'credit',
  'cash',
  'line_of_credit',
  'paypal',
  'merchant',
  'investment',
]);

export const isLiabilityType = (t: string): boolean => LIABILITY_TYPES.has(t);
export const isTrackingType = (t: string): boolean => TRACKING_TYPES.has(t);
export const isImportableType = (t: string): boolean => IMPORTABLE_TYPES.has(t);
