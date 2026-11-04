import { describe, it, expect } from 'vitest';
import { describePaymentFailure } from './payment-failure';

describe('describePaymentFailure', () => {
  it('turns a decline code into a reason and points at the payment-method fix', () => {
    const out = describePaymentFailure({ type: 'StripeCardError', code: 'card_declined', decline_code: 'insufficient_funds', message: 'Your card was declined.' }, 'Link');
    expect(out).toMatchObject({ noMethod: false, code: 'card_declined', declineCode: 'insufficient_funds' });
    expect(out.message).toBe('Stripe could not charge Link: the bank reported insufficient funds. Add another card or bank account with "Update payment method" and the payment is retried the moment it is saved.');
  });

  it('says plainly when Stripe gives no reason ("The payment failed.")', () => {
    const out = describePaymentFailure({ type: 'StripeCardError', code: 'payment_intent_payment_attempt_failed', message: 'The payment failed.' });
    expect(out.reason).toBeNull();
    expect(out.message).toMatch(/^Stripe could not charge your payment method, and the bank gave no reason\. Add another card/);
    expect(out.message).not.toMatch(/The payment failed/);
  });

  it('recognises a subscription with nothing to charge', () => {
    for (const err of [
      { code: 'resource_missing', message: 'No such payment_method' },
      { code: 'invoice_payment_intent_requires_action', message: 'This customer has no attached payment source or default payment method.' },
    ]) {
      expect(describePaymentFailure(err)).toMatchObject({ noMethod: true, message: 'There is no payment method on file to charge. Add one and try again.' });
    }
  });

  it('copes with a bare error', () => {
    expect(describePaymentFailure(new Error('boom'))).toMatchObject({ noMethod: false, code: null, declineCode: null, reason: null });
  });
});
