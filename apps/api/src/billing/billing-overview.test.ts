import { describe, it, expect } from 'vitest';
import { mapBillingOverview } from './billing-overview';

const card = { type: 'card', card: { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2028 } };

describe('mapBillingOverview', () => {
  it('maps the card, address, next charge and invoices into major units', () => {
    const out = mapBillingOverview({
      customer: {
        address: { line1: '123 Finance St', line2: 'Apt 4B', city: 'New York', state: 'NY', postal_code: '10001', country: 'US' },
        invoice_settings: { default_payment_method: card },
      } as any,
      subscription: { default_payment_method: null } as any,
      preview: { subtotal: 499, total: 539, total_excluding_tax: 499, currency: 'usd', next_payment_attempt: 1_793_000_000 } as any,
      invoices: [{
        id: 'in_1', number: 'ABC-001', created: 1_790_000_000, total: 499, currency: 'usd', status: 'paid',
        invoice_pdf: 'https://pay.stripe.com/pdf', hosted_invoice_url: 'https://pay.stripe.com/i',
        lines: { data: [{ description: '1 × Cofre Pro (at $4.99 / month)' }] },
      }] as any,
      fallbackDate: null,
    });
    expect(out.paymentMethod).toEqual({ brand: 'visa', last4: '4242', expMonth: 4, expYear: 2028 });
    expect(out.billingAddress).toEqual({ line1: '123 Finance St', line2: 'Apt 4B', city: 'New York', state: 'NY', postalCode: '10001', country: 'US' });
    expect(out.upcoming).toEqual({ subtotal: 4.99, tax: 0.4, total: 5.39, currency: 'usd', date: new Date(1_793_000_000 * 1000).toISOString() });
    expect(out.invoices[0]).toEqual({
      id: 'in_1', number: 'ABC-001', date: new Date(1_790_000_000 * 1000).toISOString(), total: 4.99, currency: 'usd',
      status: 'paid', description: '1 × Cofre Pro (at $4.99 / month)', pdfUrl: 'https://pay.stripe.com/pdf', hostedUrl: 'https://pay.stripe.com/i',
    });
  });

  it("prefers the subscription's own card over the customer's default", () => {
    const sub = { type: 'card', card: { brand: 'mastercard', last4: '5555', exp_month: 1, exp_year: 2030 } };
    const out = mapBillingOverview({
      customer: { invoice_settings: { default_payment_method: card } } as any,
      subscription: { default_payment_method: sub } as any,
      preview: null, invoices: [], fallbackDate: null,
    });
    expect(out.paymentMethod?.last4).toBe('5555');
  });

  it('returns empty parts when Stripe has nothing (or a lookup failed)', () => {
    const out = mapBillingOverview({ customer: null, subscription: null, preview: null, invoices: [], fallbackDate: null });
    expect(out).toEqual({ paymentMethod: null, billingAddress: null, upcoming: null, invoices: [] });
  });

  it('ignores a payment method that is only an id or not a card', () => {
    const out = mapBillingOverview({
      customer: { invoice_settings: { default_payment_method: 'pm_123' } } as any,
      subscription: { default_payment_method: { type: 'us_bank_account' } } as any,
      preview: null, invoices: [], fallbackDate: null,
    });
    expect(out.paymentMethod).toBeNull();
  });

  it('uses the fallback date when Stripe gives no next payment attempt, and 0 tax when none applies', () => {
    const out = mapBillingOverview({
      customer: null, subscription: null,
      preview: { subtotal: 499, total: 499, total_excluding_tax: null, currency: 'usd', next_payment_attempt: null } as any,
      invoices: [], fallbackDate: new Date('2026-10-29T12:00:00Z'),
    });
    expect(out.upcoming).toMatchObject({ tax: 0, total: 4.99, date: '2026-10-29T12:00:00.000Z' });
  });

  it('never returns more than the allowed invoice fields (no customer or payment data leaks)', () => {
    const out = mapBillingOverview({
      customer: null, subscription: null, preview: null, fallbackDate: null,
      invoices: [{ id: 'in_2', created: 1, total: 0, currency: 'usd', status: 'paid', customer_email: 'x@y.z', customer_address: {}, lines: { data: [] } }] as any,
    });
    expect(Object.keys(out.invoices[0]).sort()).toEqual(['currency', 'date', 'description', 'hostedUrl', 'id', 'number', 'pdfUrl', 'status', 'total']);
  });
});
