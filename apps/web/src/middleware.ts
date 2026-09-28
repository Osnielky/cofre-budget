import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isUsableSessionToken } from './lib/session-token';
import { proxyRequestHeaders } from './lib/proxy-headers';

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password', '/privacy', '/terms', '/report-error', '/report-vitals', '/pricing'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /api/* is rewritten to the API service (next.config.js). The API authenticates
  // on its own; this only tells it which client the request came from.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next({
      request: { headers: proxyRequestHeaders(req.headers, process.env.PROXY_SHARED_SECRET) },
    });
  }

  const token = req.cookies.get('access_token')?.value;

  const validToken = token && isUsableSessionToken(token);
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (!validToken && !isPublic) {
    const res = NextResponse.redirect(new URL('/login', req.url));
    // Clear stale cookie
    if (token) res.cookies.delete('access_token');
    return res;
  }
  if (validToken && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)', '/api/:path*'],
};
