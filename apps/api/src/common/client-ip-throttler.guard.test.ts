import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Controller, Get, Module, INestApplication } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClientIpThrottlerGuard, configureTrustProxy, PROXY_CLIENT_IP_HEADER, PROXY_KEY_HEADER } from './client-ip-throttler.guard';

const SECRET = 'proxy-secret-for-tests';

// Decorators applied by hand: test files sit outside tsconfig.app.json, so the
// test transform has no experimentalDecorators.
class PingController {
  ping() {
    return { ok: true };
  }
}
Get('ping')(PingController.prototype, 'ping', Object.getOwnPropertyDescriptor(PingController.prototype, 'ping')!);
Controller()(PingController);

class TestModule {}
Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 2 }])],
  controllers: [PingController],
  providers: [{ provide: APP_GUARD, useClass: ClientIpThrottlerGuard }],
})(TestModule);

/**
 * Production traffic reaches the API through the Next.js proxy, so every
 * request arrives from the web service's address. Without the forwarded client
 * IP, the whole user base shares one rate-limit bucket.
 */
describe('ClientIpThrottlerGuard', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    process.env.PROXY_SHARED_SECRET = SECRET;
    const nest = await NestFactory.create<NestExpressApplication>(TestModule, { logger: false });
    configureTrustProxy(nest);
    app = nest;
    await app.listen(0);
    base = (await app.getUrl()).replace('[::1]', 'localhost');
  });

  afterAll(async () => {
    await app.close();
    delete process.env.PROXY_SHARED_SECRET;
  });

  const ping = (headers: Record<string, string>) => fetch(`${base}/ping`, { headers }).then((r) => r.status);
  const viaProxy = (ip: string) => ({ [PROXY_KEY_HEADER]: SECRET, [PROXY_CLIENT_IP_HEADER]: ip });

  it('gives each proxied client its own bucket', async () => {
    expect(await ping(viaProxy('198.51.100.1'))).toBe(200);
    expect(await ping(viaProxy('198.51.100.1'))).toBe(200);
    expect(await ping(viaProxy('198.51.100.1'))).toBe(429);

    // A different user behind the same proxy is unaffected.
    expect(await ping(viaProxy('198.51.100.2'))).toBe(200);
  });

  it('ignores a forwarded client IP that lacks the proxy secret', async () => {
    const spoof = (ip: string) => ({ [PROXY_KEY_HEADER]: 'wrong', [PROXY_CLIENT_IP_HEADER]: ip });
    // Direct callers are keyed by their own address, so rotating the header buys nothing.
    expect(await ping({ ...spoof('203.0.113.1'), 'x-forwarded-for': '192.0.2.10' })).toBe(200);
    expect(await ping({ ...spoof('203.0.113.2'), 'x-forwarded-for': '192.0.2.10' })).toBe(200);
    expect(await ping({ ...spoof('203.0.113.3'), 'x-forwarded-for': '192.0.2.10' })).toBe(429);
  });

  it('keys direct callers (webhooks) by the address their front end reports', async () => {
    // Cloud Run appends the caller's address last; anything before it is client-supplied.
    expect(await ping({ 'x-forwarded-for': 'forged, 192.0.2.20' })).toBe(200);
    expect(await ping({ 'x-forwarded-for': 'other-forged, 192.0.2.20' })).toBe(200);
    expect(await ping({ 'x-forwarded-for': 'more-forged, 192.0.2.20' })).toBe(429);
    expect(await ping({ 'x-forwarded-for': '192.0.2.21' })).toBe(200);
  });
});
