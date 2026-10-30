/* Pure helpers for the admin Traffic panel: week-over-week change, the 7-day
   average line, referrer and page classification, the funnel steps and the
   hour / weekday activity strips. Everything the panel derives lives here so it
   is tested. Spec: docs/superpowers/specs/2026-10-23-prospect-analytics-design.md */

export interface DailyPoint { date: string; visits: number; visitors: number }

/** Last 7 days vs the 7 before, on visitors. `deltaPct` is null when last week was empty. */
export function weekOverWeek(daily: DailyPoint[]): { thisWeek: number; lastWeek: number; deltaPct: number | null } {
  const sum = (rows: DailyPoint[]) => rows.reduce((s, d) => s + d.visitors, 0);
  const thisWeek = sum(daily.slice(-7));
  const lastWeek = sum(daily.slice(-14, -7));
  return { thisWeek, lastWeek, deltaPct: lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null };
}

/** Trailing average over up to `window` points (the first points average what exists so far). One decimal. */
export function movingAverage(values: number[], window = 7): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return Math.round((slice.reduce((s, v) => s + v, 0) / slice.length) * 10) / 10;
  });
}

export type ReferrerKind = 'search' | 'social' | 'ai' | 'own' | 'crawler' | 'other';
export const REFERRER_KIND_LABEL: Record<ReferrerKind, string> = {
  search: 'Search', social: 'Social', ai: 'AI assistant', own: 'Your own URL', crawler: 'Crawler', other: 'Other site',
};

const SEARCH = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.[a-z.]+|baidu\.com|yandex\.[a-z]+|ecosia\.org|search\.brave\.com|startpage\.com|qwant\.com)$/;
const SOCIAL = /(^|\.)(reddit\.com|redd\.it|x\.com|twitter\.com|t\.co|facebook\.com|fb\.com|instagram\.com|linkedin\.com|lnkd\.in|youtube\.com|youtu\.be|tiktok\.com|threads\.net|pinterest\.com|news\.ycombinator\.com|producthunt\.com|indiehackers\.com|discord\.com|whatsapp\.com|telegram\.org|t\.me)$/;
const AI = /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|anthropic\.com|gemini\.google\.com|copilot\.microsoft\.com|you\.com|phind\.com)$/;
const CRAWLER = /crawl|bot|spider|scrap|fetch/i;
/** Own deploy hostnames: the Cloud Run service URL and the product domain (self-referrals from the main host are already dropped at ingest). */
const OWN = /^cofre-[a-z]+-\d+\.[a-z0-9-]+\.run\.app$|(^|\.)budgetcofre\.com$|^localhost(:\d+)?$/;

export function classifyReferrer(host: string): { kind: ReferrerKind; label: string } {
  const h = host.toLowerCase();
  if (h === 'com.google.android.googlequicksearchbox') return { kind: 'search', label: 'Google app (Android)' };
  /* Reverse-domain hosts are Android app package names (android-app://com.example.app). */
  if (/^(com|org|net|io)\.[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(h)) return { kind: 'other', label: `${h} (app)` };
  if (OWN.test(h)) return { kind: 'own', label: host };
  if (CRAWLER.test(h) && !SEARCH.test(h)) return { kind: 'crawler', label: host };
  if (SEARCH.test(h)) return { kind: 'search', label: host.replace(/^www\./, '') };
  if (SOCIAL.test(h)) return { kind: 'social', label: host.replace(/^(www|m|l)\./, '') };
  if (AI.test(h)) return { kind: 'ai', label: host.replace(/^www\./, '') };
  return { kind: 'other', label: host };
}

export type PageKind = 'landing' | 'public' | 'auth' | 'demo' | 'app';
/** What a path is to a prospect: a marketing page, the demo, an auth form, or the app itself (reachable only inside the demo). */
export function pageKind(path: string): PageKind {
  if (path === '/') return 'landing';
  if (path === '/demo' || path.startsWith('/demo/')) return 'demo';
  if (/^\/(login|signup|forgot-password|reset-password|verify)/.test(path)) return 'auth';
  if (/^\/(pricing|tools|compare|mint-alternative|privacy|terms|blog|about)/.test(path)) return 'public';
  return 'app';
}
export const PAGE_KIND_LABEL: Record<PageKind, string> = { landing: 'Landing', public: 'Public', auth: 'Sign in / up', demo: 'Demo', app: 'App (demo)' };

export interface FunnelInput { landingVisitors: number; demoStarts: number; signups: number; trialStarts: number; paying: number }
export interface FunnelStep {
  key: keyof FunnelInput;
  label: string;
  value: number;
  /** Share of the first step; null when the first step is 0. */
  ofTop: number | null;
  /** Share of the previous step; null for the first step or when the previous is 0. */
  ofPrevious: number | null;
  hint: string;
}

export function funnelSteps(f: FunnelInput): FunnelStep[] {
  const defs: { key: keyof FunnelInput; label: string; hint: string }[] = [
    { key: 'landingVisitors', label: 'Saw the landing page', hint: 'distinct prospect visitor-days on /' },
    { key: 'demoStarts', label: 'Opened the demo', hint: 'distinct visitor-days on /demo' },
    { key: 'signups', label: 'Created an account', hint: 'real accounts created, 30 days' },
    { key: 'trialStarts', label: 'Started a trial', hint: 'subscriptions created, 30 days' },
    { key: 'paying', label: 'Paying today', hint: 'active or past due, not windowed' },
  ];
  const top = f.landingVisitors;
  return defs.map((d, i) => {
    const value = f[d.key];
    const prev = i === 0 ? null : f[defs[i - 1].key];
    return {
      ...d, value,
      ofTop: top > 0 ? Math.round((value / top) * 1000) / 10 : null,
      ofPrevious: prev == null || prev === 0 ? null : Math.round((value / prev) * 1000) / 10,
    };
  });
}

export interface Engagement { visitorDays: number; singlePage: number; avgPages: number }

/** One sentence the owner can act on. */
export function engagementHint(e: Engagement, entries: { direct: number; referred: number }): string {
  if (e.visitorDays === 0) return 'Nothing to read yet.';
  const single = e.singlePage / e.visitorDays;
  if (e.visitorDays < 20) return 'Too few visitors to read a pattern — get a channel to 50+ visitors first.';
  if (single >= 0.8) return 'Most prospects leave after one page: the first screen is not earning a click.';
  if (single >= 0.5) return 'Half of prospects leave after one page; the rest explore. Watch which pages they take.';
  const direct = entries.direct + entries.referred ? entries.direct / (entries.direct + entries.referred) : 0;
  if (direct >= 0.7) return 'Prospects explore, and most arrive direct — tag the links you share so you know which channel works.';
  return 'Prospects explore the site. The question is now the demo and signup steps.';
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Rotate the 168 UTC buckets into the viewer's zone and fold them into hour and weekday totals. */
export function localActivity(activity: number[], offsetHours: number): { byHour: number[]; byWeekday: number[]; total: number } {
  const byHour = new Array<number>(24).fill(0);
  const byWeekday = new Array<number>(7).fill(0);
  let total = 0;
  const shift = ((Math.round(offsetHours) % 168) + 168) % 168;
  activity.forEach((n, i) => {
    if (!n) return;
    const local = (i + shift) % 168;
    byHour[local % 24] += n;
    byWeekday[Math.floor(local / 24)] += n;
    total += n;
  });
  return { byHour, byWeekday, total };
}

/** "Tue · 2–4pm" — the busiest weekday and the busiest two-hour block, or null without data. */
export function busiest(byHour: number[], byWeekday: number[]): string | null {
  const total = byHour.reduce((s, n) => s + n, 0);
  if (total === 0) return null;
  let bestDay = 0;
  byWeekday.forEach((n, i) => { if (n > byWeekday[bestDay]) bestDay = i; });
  let bestHour = 0;
  for (let h = 0; h < 24; h++) if (byHour[h] + byHour[(h + 1) % 24] > byHour[bestHour] + byHour[(bestHour + 1) % 24]) bestHour = h;
  return `${WEEKDAYS[bestDay]} · ${hourLabel(bestHour)}–${hourLabel((bestHour + 2) % 24)}`;
}

export function hourLabel(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}
