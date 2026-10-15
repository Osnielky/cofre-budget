import type { CardApr, CardView } from './types';
import { aprOf } from './utilization';

export interface DetailForm {
  creditLimit: string;
  purchaseApr: string;
  promoApr: string;
  promoAprEndsOn: string;
  lastStatementBalance: string;
  minimumPayment: string;
  nextPaymentDueDate: string;
  rewardsBalance: string;
}

type FormErrors = Partial<Record<keyof DetailForm, string>>;

const MONEY: (keyof DetailForm & keyof CardView)[] = ['creditLimit', 'lastStatementBalance', 'minimumPayment', 'rewardsBalance'];
const DATES: (keyof DetailForm & keyof CardView)[] = ['nextPaymentDueDate', 'promoAprEndsOn'];

const str = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v));

export function formFromCard(card: CardView): DetailForm {
  return {
    creditLimit: str(card.creditLimit),
    purchaseApr: str(aprOf(card, 'purchase')),
    promoApr: str(aprOf(card, 'special')),
    promoAprEndsOn: str(card.promoAprEndsOn),
    lastStatementBalance: str(card.lastStatementBalance),
    minimumPayment: str(card.minimumPayment),
    nextPaymentDueDate: str(card.nextPaymentDueDate),
    rewardsBalance: str(card.rewardsBalance),
  };
}

/* "" → null; "$1,200.50" → 1200.5; anything else unparseable → undefined (error). */
function parseNumber(raw: string): number | null | undefined {
  const s = raw.trim().replace(/[$,\s%]/g, '');
  if (s === '') return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  return Number(s);
}

function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/* Builds the PATCH body from the form: only fields that changed, typed for the API.
   Any error → empty patch, so nothing half-valid is sent. */
export function formToPatch(form: DetailForm, card: CardView): { patch: Record<string, unknown>; errors: FormErrors } {
  const initial = formFromCard(card);
  const errors: FormErrors = {};
  const patch: Record<string, unknown> = {};

  for (const f of MONEY) {
    if (form[f].trim() === initial[f]) continue;
    const n = parseNumber(form[f]);
    if (n === undefined) errors[f] = 'Enter an amount like 1200.50';
    else patch[f] = n;
  }
  for (const f of DATES) {
    const v = form[f].trim();
    if (v === initial[f]) continue;
    if (v !== '' && !validDate(v)) errors[f] = 'Pick a valid date';
    else patch[f] = v === '' ? null : v;
  }

  const aprChanged = form.purchaseApr.trim() !== initial.purchaseApr || form.promoApr.trim() !== initial.promoApr;
  if (aprChanged) {
    const aprs: Pick<CardApr, 'type' | 'percentage'>[] = [];
    for (const [field, type] of [['purchaseApr', 'purchase'], ['promoApr', 'special']] as const) {
      const n = parseNumber(form[field]);
      if (n === undefined || (n !== null && n > 100)) errors[field] = 'Enter a rate between 0 and 100';
      else if (n !== null) aprs.push({ type, percentage: n });
    }
    for (const a of card.aprs) {
      if (a.type !== 'purchase' && a.type !== 'special') aprs.push({ type: a.type, percentage: a.percentage });
    }
    patch.aprs = aprs;
  }

  return Object.keys(errors).length > 0 ? { patch: {}, errors } : { patch, errors };
}
