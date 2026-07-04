import { isTrackingAccount } from '@/lib/accountTypes';
import type { Transaction } from './types';

/** Transfers between own accounts + debt repayments — excluded everywhere. */
export function isTransfer(t: Transaction): boolean {
  return t.categoryRef?.type === 'transfer' || !!t.debtId;
}

/** Cash-flow eligible: not a transfer, not on a net-worth-only tracking account. */
export function inCashFlow(t: Transaction): boolean {
  return !isTransfer(t) && !isTrackingAccount(t.bankAccount?.accountType ?? '');
}

export function txInMonth(txs: Transaction[], monthKey: string): Transaction[] {
  return txs.filter((t) => t.date.startsWith(monthKey));
}

export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
