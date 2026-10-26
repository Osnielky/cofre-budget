/**
 * The route guard's rule, kept pure so it can be tested without a request.
 * `signedIn` means the access_token cookie is present and usable
 * (isUsableSessionToken) — the API still verifies the signature itself.
 */
export const PUBLIC_PATHS: readonly string[] = [
  '/', '/login', '/signup', '/forgot-password', '/reset-password',
  '/privacy', '/terms', '/pricing', '/report-error', '/report-vitals',
  '/opengraph-image', '/demo', '/mint-alternative',
];

/** Public sections: the prefix itself and anything under it (`/tools`, `/tools/x`). */
export const PUBLIC_PATH_PREFIXES: readonly string[] = ['/tools', '/compare'];

export type RouteDecision = 'allow' | 'to-login' | 'to-dashboard';

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function routeDecision(pathname: string, signedIn: boolean): RouteDecision {
  if (signedIn && (pathname === '/' || pathname === '/login')) return 'to-dashboard';
  if (!signedIn && !isPublic(pathname)) return 'to-login';
  return 'allow';
}
