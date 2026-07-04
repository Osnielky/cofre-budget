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

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export interface CashFlowMonth {
  month: string; revPersonal: number; revProject: number;
  expPersonal: number; expProject: number; net: number;
}

export function monthlyCashFlow(yearTx: Transaction[], now: Date): CashFlowMonth[] {
  const year = now.getFullYear();
  return Array.from({ length: now.getMonth() + 1 }, (_, i) => {
    const txs = txInMonth(yearTx, `${year}-${String(i + 1).padStart(2, '0')}`).filter(inCashFlow);
    const sum = (pred: (t: Transaction) => boolean) =>
      +txs.filter(pred).reduce((s, t) => s + Math.abs(Number(t.amount)), 0).toFixed(2);
    const revPersonal = sum((t) => Number(t.amount) > 0 && !t.projectId);
    const revProject  = sum((t) => Number(t.amount) > 0 && !!t.projectId);
    const expPersonal = sum((t) => Number(t.amount) < 0 && !t.projectId);
    const expProject  = sum((t) => Number(t.amount) < 0 && !!t.projectId);
    return {
      month: MONTHS_SHORT[i], revPersonal, revProject, expPersonal, expProject,
      net: +(revPersonal + revProject - expPersonal - expProject).toFixed(2),
    };
  });
}

export interface TrendPoint { month: string; income: number; expenses: number; net: number }

export function trendSeries(yearTx: Transaction[], now: Date, months = 6): TrendPoint[] {
  const year = now.getFullYear();
  const end = now.getMonth();               // 0-based current month
  const start = Math.max(0, end - months + 1);
  return Array.from({ length: end - start + 1 }, (_, k) => {
    const i = start + k;
    const txs = txInMonth(yearTx, `${year}-${String(i + 1).padStart(2, '0')}`).filter(inCashFlow);
    const income   = +txs.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0).toFixed(2);
    const expenses = +txs.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0).toFixed(2);
    return { month: MONTHS_SHORT[i], income, expenses, net: +(income - expenses).toFixed(2) };
  });
}
