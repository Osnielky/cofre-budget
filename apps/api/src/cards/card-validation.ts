import { BadRequestException } from '@nestjs/common';
import { CARD_GOALS, SCORE_BANDS, type CardApr, type CardProfileView } from './card-types';
import { MANUAL_FIELDS, type ManualField } from './detail-merge';

const MONEY_FIELDS = ['creditLimit', 'lastStatementBalance', 'minimumPayment', 'rewardsBalance'] as const;
const DATE_FIELDS = ['lastStatementDate', 'nextPaymentDueDate', 'promoAprEndsOn'] as const;
const APR_TYPES: readonly CardApr['type'][] = ['purchase', 'balance_transfer', 'cash_advance', 'special'];
const MAX_MONEY = 10_000_000;
const MAX_APRS = 8;

export type DetailPatch = Partial<Record<ManualField, number | string | CardApr[] | null>>;
export type ProfileInput = Partial<CardProfileView>;

function asObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Expected a JSON object');
  return body as Record<string, unknown>;
}

function has(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined;
}

function money(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_MONEY) {
    throw new BadRequestException(`${field} must be a number between 0 and ${MAX_MONEY}`);
  }
  return Math.round(value * 100) / 100;
}

function isoDate(value: unknown, field: string): string | null {
  if (value === null) return null;
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) return value as string;
  }
  throw new BadRequestException(`${field} must be a YYYY-MM-DD date`);
}

function aprList(value: unknown): CardApr[] | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length > MAX_APRS) throw new BadRequestException(`aprs must be a list of at most ${MAX_APRS}`);
  return value.map((raw) => {
    const a = asObject(raw);
    if (!APR_TYPES.includes(a.type as CardApr['type'])) throw new BadRequestException('Unknown APR type');
    const pct = a.percentage;
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new BadRequestException('APR must be between 0 and 100');
    }
    return { type: a.type as CardApr['type'], percentage: Math.round(pct * 100) / 100, balanceSubjectTo: null, interestCharged: null };
  });
}

/* Whitelists and validates a card-detail PATCH body. Unknown keys are dropped. */
export function validateDetailPatch(body: unknown): DetailPatch {
  const obj = asObject(body);
  const out: DetailPatch = {};
  for (const f of MONEY_FIELDS) if (has(obj, f)) out[f] = money(obj[f], f);
  for (const f of DATE_FIELDS) if (has(obj, f)) out[f] = isoDate(obj[f], f);
  if (has(obj, 'aprs')) out.aprs = aprList(obj.aprs);
  // Every key written above is a ManualField; this guards future edits.
  for (const k of Object.keys(out)) if (!(MANUAL_FIELDS as readonly string[]).includes(k)) delete (out as Record<string, unknown>)[k];
  return out;
}

/* Whitelists and validates a card-profile PUT body. */
export function validateProfile(body: unknown): ProfileInput {
  const obj = asObject(body);
  const out: ProfileInput = {};
  if (has(obj, 'goal')) {
    if (obj.goal !== null && !CARD_GOALS.includes(obj.goal as never)) throw new BadRequestException('Unknown goal');
    out.goal = obj.goal as ProfileInput['goal'];
  }
  if (has(obj, 'creditScoreBand')) {
    if (obj.creditScoreBand !== null && !SCORE_BANDS.includes(obj.creditScoreBand as never)) throw new BadRequestException('Unknown credit score band');
    out.creditScoreBand = obj.creditScoreBand as ProfileInput['creditScoreBand'];
  }
  if (has(obj, 'annualFeeOk')) {
    if (obj.annualFeeOk !== null && typeof obj.annualFeeOk !== 'boolean') throw new BadRequestException('annualFeeOk must be true, false or null');
    out.annualFeeOk = obj.annualFeeOk as boolean | null;
  }
  if (has(obj, 'monthlyDebtBudget')) out.monthlyDebtBudget = money(obj.monthlyDebtBudget, 'monthlyDebtBudget');
  if (has(obj, 'plannedPurchaseAmount')) out.plannedPurchaseAmount = money(obj.plannedPurchaseAmount, 'plannedPurchaseAmount');
  if (has(obj, 'plannedPurchaseNote')) {
    const note = obj.plannedPurchaseNote;
    if (note !== null && typeof note !== 'string') throw new BadRequestException('plannedPurchaseNote must be text');
    const trimmed = typeof note === 'string' ? note.trim() : null;
    if (trimmed && trimmed.length > 120) throw new BadRequestException('plannedPurchaseNote is limited to 120 characters');
    out.plannedPurchaseNote = trimmed || null;
  }
  return out;
}
