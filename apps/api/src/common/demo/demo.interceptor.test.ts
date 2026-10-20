import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { DemoInterceptor } from './demo.interceptor';
import { BLOCKED_IN_DEMO_KEY } from './blocked-in-demo.decorator';

function context(user: unknown, blocked: { onHandler?: boolean; onClass?: boolean } = {}) {
  const handler = () => undefined;
  class Ctrl {}
  if (blocked.onHandler) Reflect.defineMetadata(BLOCKED_IN_DEMO_KEY, true, handler);
  if (blocked.onClass) Reflect.defineMetadata(BLOCKED_IN_DEMO_KEY, true, Ctrl);
  return {
    getHandler: () => handler,
    getClass: () => Ctrl,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}
const next = { handle: () => of('handled') };

describe('DemoInterceptor', () => {
  const interceptor = new DemoInterceptor(new Reflector());

  it('blocks a demo visitor on a @BlockedInDemo handler with a DEMO_READ_ONLY code', () => {
    try {
      interceptor.intercept(context({ id: 'v1', isDemo: true }, { onHandler: true }), next);
      throw new Error('did not throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getResponse()).toMatchObject({ code: 'DEMO_READ_ONLY' });
    }
  });

  it('honours the decorator on the controller class (every route of PlaidController)', () => {
    expect(() => interceptor.intercept(context({ id: 'v1', isDemo: true }, { onClass: true }), next)).toThrow(ForbiddenException);
  });

  it('lets real users through the same route', async () => {
    expect(await interceptor.intercept(context({ id: 'u1', isDemo: false, email: 'owner@cofre.dev' }, { onHandler: true }), next).toPromise()).toBe('handled');
    expect(await interceptor.intercept(context({ id: 'u2' }, { onHandler: true }), next).toPromise()).toBe('handled');
  });

  it('blocks the Rockefeller owner account too, since its password is public', () => {
    expect(() => interceptor.intercept(context({ id: 'o1', isDemo: false, email: 'rockefeller@demo.cofre' }, { onHandler: true }), next)).toThrow(ForbiddenException);
  });

  it('ignores routes without the decorator, even for visitors', async () => {
    expect(await interceptor.intercept(context({ id: 'v1', isDemo: true }), next).toPromise()).toBe('handled');
  });

  it('passes an anonymous request through (the route’s own auth answers it)', async () => {
    expect(await interceptor.intercept(context(undefined, { onHandler: true }), next).toPromise()).toBe('handled');
  });
});
