import type { CookieOptions } from 'express';

/**
 * Options for every cookie the API sets. SameSite=Lax: browsers reach the API
 * only through the web service's /api proxy, so these cookies are always
 * same-site and never need to travel on another site's requests. Lax still
 * sends them on top-level GET navigations, which the Google and Gmail OAuth
 * callbacks rely on. Pass the same options (without maxAge) to clearCookie.
 */
export function cookieOptions(isProd = process.env.NODE_ENV === 'production', maxAge?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}
