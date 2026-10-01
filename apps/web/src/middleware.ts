import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isUsableSessionToken } from './lib/session-token';
import { proxyRequestHeaders } from './lib/proxy-headers';
import { canonicalRedirect } from './lib/canonical-host';
import { routeDecision } from './lib/route-access';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const canonical = canonicalRedirect(req.headers.get('host'), pathname, req.nextUrl.search);
  if (canonical) return NextResponse.redirect(canonical, 308);

  // /api/* is rewritten to the API service (next.config.js). The API authenticates
  // on its own; this only tells it which client the request came from.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next({
      request: { headers: proxyRequestHeaders(req.headers, process.env.PROXY_SHARED_SECRET) },
    });
  }

  const token = req.cookies.get('access_token')?.value;
  const decision = routeDecision(pathname, !!token && isUsableSessionToken(token));

  if (decision === 'to-login') {
    const res = NextResponse.redirect(new URL('/login', req.url));
    // Clear stale cookie
    if (token) res.cookies.delete('access_token');
    return res;
  }
  if (decision === 'to-dashboard') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)', '/api/:path*'],
};
