/**
 * Single source of truth for bank-account types.
 *
 * Two groups, mirroring the way budgeting apps (Quicken et al.) split accounts:
 *  - "budget"   → participates in budgets, spending totals and dashboard cash flow.
 *  - "tracking" → net-worth only; excluded from budgets / spending / cash flow.
 *
 * `kind` drives net-worth math (assets add, liabilities subtract).
 * `importable` controls whether the account is offered for CSV transaction import.
 *
 * The stored `value` is a free-form string in the DB (no enum constraint), so existing
 * rows ('checking', 'credit', …) keep working. Backend mirrors these sets in
 * apps/api/src/bank-accounts/account-types.ts — keep the two in sync.
 */

export type AccountGroup = 'budget' | 'tracking';
export type AccountKind = 'asset' | 'liability';

export interface AccountTypeMeta {
  value: string;
  label: string;
  group: AccountGroup;
  kind: AccountKind;
  importable: boolean;
  accent: string;
  /** Emoji fallback; prefer <AccountTypeIcon> for rendering. */
  icon: string;
}

export const ACCOUNT_TYPES: AccountTypeMeta[] = [
  // ── Budget ──────────────────────────────────────────────
  { value: 'checking',       label: 'Checking',         group: 'budget',   kind: 'asset',     importable: true,  accent: 'var(--color-primary)', icon: '💳' },
  { value: 'savings',        label: 'Savings',          group: 'budget',   kind: 'asset',     importable: true,  accent: 'var(--color-green)',   icon: '🏦' },
  { value: 'credit',         label: 'Credit Card',      group: 'budget',   kind: 'liability', importable: true,  accent: 'var(--color-orange)',  icon: '💳' },
  { value: 'cash',           label: 'Cash',             group: 'budget',   kind: 'asset',     importable: true,  accent: 'var(--color-green)',   icon: '💵' },
  { value: 'line_of_credit', label: 'Line of Credit',   group: 'budget',   kind: 'liability', importable: true,  accent: 'var(--color-orange)',  icon: '💳' },
  { value: 'paypal',         label: 'PayPal',           group: 'budget',   kind: 'asset',     importable: true,  accent: 'var(--color-sky)',     icon: '🅿️' },
  { value: 'merchant',       label: 'Merchant Account', group: 'budget',   kind: 'asset',     importable: true,  accent: 'var(--color-sky)',     icon: '🏪' },
  // ── Tracking ────────────────────────────────────────────
  { value: 'investment',     label: 'Investment Account', group: 'tracking', kind: 'asset',     importable: true,  accent: 'var(--color-sky)',   icon: '📈' },
  { value: 'mortgage',       label: 'Mortgage',           group: 'tracking', kind: 'liability', importable: false, accent: 'var(--color-amber)', icon: '🏠' },
  { value: 'other_asset',    label: 'Other Asset',        group: 'tracking', kind: 'asset',     importable: false, accent: 'var(--color-green)', icon: '📦' },
  { value: 'other_liability',label: 'Other Liability',    group: 'tracking', kind: 'liability', importable: false, accent: 'var(--color-amber)', icon: '📉' },
];

const BY_VALUE: Record<string, AccountTypeMeta> = Object.fromEntries(
  ACCOUNT_TYPES.map((t) => [t.value, t]),
);

/** Legacy 'loan' rows (pre-taxonomy) behave like a liability for net-worth math. */
const LEGACY_FALLBACK: AccountTypeMeta = BY_VALUE.checking;

export function accountTypeMeta(value: string): AccountTypeMeta {
  if (value === 'loan') {
    return { ...BY_VALUE.other_liability, value: 'loan', label: 'Loan' };
  }
  return BY_VALUE[value] ?? { ...LEGACY_FALLBACK, value, label: value };
}

export const accountTypeLabel = (value: string): string => accountTypeMeta(value).label;

export const isLiability = (value: string): boolean => accountTypeMeta(value).kind === 'liability';
export const isTrackingAccount = (value: string): boolean => accountTypeMeta(value).group === 'tracking';
export const isBudgetAccount = (value: string): boolean => accountTypeMeta(value).group === 'budget';
export const isImportable = (value: string): boolean => accountTypeMeta(value).importable;

export const BUDGET_TYPES   = ACCOUNT_TYPES.filter((t) => t.group === 'budget');
export const TRACKING_TYPES = ACCOUNT_TYPES.filter((t) => t.group === 'tracking');

export const ACCOUNT_GROUPS: { group: AccountGroup; label: string; types: AccountTypeMeta[] }[] = [
  { group: 'budget',   label: 'Budget',   types: BUDGET_TYPES },
  { group: 'tracking', label: 'Tracking', types: TRACKING_TYPES },
];
