import { describe, it, expect } from 'vitest';
import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AdminGuard } from './admin.guard';

function config(value?: string): ConfigService {
  return { get: (key: string) => (key === 'ADMIN_EMAILS' ? value : undefined) } as unknown as ConfigService;
}
function ctx(user: unknown): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  it('lets an allowlisted user through', () => {
    expect(new AdminGuard(config('boss@cofre.dev')).canActivate(ctx({ email: 'Boss@cofre.dev' }))).toBe(true);
  });
  it('answers 404 to a signed-in non-admin', () => {
    expect(() => new AdminGuard(config('boss@cofre.dev')).canActivate(ctx({ email: 'user@cofre.dev' })))
      .toThrow(NotFoundException);
  });
  it('answers 404 when there is no user', () => {
    expect(() => new AdminGuard(config('boss@cofre.dev')).canActivate(ctx(undefined))).toThrow(NotFoundException);
  });
  it('answers 404 to everyone when ADMIN_EMAILS is unset', () => {
    expect(() => new AdminGuard(config(undefined)).canActivate(ctx({ email: 'boss@cofre.dev' })))
      .toThrow(NotFoundException);
  });
});
