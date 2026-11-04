/** Mirrors apps/api/src/billing/billing-overview.ts — keep in sync. */
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
  /** A downgrade waiting for the paid period to end. */
  pendingChange: { tier: 'pro' | 'elite'; interval: 'month' | 'year'; effectiveAt: string } | null;
  invoices: {
    id: string; number: string | null; date: string; total: number; currency: string;
    status: string | null; description: string | null; pdfUrl: string | null; hostedUrl: string | null;
  }[];
}

/** Mirrors apps/api/src/billing/plan-change.ts PlanChangePreview. */
export interface PlanChangePreview {
  kind: 'upgrade' | 'downgrade';
  from: { tier: 'pro' | 'elite'; interval: 'month' | 'year'; amount: number };
  to: { tier: 'pro' | 'elite'; interval: 'month' | 'year'; amount: number };
  currency: string;
  chargeNow: number;
  credit: number;
  effectiveAt: string;
  nextChargeAt: string | null;
  trialing: boolean;
}

export interface SubscriptionInfo {
  tier: 'pro' | 'elite';
  interval: 'month' | 'year';
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Paid-plan features. Mirrors PricingCards.tsx and apps/api/src/billing/billing-emails.ts. */
export const PAID_FEATURES: Record<'pro' | 'elite', { title: string; detail: string; icon: 'base' | 'sync' | 'bank' | 'ai' }[]> = {
  pro: [
    { title: 'Everything in Basic', detail: 'Budgets, goals, projects, debts and receipts', icon: 'base' },
    { title: 'Automatic bank sync', detail: 'Transactions import on their own with Plaid (US banks)', icon: 'sync' },
    { title: 'Up to 4 linked institutions', detail: 'Connect your main banks and cards', icon: 'bank' },
    { title: 'Ask Cofre AI assistant', detail: '25 messages a day', icon: 'ai' },
  ],
  elite: [
    { title: 'Everything in Pro', detail: 'All Basic and Pro features', icon: 'base' },
    { title: 'Automatic bank sync', detail: 'Transactions import on their own with Plaid (US banks)', icon: 'sync' },
    { title: 'Up to 10 linked institutions', detail: 'Every bank, card and loan that matters', icon: 'bank' },
    { title: 'Ask Cofre AI assistant', detail: '400 messages a month', icon: 'ai' },
  ],
};
