const NAMES = new Set(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']);
const RATINGS = new Set(['good', 'needs-improvement', 'poor']);

export interface Vital { name: string; value: number; rating: string; page: string }

const ID_SEGMENT = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Route-shaped path: query dropped, id-like segments replaced by :id. */
export function normalizePage(path: string): string {
  return path.split('?')[0].split('/').map((s) => (ID_SEGMENT.test(s) ? ':id' : s)).join('/') || '/';
}

/** Path of a page URL with the query dropped (reset links carry tokens there). */
export function pagePath(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  try {
    return new URL(url).pathname;
  } catch {
    return url.startsWith('/') ? url.split('?')[0] : undefined;
  }
}

/** Validates a beacon from WebVitals.tsx; anything else is dropped. */
export function parseVital(body: unknown): Vital | null {
  if (!body || typeof body !== 'object') return null;
  const { name, value, rating, page } = body as Record<string, unknown>;
  if (typeof name !== 'string' || !NAMES.has(name)) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (typeof rating !== 'string' || !RATINGS.has(rating)) return null;
  if (typeof page !== 'string' || !page.startsWith('/') || page.length > 500) return null;
  return { name, value, rating, page: normalizePage(page) };
}
