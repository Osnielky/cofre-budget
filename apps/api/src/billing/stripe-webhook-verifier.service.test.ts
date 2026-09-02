import { describe, it, expect } from 'vitest';
import Stripe from 'stripe';
import { StripeWebhookVerifierService } from './stripe-webhook-verifier.service';

const SECRET = 'whsec_test_secret';

function sign(payload: string) {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
}

describe('StripeWebhookVerifierService', () => {
  it('accepts a correctly signed payload and returns the parsed event', () => {
    const verifier = new StripeWebhookVerifierService();
    const payload = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' });
    const signature = sign(payload);
    const event = verifier.verify(Buffer.from(payload), signature, SECRET);
    expect(event.id).toBe('evt_1');
    expect(event.type).toBe('customer.subscription.updated');
  });

  it('rejects a payload signed with a different secret', () => {
    const verifier = new StripeWebhookVerifierService();
    const payload = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_other' });
    expect(() => verifier.verify(Buffer.from(payload), signature, SECRET)).toThrow();
  });

  it('rejects a tampered payload', () => {
    const verifier = new StripeWebhookVerifierService();
    const payload = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' });
    const signature = sign(payload);
    const tampered = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.deleted' });
    expect(() => verifier.verify(Buffer.from(tampered), signature, SECRET)).toThrow();
  });
});
