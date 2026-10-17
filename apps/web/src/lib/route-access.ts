/**
 * The route guard's rule, kept pure so it can be tested without a request.
 * `signedIn` means the access_token cookie is present and usable
 * (isUsableSessionToken) — the API still verifies the signature itself.
 */
export const PUBLIC_PATHS: readonly string[] = [
  '/', '/login', '/signup', '/forgot-password', '/reset-password',
  '/privacy', '/terms', '/pricing', '/report-error', '/report-vitals',
  '/opengraph-image',
];

export type RouteDecision = 'allow' | 'to-login' | 'to-dashboard';

export function routeDecision(pathname: string, signedIn: boolean): RouteDecision {
  if (signedIn && (pathname === '/' || pathname === '/login')) return 'to-dashboard';
  if (!signedIn && !PUBLIC_PATHS.includes(pathname)) return 'to-login';
  return 'allow';
}
