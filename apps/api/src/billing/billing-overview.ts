import type Stripe from 'stripe';

/**
 * What the Settings → Billing page shows beyond the saved subscription: the card
 * on file, the billing address, the next charge and recent invoices — read live
 * from Stripe and reduced to display fields only (amounts in major units).
 */
export interface BillingOverview {
  paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null;
  billingAddress: {
    line1: string | null; line2: string | null; city: string | null;
    state: string | null; postalCode: string | null; country: string | null;
  } | null;
  upcoming: { subtotal: number; tax: number; total: number; currency: string; date: string | null } | null;
  invoices: {
    id: string; number: string | null; date: string; total: number; currency: string;
    status: string | null; description: string | null; pdfUrl: string | null; hostedUrl: string | null;
  }[];
}

export const EMPTY_OVERVIEW: BillingOverview = { paymentMethod: null, billingAddress: null, upcoming: null, invoices: [] };

const major = (cents: number) => Math.round(cents) / 100;
const iso = (unix: number) => new Date(unix * 1000).toISOString();

function cardOf(pm: string | Stripe.PaymentMethod | null | undefined): BillingOverview['paymentMethod'] {
  if (!pm || typeof pm === 'string' || pm.type !== 'card' || !pm.card) return null;
  return { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year };
}

export function mapBillingOverview(src: {
  customer: Stripe.Customer | null;
  subscription: Stripe.Subscription | null;
  preview: Stripe.Invoice | null;
  invoices: Stripe.Invoice[];
  /** When Stripe's preview has no next payment attempt (e.g. during a trial). */
  fallbackDate: Date | null;
}): BillingOverview {
  const { customer, subscription, preview } = src;
  // The subscription's own card wins; otherwise the customer's default card.
  const paymentMethod = cardOf(subscription?.default_payment_method as Stripe.PaymentMethod | string | null)
    ?? cardOf(customer?.invoice_settings?.default_payment_method);

  const a = customer?.address;
  const billingAddress = a && (a.line1 || a.city || a.postal_code)
    ? { line1: a.line1 ?? null, line2: a.line2 ?? null, city: a.city ?? null, state: a.state ?? null, postalCode: a.postal_code ?? null, country: a.country ?? null }
    : null;

  const upcoming = preview
    ? {
        subtotal: major(preview.subtotal),
        tax: major(preview.total_excluding_tax == null ? 0 : preview.total - preview.total_excluding_tax),
        total: major(preview.total),
        currency: preview.currency,
        date: preview.next_payment_attempt ? iso(preview.next_payment_attempt) : src.fallbackDate?.toISOString() ?? null,
      }
    : null;

  const invoices = src.invoices.map((inv) => ({
    id: inv.id ?? '',
    number: inv.number ?? null,
    date: iso(inv.created),
    total: major(inv.total),
    currency: inv.currency,
    status: inv.status ?? null,
    description: inv.lines?.data?.[0]?.description ?? null,
    pdfUrl: inv.invoice_pdf ?? null,
    hostedUrl: inv.hosted_invoice_url ?? null,
  }));

  return { paymentMethod, billingAddress, upcoming, invoices };
}
