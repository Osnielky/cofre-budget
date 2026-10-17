import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BadRequestException, Controller, Get, Module, INestApplication, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { requestLoggingMiddleware, traceField } from './request-logging.middleware';
import { setLogSink } from './log';
import { setRequestUser } from './request-context';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';

// Decorators applied by hand: test files sit outside tsconfig.app.json, so the
// test transform has no experimentalDecorators.
class Routes {
  ok() { return { ok: true }; }
  item() { return { ok: true }; }
  boom() { throw new Error('kaput'); }
  bad() { throw new BadRequestException('nope'); }
  throwsString() { throw 'raw'; }
  health() { return { status: 'ok' }; }
  async slow() { await new Promise((r) => setTimeout(r, 30)); return {}; }
  me() { setRequestUser('user-9'); return {}; }
  async stream(res: any) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.write('data: hi\n\n');
    await new Promise((r) => setTimeout(r, 30));
    res.end();
  }
  async hang() { await new Promise((r) => setTimeout(r, 200)); return {}; }
}
const route = (path: string, key: keyof Routes) =>
  Get(path)(Routes.prototype, key, Object.getOwnPropertyDescriptor(Routes.prototype, key)!);
route('ok', 'ok'); route('items/:id', 'item'); route('boom', 'boom'); route('bad', 'bad');
route('throws-string', 'throwsString'); route('health', 'health'); route('slow', 'slow'); route('me', 'me');
route('stream', 'stream'); route('hang', 'hang');
Res()(Routes.prototype, 'stream', 0);
Controller()(Routes);
class TestModule {}
Module({ controllers: [Routes] })(TestModule);

let lines: Array<Record<string, any>> = [];
let app: INestApplication;
let base: string;

beforeAll(async () => {
  setLogSink((line) => lines.push(JSON.parse(line)));
  app = await NestFactory.create(TestModule, { logger: false });
  app.use(requestLoggingMiddleware);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', 'localhost');
});
afterAll(async () => { await app.close(); setLogSink(null); });
beforeEach(() => { lines = []; });

const get = async (path: string, headers: Record<string, string> = {}) => {
  const res = await fetch(`${base}${path}`, { headers });
  await res.text();
  await new Promise((r) => setTimeout(r, 5)); // 'finish' fires after the body is sent
  return res;
};
const requestLines = () => lines.filter((l) => l.httpRequest);

describe('request logging', () => {
  it('logs one line with route pattern, status and latency, and echoes the request id', async () => {
    const res = await get('/api/items/123e4567?secret=abc', { cookie: 'access_token=xyz' });
    const [entry] = requestLines();
    expect(requestLines()).toHaveLength(1);
    expect(entry).toMatchObject({ severity: 'INFO', route: '/api/items/:id' });
    expect(entry.httpRequest).toMatchObject({ requestMethod: 'GET', requestUrl: '/api/items/123e4567', status: 200 });
    expect(entry.httpRequest.latency).toMatch(/^\d+\.\d{3}s$/);
    expect(res.headers.get('x-request-id')).toBe(entry.requestId);
    expect(JSON.stringify(lines)).not.toContain('secret=abc');
    expect(JSON.stringify(lines)).not.toContain('xyz');
  });

  it('keeps a valid incoming request id and replaces a garbage one', async () => {
    await get('/api/ok', { 'x-request-id': 'web-1234abcd' });
    expect(requestLines()[0].requestId).toBe('web-1234abcd');
    lines = [];
    await get('/api/ok', { 'x-request-id': 'not ok '.repeat(50) });
    expect(requestLines()[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('logs a 500 at ERROR with an Error Reporting entry carrying the stack and request id', async () => {
    await get('/api/boom');
    const report = lines.find((l) => l['@type']);
    expect(report).toMatchObject({ severity: 'ERROR' });
    expect(report!.stack_trace).toContain('kaput');
    expect(requestLines()[0]).toMatchObject({ severity: 'ERROR', requestId: report!.requestId });
  });

  it('logs a thrown non-Error value without crashing', async () => {
    const res = await get('/api/throws-string');
    expect(res.status).toBe(500);
    expect(requestLines()[0].severity).toBe('ERROR');
  });

  it('logs a 4xx at WARNING with its message on the request line, not Error Reporting', async () => {
    await get('/api/bad');
    expect(requestLines()[0]).toMatchObject({ severity: 'WARNING', error: 'nope' });
    expect(lines.some((l) => l['@type'])).toBe(false);
  });

  it('logs an unmatched route once, by path', async () => {
    const res = await get('/api/nope');
    expect(res.status).toBe(404);
    expect(requestLines()).toHaveLength(1);
    expect(requestLines()[0].httpRequest.requestUrl).toBe('/api/nope');
  });

  it('flags slow requests', async () => {
    process.env.SLOW_REQUEST_MS = '20';
    try {
      await get('/api/slow');
    } finally {
      delete process.env.SLOW_REQUEST_MS;
    }
    expect(requestLines()[0]).toMatchObject({ severity: 'WARNING', slow: true });
  });

  it('skips successful health checks', async () => {
    await get('/api/health');
    expect(requestLines()).toHaveLength(0);
  });

  it('does not flag a streamed response as slow — it is held open on purpose', async () => {
    process.env.SLOW_REQUEST_MS = '20';
    try {
      await get('/api/stream');
    } finally {
      delete process.env.SLOW_REQUEST_MS;
    }
    expect(requestLines()[0]).toMatchObject({ severity: 'INFO', route: '/api/stream' });
    expect(requestLines()[0].slow).toBeUndefined();
  });

  it('logs a request the client abandoned before the response finished', async () => {
    const ctrl = new AbortController();
    const pending = fetch(`${base}/api/hang`, { signal: ctrl.signal }).catch(() => null);
    await new Promise((r) => setTimeout(r, 30));
    ctrl.abort();
    await pending;
    await new Promise((r) => setTimeout(r, 250));
    expect(requestLines()).toHaveLength(1);
    expect(requestLines()[0]).toMatchObject({ severity: 'WARNING', aborted: true, route: '/api/hang' });
    expect(requestLines()[0].httpRequest.status).toBe(499);
  });

  it('carries the authenticated user id', async () => {
    await get('/api/me');
    expect(requestLines()[0].userId).toBe('user-9');
  });
});

describe('traceField', () => {
  it('builds the Cloud Logging trace path', () => {
    expect(traceField('abc123/456;o=1', 'cofre-dev')).toBe('projects/cofre-dev/traces/abc123');
    expect(traceField('abc123/456;o=1', undefined)).toBeUndefined();
    expect(traceField(undefined, 'cofre-dev')).toBeUndefined();
  });
});
