/**
 * What a transfer between two of the user's accounts *means*, and which
 * category each side gets. Decided here, on the server, so the rule lives in
 * one tested place; the web mirrors the option list for the dialog
 * (apps/web/src/lib/transactions/transferKind.ts — keep in sync).
 *
 * "from" is always the sending account (the negative leg), "to" the receiving
 * one. Category names refer to the user's categories by name; missing ones are
 * created from TRANSFER_CATEGORY_DEFAULTS.
 */

export type TransferKind = 'savings' | 'capital_return' | 'investment_income' | 'card_payment' | 'internal';

export const TRANSFER_KINDS: readonly TransferKind[] = ['savings', 'capital_return', 'investment_income', 'card_payment', 'internal'];

const SAVINGS_LIKE = new Set(['savings', 'investment']);
const CARD_LIKE = new Set(['credit', 'line_of_credit']);

/** Options for a pair of account types, default first. */
export function transferKindOptions(fromType: string, toType: string): TransferKind[] {
  if (CARD_LIKE.has(toType)) return ['card_payment'];
  if (SAVINGS_LIKE.has(toType)) return ['savings', 'internal'];
  if (fromType === 'investment' && !SAVINGS_LIKE.has(toType)) return ['capital_return', 'investment_income', 'internal'];
  if (fromType === 'savings' && !SAVINGS_LIKE.has(toType)) return ['capital_return', 'internal'];
  return ['internal'];
}

export function defaultTransferKind(fromType: string, toType: string): TransferKind {
  return transferKindOptions(fromType, toType)[0];
}

export function isTransferKind(v: unknown): v is TransferKind {
  return typeof v === 'string' && (TRANSFER_KINDS as readonly string[]).includes(v);
}

/** Category name for each side of the pair. */
export function categoriesForKind(kind: TransferKind): { from: string; to: string } {
  switch (kind) {
    case 'savings':           return { from: 'Investments', to: 'Internal Transfer' };
    case 'capital_return':    return { from: 'Internal Transfer', to: 'Investments' };
    case 'investment_income': return { from: 'Internal Transfer', to: 'Investment income' };
    case 'card_payment':      return { from: 'Credit Card Payment', to: 'Credit Card Payment' };
    case 'internal':          return { from: 'Internal Transfer', to: 'Internal Transfer' };
  }
}

/** Definitions used to create a category the kind needs but the user lacks. Mirrors CategoriesService DEFAULTS. */
export const TRANSFER_CATEGORY_DEFAULTS: { name: string; icon: string; color: string; type: string; description: string }[] = [
  { name: 'Investments',         icon: '📈', color: '#F5C842', type: 'savings',  description: 'Money you invest or save — brokerage, retirement & savings contributions' },
  { name: 'Investment income',   icon: '💹', color: '#4FBF7F', type: 'income',   description: 'Gains, dividends and interest you took out of an investment or savings account' },
  { name: 'Credit Card Payment', icon: '💳', color: '#6B6B8A', type: 'transfer', description: 'Paying off your credit card balance' },
  { name: 'Internal Transfer',   icon: '🔄', color: '#6B6B8A', type: 'transfer', description: 'Moving money between your own accounts' },
];
