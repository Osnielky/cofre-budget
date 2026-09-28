import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Controller, Get, Module, INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { configureSecurityHeaders } from './security-headers';

class PingController { ping() { return { ok: true }; } }
Get('ping')(PingController.prototype, 'ping', Object.getOwnPropertyDescriptor(PingController.prototype, 'ping')!);
Controller()(PingController);
class TestModule {}
Module({ controllers: [PingController] })(TestModule);

let app: INestApplication;
let headers: Headers;

beforeAll(async () => {
  const nest = await NestFactory.create<NestExpressApplication>(TestModule, { logger: false });
  configureSecurityHeaders(nest, true);
  app = nest;
  await app.listen(0);
  headers = (await fetch(`${(await app.getUrl()).replace('[::1]', 'localhost')}/ping`)).headers;
});
afterAll(() => app.close());

describe('API security headers', () => {
  it('sets nosniff, no framing, no referrer and HSTS', () => {
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(headers.get('referrer-policy')).toBe('no-referrer');
    expect(headers.get('strict-transport-security')).toMatch(/max-age=\d{8,}/);
  });

  it('does not advertise the framework', () => {
    expect(headers.get('x-powered-by')).toBeNull();
  });
});
