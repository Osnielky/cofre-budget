/**
 * What to tell the user when Stripe refuses to charge the payment method on
 * file (pay-overdue, upgrade-now). Stripe's own sentence is often just
 * "The payment failed." — a bank or Link decline with no detail — so the
 * message leads with the fix the page already offers: another payment method.
 */
export interface PaymentFailure {
  /** True when the subscription simply has nothing to charge. */
  noMethod: boolean;
  /** Stripe's error code (`card_declined`, …), for logs. */
  code: string | null;
  /** Stripe's decline code (`insufficient_funds`, …), for logs. */
  declineCode: string | null;
  /** Plain reason when the decline code says something the user can act on. */
  reason: string | null;
  /** The sentence shown on the billing page. */
  message: string;
}

const REASONS: Record<string, string> = {
  insufficient_funds: 'the bank reported insufficient funds',
  account_closed: 'the bank says that account is closed',
  no_account: 'the bank could not find that account',
  debit_not_authorized: 'the bank has not authorised debits from that account',
  bank_account_restricted: 'the bank has restricted that account',
  expired_card: 'the card has expired',
  incorrect_cvc: 'the card security code was wrong',
  incorrect_number: 'the card number was wrong',
  lost_card: 'the card was reported lost',
  stolen_card: 'the card was reported stolen',
  card_velocity_exceeded: 'the card has hit its spending limit',
  authentication_required: 'the bank wants you to approve the charge yourself',
  do_not_honor: 'the bank declined it without giving a reason',
  generic_decline: 'the bank declined it without giving a reason',
  fraudulent: 'the bank flagged the charge and declined it',
  transaction_not_allowed: 'the bank does not allow this kind of charge on that method',
  currency_not_supported: 'that method cannot pay in this currency',
};

const NO_METHOD = /no (attached )?payment (source|method)|default payment method/i;

export function describePaymentFailure(err: unknown, methodLabel = 'your payment method'): PaymentFailure {
  const e = (err ?? {}) as { code?: unknown; decline_code?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code : null;
  const declineCode = typeof e.decline_code === 'string' ? e.decline_code : null;
  const text = typeof e.message === 'string' ? e.message : '';
  const noMethod = code === 'resource_missing' || NO_METHOD.test(text);
  if (noMethod) {
    return { noMethod, code, declineCode, reason: null, message: 'There is no payment method on file to charge. Add one and try again.' };
  }
  const reason = (declineCode && REASONS[declineCode]) ?? (code && REASONS[code]) ?? null;
  const fix = 'Add another card or bank account with "Update payment method" and the payment is retried the moment it is saved.';
  return {
    noMethod,
    code,
    declineCode,
    reason,
    message: reason
      ? `Stripe could not charge ${methodLabel}: ${reason}. ${fix}`
      : `Stripe could not charge ${methodLabel}, and the bank gave no reason. ${fix}`,
  };
}
