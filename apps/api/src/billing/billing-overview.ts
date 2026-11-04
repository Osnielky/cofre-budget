import type Stripe from 'stripe';

/**
 * What the Settings → Billing page shows beyond the saved subscription: the card
 * on file, the billing address, the next charge and recent invoices — read live
 * from Stripe and reduced to display fields only (amounts in major units).
 */
/**
 * The payment method Stripe will charge next, reduced to what the page may
 * show. Cards keep brand and expiry; bank debits (ACH, SEPA, BACS…) keep the
 * bank and last 4; wallets (Link, Cash App, PayPal…) keep only a label.
 */
export type PaymentMethodSummary =
  | { kind: 'card'; brand: string; last4: string; expMonth: number; expYear: number }
  | { kind: 'bank'; bankName: string | null; last4: string | null }
  | { kind: 'other'; label: string };

export interface BillingOverview {
  paymentMethod: PaymentMethodSummary | null;
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

const WALLET_LABELS: Record<string, string> = {
  link: 'Link', cashapp: 'Cash App', paypal: 'PayPal', amazon_pay: 'Amazon Pay', revolut_pay: 'Revolut Pay',
};

export function summarizePaymentMethod(pm: string | Stripe.PaymentMethod | null | undefined): PaymentMethodSummary | null {
  if (!pm || typeof pm === 'string') return null;
  switch (pm.type) {
    case 'card':
      return pm.card ? { kind: 'card', brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year } : null;
    case 'us_bank_account':
      return { kind: 'bank', bankName: pm.us_bank_account?.bank_name ?? null, last4: pm.us_bank_account?.last4 ?? null };
    case 'acss_debit':
      return { kind: 'bank', bankName: pm.acss_debit?.bank_name ?? null, last4: pm.acss_debit?.last4 ?? null };
    case 'sepa_debit':
      return { kind: 'bank', bankName: null, last4: pm.sepa_debit?.last4 ?? null };
    case 'bacs_debit':
      return { kind: 'bank', bankName: null, last4: pm.bacs_debit?.last4 ?? null };
    case 'au_becs_debit':
      return { kind: 'bank', bankName: null, last4: pm.au_becs_debit?.last4 ?? null };
    default:
      return { kind: 'other', label: WALLET_LABELS[pm.type] ?? pm.type.replace(/_/g, ' ') };
  }
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
  // The subscription's own method wins; otherwise the customer's default.
  const paymentMethod = summarizePaymentMethod(subscription?.default_payment_method as Stripe.PaymentMethod | string | null)
    ?? summarizePaymentMethod(customer?.invoice_settings?.default_payment_method);

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
