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
export interface Counted { label: string; visitors: number }
export interface TrafficSegment {
  visits: TrafficWindow;
  visitors: TrafficWindow;
  daily: { date: string; visits: number; visitors: number }[];
  topPages: { path: string; visits: number; visitors: number }[];
  topReferrers: { host: string; visits: number }[];
  /** Entry views with / without a referrer, 30 days. */
  entries: { direct: number; referred: number };
  /** Visitor-days, how many saw one page, page views per visitor-day; 30 days. */
  engagement: { visitorDays: number; singlePage: number; avgPages: number };
  /** Page views by UTC weekday × hour (168 buckets, index = weekday * 24 + hour). */
  activity: number[];
}
export interface ProspectProfile {
  countries: { country: string; visitors: number }[];
  cities: { label: string; country: string; visitors: number }[];
  devices: Counted[];
  browsers: Counted[];
  os: Counted[];
  languages: Counted[];
  landingPages: { path: string; visitors: number }[];
  campaigns: { source: string; medium: string | null; campaign: string | null; visitors: number }[];
  unknownLocation: number;
}
export interface ProspectVisit {
  date: string;
  firstSeen: string;
  lastSeen: string;
  minutes: number;
  views: number;
  pages: string[];
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  language: string | null;
  referrerHost: string | null;
  campaign: string | null;
  isDemo: boolean;
}
export interface AdminTraffic extends TrafficSegment {
  generatedAt: string;
  split: { anonymous: number; signedIn: number; demo: number };
  /** 30-day counts, except `paying`, which is everyone active or past_due today. */
  funnel: { landingVisitors: number; demoStarts: number; signups: number; trialStarts: number; paying: number };
  segments: { prospects: TrafficSegment; customers: TrafficSegment };
  prospects: { profile: ProspectProfile; recent: ProspectVisit[] };
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
