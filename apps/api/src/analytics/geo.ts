import { Logger } from '@nestjs/common';
import { isPublicIp } from './visitor-profile';

export interface GeoResult { country: string | null; region: string | null; city: string | null }
const NONE: GeoResult = { country: null, region: null, city: null };

type GeoIpLite = { lookup(ip: string): { country?: string; region?: string; city?: string } | null };
let lib: GeoIpLite | null | undefined;

/**
 * Country / region / city from an IP, using the offline GeoLite2 data bundled
 * in `geoip-lite` (loaded on first use, ~100 MB resident). The IP itself is
 * never stored. Returns nulls for private addresses or when the data cannot
 * be loaded, so analytics keep working without geo.
 * This product includes GeoLite2 data created by MaxMind (https://www.maxmind.com).
 */
export function geoLookup(ip: string | undefined): GeoResult {
  if (!isPublicIp(ip)) return NONE;
  if (lib === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional, data-heavy dependency loaded lazily
      lib = require('geoip-lite') as GeoIpLite;
    } catch (err) {
      lib = null;
      new Logger('Geo').warn(`geoip-lite unavailable, visits will have no location: ${(err as Error).message}`);
    }
  }
  if (!lib) return NONE;
  try {
    const r = lib.lookup(ip!.replace(/^::ffff:/, ''));
    if (!r) return NONE;
    return {
      country: r.country ? r.country.slice(0, 2).toUpperCase() : null,
      region: r.region ? String(r.region).slice(0, 100) : null,
      city: r.city ? String(r.city).slice(0, 100) : null,
    };
  } catch {
    return NONE;
  }
}
