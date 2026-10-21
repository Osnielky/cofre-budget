/* Mirrors apps/web/src/lib/admin/types.ts (AdminTraffic) — keep the two in sync. */

export interface TrafficWindow { today: number; d7: number; d30: number }

export interface AdminTraffic {
  generatedAt: string;
  /** Page views. */
  visits: TrafficWindow;
  /** Distinct daily visitor hashes. Over 7/30 days this is the sum of each day's
   *  uniques, since hashes rotate daily and cannot be joined across days. */
  visitors: TrafficWindow;
  daily: { date: string; visits: number; visitors: number }[];
  topPages: { path: string; visits: number; visitors: number }[];
  topReferrers: { host: string; visits: number }[];
  /** 30-day visits by kind of viewer. */
  split: { anonymous: number; signedIn: number; demo: number };
  /** 30 days: distinct visitors on the landing page → distinct visitors who opened /demo → real signups. */
  funnel: { landingVisitors: number; demoStarts: number; signups: number };
  retentionDays: number;
}
