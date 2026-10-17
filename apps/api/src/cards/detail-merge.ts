import type { PlaidCardData } from './card-types';

/* Fields that come from a statement — a newer Plaid statement supersedes a hand edit. */
export const STATEMENT_FIELDS = ['lastStatementBalance', 'lastStatementDate', 'minimumPayment', 'nextPaymentDueDate'] as const;

/* Fields a user may type in. promoAprEndsOn / rewardsBalance are manual-only. */
export const MANUAL_FIELDS = ['creditLimit', 'aprs', ...STATEMENT_FIELDS, 'promoAprEndsOn', 'rewardsBalance'] as const;
export type ManualField = (typeof MANUAL_FIELDS)[number];

const PLAID_FIELDS = [
  'creditLimit', 'officialName', 'aprs', 'lastStatementBalance', 'lastStatementDate', 'minimumPayment',
  'nextPaymentDueDate', 'lastPaymentAmount', 'lastPaymentDate', 'isOverdue',
] as const satisfies readonly (keyof PlaidCardData)[];

export interface MergeState {
  manualFields: string[];
  manualEditedAt: Date | null;
}

/**
 * The manual-override rule. A field the user typed in is not overwritten by Plaid,
 * except that a Plaid statement dated after the edit (by calendar day) replaces the
 * statement fields and clears them from manualFields. A null from Plaid never erases a
 * value. Returns only the fields to write.
 */
export function mergePlaidData(state: MergeState, plaid: PlaidCardData): { values: Partial<PlaidCardData>; manualFields: string[] } {
  const manual = new Set(state.manualFields);
  const editedOn = state.manualEditedAt ? state.manualEditedAt.toISOString().slice(0, 10) : null;
  if (plaid.lastStatementDate && editedOn && plaid.lastStatementDate > editedOn) {
    for (const f of STATEMENT_FIELDS) manual.delete(f);
  }

  const values: Partial<PlaidCardData> = {};
  for (const key of PLAID_FIELDS) {
    if (manual.has(key) || plaid[key] === null) continue;
    (values as Record<string, unknown>)[key] = plaid[key];
  }
  return { values, manualFields: state.manualFields.filter((f) => manual.has(f)) };
}

/* Accumulates Plaid reports: a later report's nulls don't wipe what an earlier one said. */
export function mergeSnapshot(prev: PlaidCardData | null, next: PlaidCardData): PlaidCardData {
  if (!prev) return { ...next };
  const out = { ...prev };
  for (const key of PLAID_FIELDS) {
    if (next[key] !== null) (out as Record<string, unknown>)[key] = next[key];
  }
  return out;
}
