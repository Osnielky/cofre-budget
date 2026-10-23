import { createHash } from 'crypto';

export interface ParsedPageView {
  path: string; referrerHost: string | null; signedIn: boolean; isDemo: boolean;
  /** First page of a visit. */
  entry: boolean;
  /** Query string of the landing URL (entry views only), for UTM tags. */
  search: string | null;
  viewportWidth: number | null;
}

const ID_SEGMENT = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Route-shaped path: query dropped, id-like segments replaced by :id. Mirrors the web's normalizePage. */
export function normalizePath(path: string): string {
  return path.split('?')[0].split('#')[0].split('/').map((s) => (ID_SEGMENT.test(s) ? ':id' : s)).join('/') || '/';
}

/** Lower-cased host without "www.", or null when empty, unparsable, or the site itself. */
export function referrerHost(referrer: unknown, ownHost?: string): string | null {
  if (typeof referrer !== 'string' || !referrer) return null;
  let host: string;
  try { host = new URL(referrer).hostname.toLowerCase(); } catch { return null; }
  host = host.replace(/^www\./, '');
  if (!host) return null;
  if (ownHost && host === ownHost.toLowerCase().replace(/^www\./, '')) return null;
  return host.slice(0, 100);
}

/** Validates a beacon from PageViewBeacon.tsx; anything else is dropped. */
export function parsePageView(body: unknown, ownHost?: string): ParsedPageView | null {
  if (!body || typeof body !== 'object') return null;
  const { path, referrer, signedIn, isDemo, entry, search, viewportWidth } = body as Record<string, unknown>;
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 500) return null;
  const isEntry = entry === true;
  const width = typeof viewportWidth === 'number' && Number.isFinite(viewportWidth) && viewportWidth > 0 && viewportWidth < 20000 ? Math.round(viewportWidth) : null;
  return {
    path: normalizePath(path).slice(0, 200),
    referrerHost: referrerHost(referrer, ownHost),
    signedIn: signedIn === true,
    isDemo: isDemo === true,
    entry: isEntry,
    search: isEntry && typeof search === 'string' && search.length <= 2000 ? search : null,
    viewportWidth: width,
  };
}

/** UTC calendar day, the unit every aggregate works in. */
export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Daily visitor identity: sha256(ip, user agent, day, salt). The day is part
 * of the input, so the same person hashes differently tomorrow and nothing in
 * the table can be joined across days or reversed to an address.
 */
export function visitorHash(ip: string, userAgent: string, day: string, salt: string): string {
  return createHash('sha256').update(`${salt}|${day}|${ip}|${userAgent}`).digest('hex');
}

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|headless|curl\/|wget\/|python-requests|python-urllib|go-http-client|java\/|libwww|httpclient|okhttp|axios\/|node-fetch|lighthouse|pingdom|uptime|monitor/i;

/** Crawlers, scripts and empty agents are not visits. */
export function isBot(userAgent: string | undefined): boolean {
  if (!userAgent) return true;
  return BOT.test(userAgent);
}

/** A date column as 'YYYY-MM-DD'. Postgres hands back a Date, sqlite a string. */
export function dateKeyOf(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
