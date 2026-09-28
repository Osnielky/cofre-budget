import { describe, it, expect } from 'vitest';
import { isUsableSessionToken } from './session-token';

function token(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

const inAnHour = Math.floor(Date.now() / 1000) + 3600;

describe('isUsableSessionToken', () => {
  it('accepts an unexpired access token', () => {
    expect(isUsableSessionToken(token({ sub: 'u1', typ: 'access', exp: inAnHour }))).toBe(true);
  });

  it('rejects an expired access token', () => {
    expect(isUsableSessionToken(token({ sub: 'u1', typ: 'access', exp: 1 }))).toBe(false);
  });

  it('rejects a pre-typ session token so the user is sent to login instead of a dead dashboard', () => {
    expect(isUsableSessionToken(token({ sub: 'u1', email: 'a@b.c', exp: inAnHour }))).toBe(false);
  });

  it('rejects a malformed token', () => {
    expect(isUsableSessionToken('not-a-jwt')).toBe(false);
  });
});
