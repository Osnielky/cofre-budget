import { describe, it, expect } from 'vitest';
import { cookieOptions } from './cookies';

describe('cookieOptions', () => {
  // Browsers only reach the API through the web service's /api proxy, so the
  // cookie is always same-site. SameSite=None would let any other site's
  // form or fetch carry the user's session (e.g. POST /api/data-reset).
  it('is SameSite=Lax and Secure in production', () => {
    expect(cookieOptions(true)).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true, path: '/' });
  });

  it('is SameSite=Lax without Secure locally (plain http)', () => {
    expect(cookieOptions(false)).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: false, path: '/' });
  });

  it('adds maxAge only when given, so clearCookie options still match', () => {
    expect(cookieOptions(true, 1000).maxAge).toBe(1000);
    expect('maxAge' in cookieOptions(true)).toBe(false);
  });
});
