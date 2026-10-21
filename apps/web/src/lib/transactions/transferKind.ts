/**
 * What a transfer between two of your accounts means, and how each side will
 * be categorised. Mirrors apps/api/src/transactions/transfer-kind.ts (the
 * server decides; this copy drives the dialog and must stay in sync).
 */

export type TransferKind = 'savings' | 'capital_return' | 'investment_income' | 'card_payment' | 'internal';

const SAVINGS_LIKE = new Set(['savings', 'investment']);
const CARD_LIKE = new Set(['credit', 'line_of_credit']);

/** Options for a pair of account types, default first. `from` sends, `to` receives. */
export function transferKindOptions(fromType: string, toType: string): TransferKind[] {
  if (CARD_LIKE.has(toType)) return ['card_payment'];
  if (SAVINGS_LIKE.has(toType)) return ['savings', 'internal'];
  if (fromType === 'investment' && !SAVINGS_LIKE.has(toType)) return ['capital_return', 'investment_income', 'internal'];
  if (fromType === 'savings' && !SAVINGS_LIKE.has(toType)) return ['capital_return', 'internal'];
  return ['internal'];
}

export const KIND_LABELS: Record<TransferKind, { title: string; hint: string }> = {
  savings:           { title: 'Saving or investing', hint: 'Money you are putting away. Counts as saved this month, not as spending.' },
  capital_return:    { title: 'Taking savings back out', hint: 'Money you had put away before. Not income — it was already yours.' },
  investment_income: { title: 'Gains from investing', hint: 'Profit, dividends or interest you are cashing out. Counts as income this month.' },
  card_payment:      { title: 'Credit card payment', hint: 'Paying the card. The purchases were already counted when you made them.' },
  internal:          { title: 'Just moving money', hint: 'Between two of your accounts. Not income, not spending.' },
};

const CATEGORIES: Record<TransferKind, { from: string; to: string }> = {
  savings:           { from: 'Investments', to: 'Internal Transfer' },
  capital_return:    { from: 'Internal Transfer', to: 'Investments' },
  investment_income: { from: 'Internal Transfer', to: 'Investment income' },
  card_payment:      { from: 'Credit Card Payment', to: 'Credit Card Payment' },
  internal:          { from: 'Internal Transfer', to: 'Internal Transfer' },
};

export interface TransferSideAccount { name: string; accountType: string; provider?: string }
export interface TransferSideExplanation { account: string; amount: number; category: string; text: string }

const TRACKING = new Set(['investment', 'mortgage', 'other_asset', 'other_liability']);
const money = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Plain-language outcome for each side, shown in the link dialog before confirming. */
export function explainTransfer(kind: TransferKind, p: { from: TransferSideAccount; to: TransferSideAccount; amount: number }): { from: TransferSideExplanation; to: TransferSideExplanation } {
  const amt = Math.abs(p.amount);
  const cats = CATEGORIES[kind];
  const balanceNote = (acc: TransferSideAccount, direction: 'up' | 'down') =>
    acc.provider === 'manual' ? ` Its balance goes ${direction} by ${money(amt)}.` : '';
  const ignored = (acc: TransferSideAccount) =>
    TRACKING.has(acc.accountType)
      ? 'An investment-type account: not counted in income, spending or budgets.'
      : 'Not counted as income or spending.';

  let fromText: string;
  let toText: string;
  switch (kind) {
    case 'savings':
      fromText = `Counts as ${money(amt)} saved or invested this month. Not an expense and it does not lower your money left.`;
      toText = `${ignored(p.to)}${balanceNote(p.to, 'up')}`;
      break;
    case 'capital_return':
      fromText = `${ignored(p.from)}${balanceNote(p.from, 'down')}`;
      toText = `Money you withdraw from savings. Not income, so it does not inflate this month; it reduces what you saved.`;
      break;
    case 'investment_income':
      fromText = `${ignored(p.from)}${balanceNote(p.from, 'down')}`;
      toText = `Counts as ${money(amt)} of income this month.`;
      break;
    case 'card_payment':
      fromText = `Not counted as spending: the purchases were already counted on the card.`;
      toText = `Lowers what you owe on the card.${balanceNote(p.to, 'down')}`;
      break;
    default:
      fromText = `Not counted as income or spending.${balanceNote(p.from, 'down')}`;
      toText = `Not counted as income or spending.${balanceNote(p.to, 'up')}`;
  }
  return {
    from: { account: p.from.name, amount: -amt, category: cats.from, text: fromText },
    to: { account: p.to.name, amount: amt, category: cats.to, text: toText },
  };
}
