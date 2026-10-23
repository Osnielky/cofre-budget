/**
 * Non-identifying visitor attributes derived at ingest from request headers
 * that are then discarded: device / browser / OS families (never the full
 * user agent), the first Accept-Language tag, and UTM campaign tags from the
 * landing URL. Pure functions, unit-tested.
 */

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';
export interface UserAgentProfile { device: DeviceType; browser: string; os: string }

const MAX_FIELD = 100;

export function parseUserAgent(ua: string | undefined): UserAgentProfile {
  if (!ua) return { device: 'unknown', browser: 'Other', os: 'Other' };
  const isIpad = /iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua));
  const isTablet = isIpad || (/Android/.test(ua) && !/Mobile/.test(ua)) || /Tablet/.test(ua);
  const isMobile = !isTablet && (/iPhone|iPod/.test(ua) || /Mobi/.test(ua));
  const device: DeviceType = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
    : /CriOS/.test(ua) ? 'Chrome'
    : /Chrome\/|Chromium\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) && /Version\//.test(ua) ? 'Safari'
    : 'Other';

  const os =
    /iPhone|iPad|iPod/.test(ua) || isIpad ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux|X11/.test(ua) ? 'Linux'
    : 'Other';

  return { device, browser, os };
}

/** First Accept-Language tag, lower-cased, without quality values; null when absent or a wildcard. */
export function primaryLanguage(header: string | undefined): string | null {
  if (!header) return null;
  const first = header.split(',')[0].split(';')[0].trim().toLowerCase();
  if (!first || first === '*') return null;
  return first.slice(0, 10);
}

export interface Utm { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null }

/** utm_source / utm_medium / utm_campaign from a query string ("?a=b" or "a=b"). */
export function parseUtm(search: string | undefined): Utm {
  const out: Utm = { utmSource: null, utmMedium: null, utmCampaign: null };
  if (!search) return out;
  let params: URLSearchParams;
  try { params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search); } catch { return out; }
  const clean = (k: string) => { const v = (params.get(k) ?? '').trim().toLowerCase().slice(0, MAX_FIELD); return v || null; };
  out.utmSource = clean('utm_source');
  out.utmMedium = clean('utm_medium');
  out.utmCampaign = clean('utm_campaign');
  return out;
}

/** False for loopback, private, link-local and unspecified addresses, where a geo lookup is meaningless. */
export function isPublicIp(ip: string | undefined): boolean {
  if (!ip) return false;
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [a, b] = v4.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false;
    return true;
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80')) return false;
  return v6.includes(':');
}
