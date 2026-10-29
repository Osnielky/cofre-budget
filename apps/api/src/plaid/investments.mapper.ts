/**
 * Pure helpers for Plaid's Investments product: how one investment transaction
 * becomes a Cofre transaction row, how the request window is chosen, and what a
 * Plaid error means for the item's investments status. No I/O, fully tested.
 */

/** Mirrors Plaid's InvestmentTransaction; only the fields the mapping reads. */
export interface PlaidInvestmentTx {
  investment_transaction_id: string;
  cancel_transaction_id?: string | null;
  account_id: string;
  security_id: string | null;
  date: string;
  name: string;
  quantity: number;
  amount: number;
  price: number;
  fees: number | null;
  type: string;
  subtype: string;
  iso_currency_code?: string | null;
}

export interface PlaidSecurityLite {
  security_id: string;
  name: string | null;
  ticker_symbol: string | null;
}

/** 'synced' | 'not_consented' (user never agreed to Investments on this link) |
 *  'pending' (Plaid still extracting) | 'unsupported' (bank or client cannot). */
export type InvestmentsStatus = 'synced' | 'not_consented' | 'pending' | 'unsupported';

export function investmentsErrorStatus(errorCode: string | undefined): InvestmentsStatus | null {
  switch (errorCode) {
    case 'ADDITIONAL_CONSENT_REQUIRED': return 'not_consented';
    case 'PRODUCT_NOT_READY': return 'pending';
    case 'PRODUCTS_NOT_SUPPORTED':
    case 'INVALID_PRODUCT':
    case 'NO_INVESTMENT_ACCOUNTS':
    case 'NO_INVESTMENT_AUTH_ACCOUNTS': return 'unsupported';
    default: return null;
  }
}

/** Plaid serves at most 24 months of investment history. */
export const INVESTMENTS_HISTORY_DAYS = 730;
/** Later pulls re-read this many days before the last synced date, since
 *  institutions post trades and dividends late and Plaid may revise them. */
export const INVESTMENTS_OVERLAP_DAYS = 14;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The start/end dates to request: everything on a first pull, a short overlap after that. */
export function investmentsWindow(syncedThrough: string | null, now: Date = new Date()): { start: string; end: string } {
  const end = isoDate(now);
  const DAY = 24 * 60 * 60 * 1000;
  if (!syncedThrough) return { start: isoDate(new Date(now.getTime() - INVESTMENTS_HISTORY_DAYS * DAY)), end };
  const since = new Date(`${syncedThrough}T00:00:00Z`).getTime() - INVESTMENTS_OVERLAP_DAYS * DAY;
  const floor = now.getTime() - INVESTMENTS_HISTORY_DAYS * DAY;
  return { start: isoDate(new Date(Math.max(since, floor))), end };
}

export interface MappedInvestmentTx {
  externalId: string;
  /** Cofre sign: positive = money into the account. Plaid debits cash for buys and fees (positive) and credits it for sells, dividends and deposits (negative). */
  amount: number;
  name: string;
  date: string;
  plaidCategory: string[];
  note: string | null;
  /** Ticker, or the security name when it has none; null for pure cash rows. */
  symbol: string | null;
  securityName: string | null;
  /** Plaid's sign: positive buys, negative sells; null when Plaid sends 0 / nothing. */
  quantity: number | null;
  /** Per-unit price; derived from amount ÷ quantity when Plaid sends 0. */
  price: number | null;
  fees: number | null;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function money(n: number): string {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** One Plaid investment transaction as a Cofre row. Cancels are not rows (see the sync). */
export function mapInvestmentTransaction(it: PlaidInvestmentTx, securities: Map<string, PlaidSecurityLite>): MappedInvestmentTx {
  const security = it.security_id ? securities.get(it.security_id) ?? null : null;
  const label = security?.ticker_symbol || security?.name || null;
  const subtype = capitalize(it.subtype || it.type);
  const parts: string[] = [subtype];
  if (it.quantity && it.price && label) {
    parts.push(`${Math.abs(it.quantity).toLocaleString('en-US', { maximumFractionDigits: 4 })} × ${label} @ ${money(it.price)}`);
  } else if (label) {
    parts.push(label);
  }
  if (it.fees) parts.push(`fee ${money(it.fees)}`);
  const fallbackName = label ? `${subtype} ${label}` : subtype;
  const quantity = it.quantity ? it.quantity : null;
  const price = it.price ? it.price : (quantity && it.amount ? +(Math.abs(it.amount) / Math.abs(quantity)).toFixed(6) : null);
  return {
    externalId: it.investment_transaction_id,
    amount: -it.amount,
    name: (it.name && it.name.trim()) || fallbackName,
    date: it.date,
    plaidCategory: [it.type, it.subtype].filter(Boolean),
    note: parts.join(' · ').slice(0, 500),
    symbol: label ? label.slice(0, 32) : null,
    securityName: security?.name ? security.name.slice(0, 120) : null,
    quantity,
    price,
    fees: it.fees ? it.fees : null,
  };
}
