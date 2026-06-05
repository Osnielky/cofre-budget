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

export function middleware(req: NextRequest) {
  const token = req.cookies.get('access_token')?.value;
  const { pathname } = req.nextUrl;

  const validToken = token && !isJwtExpired(token);

  if (!validToken && pathname !== '/login') {
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
