import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function isJwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 < Date.now() : false;
  } catch {
    return true; // malformed token → treat as expired
  }
}

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password', '/privacy', '/terms', '/report-error', '/pricing'];

export function middleware(req: NextRequest) {
  const token = req.cookies.get('access_token')?.value;
  const { pathname } = req.nextUrl;

  const validToken = token && !isJwtExpired(token);
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
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)'],
};
