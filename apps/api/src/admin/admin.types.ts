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
