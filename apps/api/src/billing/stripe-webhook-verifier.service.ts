import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeWebhookVerifierService {
  /* Throws (Stripe.errors.StripeSignatureVerificationError) on a bad/missing signature —
     callers should let that propagate as a 401, matching PlaidWebhookController's pattern. */
  verify(payload: Buffer, signature: string, secret: string): Stripe.Event {
    return Stripe.webhooks.constructEvent(payload, signature, secret);
  }
}
