import { describe, it, expect } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';

function controller(adminEmails?: string) {
  const config = { get: (k: string) => (k === 'ADMIN_EMAILS' ? adminEmails : undefined) } as unknown as ConfigService;
  return new AuthController({} as any, {} as any, config);
}

describe('GET /auth/me isAdmin', () => {
  it('is true for an allowlisted user and keeps the user fields', () => {
    const out = controller('boss@cofre.dev').me({ user: { id: 'u1', email: 'boss@cofre.dev', plan: 'pro' } });
    expect(out).toMatchObject({ id: 'u1', email: 'boss@cofre.dev', plan: 'pro', isAdmin: true });
  });
  it('is false for everyone else', () => {
    expect(controller('boss@cofre.dev').me({ user: { id: 'u2', email: 'x@cofre.dev' } }).isAdmin).toBe(false);
  });
  it('is false when ADMIN_EMAILS is unset', () => {
    expect(controller(undefined).me({ user: { id: 'u1', email: 'boss@cofre.dev' } }).isAdmin).toBe(false);
  });
});
