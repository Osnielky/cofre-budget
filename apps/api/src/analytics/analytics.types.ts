/* Mirrors apps/web/src/lib/admin/types.ts (AdminTraffic) — keep the two in sync. */

export interface TrafficWindow { today: number; d7: number; d30: number }

export interface Counted { label: string; visitors: number }

/** Counts for one kind of viewer: prospects (not signed in, incl. demo) or customers (signed in). */
export interface TrafficSegment {
  /** Page views. */
  visits: TrafficWindow;
  /** Distinct daily visitor hashes. Over 7/30 days this is the sum of each day's
   *  uniques, since hashes rotate daily and cannot be joined across days. */
  visitors: TrafficWindow;
  daily: { date: string; visits: number; visitors: number }[];
  topPages: { path: string; visits: number; visitors: number }[];
  topReferrers: { host: string; visits: number }[];
  /** 30 days. Entry views that arrived with a referrer vs without one (typed URL, bookmark, app, untagged message). */
  entries: { direct: number; referred: number };
  /** 30 days. Visitor-days, how many saw a single page, and page views per visitor-day. */
  engagement: { visitorDays: number; singlePage: number; avgPages: number };
  /** 30 days. Page views by UTC weekday × hour: index = weekday (0 = Sunday) * 24 + hour, 168 buckets. */
  activity: number[];
}

/** What prospects look like, 30 days, distinct visitor-days per bucket. Nothing identifies a person. */
export interface ProspectProfile {
  countries: { country: string; visitors: number }[];
  cities: { label: string; country: string; visitors: number }[];
  devices: Counted[];
  browsers: Counted[];
  os: Counted[];
  languages: Counted[];
  landingPages: { path: string; visitors: number }[];
  campaigns: { source: string; medium: string | null; campaign: string | null; visitors: number }[];
  /** Visitor-days with no location (private address, lookup unavailable). */
  unknownLocation: number;
}

/** One prospect's day, newest first: when, where, on what, how they arrived and the pages they took. */
export interface ProspectVisit {
  date: string;
  firstSeen: string;
  lastSeen: string;
  /** Minutes between first and last view; 0 for a single page. */
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

export interface AdminTraffic {
  generatedAt: string;
  /** Everyone, page views. */
  visits: TrafficWindow;
  visitors: TrafficWindow;
  daily: { date: string; visits: number; visitors: number }[];
  topPages: { path: string; visits: number; visitors: number }[];
  topReferrers: { host: string; visits: number }[];
  /** 30-day visits by kind of viewer. */
  split: { anonymous: number; signedIn: number; demo: number };
  /** 30 days: distinct visitors on the landing page → distinct visitors who opened /demo → real signups. */
  /** 30-day counts, except `paying`, which is everyone active or past_due today. */
  funnel: { landingVisitors: number; demoStarts: number; signups: number; trialStarts: number; paying: number };
  segments: { prospects: TrafficSegment; customers: TrafficSegment };
  prospects: { profile: ProspectProfile; recent: ProspectVisit[] };
  retentionDays: number;
}
