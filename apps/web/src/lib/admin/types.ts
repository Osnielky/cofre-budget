/* Mirrors apps/api/src/admin/admin.types.ts — keep the two in sync. */

export interface AdminStats {
  generatedAt: string;
  users: {
    total: number; new7d: number; new30d: number;
    verified: number; unverified: number;
    bySignup: { google: number; email: number };
    weeklySignups: { week: string; count: number }[];
  };
  revenue: {
    plans: { free: number; pro: number; elite: number };
    subscriptions: { trialing: number; active: number; past_due: number; canceled: number };
    cancelingAtPeriodEnd: number;
    mrrEstimate: number;
    new30d: number;
    canceled30d: number;
  };
  engagement: {
    active1d: number; active7d: number; active30d: number;
    withBankLink: number;
    avgTransactionsPerActiveUser: number;
    withBudgets: number; withProjects: number; withNetWorthGoal: number;
    aiConversations30d: number; aiMessages30d: number;
    receiptsTotal: number;
  };
  health: {
    plaidErrors: { total: number; byCode: { code: string; count: number }[] };
    pastDueSubscriptions: number;
  };
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  plan: 'free' | 'pro' | 'elite';
  subscriptionStatus: 'trialing' | 'active' | 'past_due' | 'canceled' | null;
  signupMethod: 'google' | 'email';
  emailVerified: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  bankLinks: number;
  transactions: number;
}

export interface AdminUsersPage { rows: AdminUserRow[]; total: number; page: number; pageSize: number }

/* Mirrors apps/api/src/analytics/analytics.types.ts — keep the two in sync. */
export interface TrafficWindow { today: number; d7: number; d30: number }
export interface AdminTraffic {
  generatedAt: string;
  visits: TrafficWindow;
  visitors: TrafficWindow;
  daily: { date: string; visits: number; visitors: number }[];
  topPages: { path: string; visits: number; visitors: number }[];
  topReferrers: { host: string; visits: number }[];
  split: { anonymous: number; signedIn: number; demo: number };
  funnel: { landingVisitors: number; demoStarts: number; signups: number };
  retentionDays: number;
}

/* Mirrors apps/api/src/support/support.types.ts. */
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export interface AdminTicket {
  id: string;
  status: TicketStatus;
  description: string;
  page: string;
  createdAt: string;
  resolvedAt: string | null;
  reply: string | null;
  hasScreenshot: boolean;
  viewport: string;
  userAgent: string;
  screenshotBytes: number;
  adminNote: string | null;
  replySentAt: string | null;
  updatedAt: string;
  user: { id: string; name: string | null; email: string | null };
}
export interface AdminTicketPage {
  tickets: AdminTicket[];
  page: number;
  lastPage: number;
  total: number;
  counts: Record<TicketStatus, number>;
}
