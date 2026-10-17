# Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every API request, error, slow query, external call and real-user page-speed sample is logged as structured JSON that Cloud Logging, Error Reporting and Cloud Trace understand.

**Architecture:** A dependency-free JSON log writer shared by a Nest `LoggerService`, a request middleware (request ID + trace + latency via `AsyncLocalStorage`), the exception filter, a TypeORM logger and a `timed()` wrapper for external calls. The web app gets the same JSON shape for server errors (`instrumentation.ts`), browser errors (`/report-error`) and Core Web Vitals (`/report-vitals`), and forwards a request ID to the API.

**Tech Stack:** NestJS 11 (Express), TypeORM 0.3, Next.js 16, Vitest 4, Node `async_hooks`.

**Spec:** `docs/superpowers/specs/2026-09-28-observability-design.md`

## Global Constraints

- No new npm dependencies.
- Never log: request/response bodies, cookies, `Authorization`, JWTs/OAuth/Plaid tokens, emails, names, money amounts, SQL parameter values. URLs are logged without query strings. Users are identified only by UUID.
- Thresholds (env, optional): `SLOW_REQUEST_MS` default 1000, `SLOW_QUERY_MS` default 500, `SLOW_EXTERNAL_MS` default 2000.
- Error Reporting type string: `type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent`.
- Logging must never throw; `timed()` rethrows the original error unchanged.
- API test files can't use decorator syntax (they sit outside `tsconfig.app.json`): apply Nest decorators as function calls, as in `client-ip-throttler.guard.test.ts`.
- New web test files must be added to the `include` list in `apps/web/vitest.config.ts`.

## Review Focus

- A request whose URL carries a secret in the query (`/api/auth/verify-email?token=…`) — the logged URL has no query string. Pinned in Task 2.
- A request that fails authentication or 404s before any route matches — still exactly one log line, no crash. Pinned in Task 2.
- An error thrown with a non-Error value (`throw 'x'`, or an object) — logged, no crash. Pinned in Tasks 1 and 2.
- A client-supplied `x-request-id` that is garbage (spaces, 10 KB) — replaced with a fresh UUID. Pinned in Task 2.
- A `/report-vitals` beacon with junk or an unknown metric name — ignored with 204, nothing logged. Pinned in Task 5.

---

### Task 1: JSON log writer, request context and CloudLogger

**Files:**
- Create: `apps/api/src/common/logging/request-context.ts`
- Create: `apps/api/src/common/logging/log.ts`
- Create: `apps/api/src/common/logging/cloud-logger.ts`
- Test: `apps/api/src/common/logging/cloud-logger.test.ts`

**Interfaces:**
- Produces:
  - `interface RequestContext { requestId: string; trace?: string; userId?: string; error?: string }`
  - `runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T`
  - `currentRequestContext(): RequestContext | undefined`
  - `setRequestUser(userId: string): void`
  - `type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'`
  - `REPORTED_ERROR_TYPE: string`
  - `log(severity: Severity, message: string, fields?: Record<string, unknown>): void`
  - `errorFields(err: unknown): Record<string, unknown>`
  - `setLogSink(sink: ((line: string, severity: Severity) => void) | null): void` (tests capture output)
  - `class CloudLogger implements LoggerService`

- [ ] **Step 1: Write the failing test** (`cloud-logger.test.ts`)

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CloudLogger } from './cloud-logger';
import { log, errorFields, setLogSink, REPORTED_ERROR_TYPE } from './log';
import { runWithRequestContext, setRequestUser } from './request-context';

let lines: Array<Record<string, any>> = [];
beforeEach(() => { lines = []; setLogSink((line) => lines.push(JSON.parse(line))); });
afterEach(() => setLogSink(null));

describe('log()', () => {
  it('writes severity, message and time', () => {
    log('INFO', 'hello', { a: 1 });
    expect(lines[0]).toMatchObject({ severity: 'INFO', message: 'hello', a: 1 });
    expect(typeof lines[0].time).toBe('string');
  });

  it('adds request id, trace and user inside a request context', () => {
    runWithRequestContext({ requestId: 'req-1', trace: 'projects/p/traces/t' }, () => {
      setRequestUser('user-1');
      log('INFO', 'inside');
    });
    expect(lines[0]).toMatchObject({ requestId: 'req-1', userId: 'user-1', 'logging.googleapis.com/trace': 'projects/p/traces/t' });
  });

  it('adds no context fields outside a request', () => {
    log('INFO', 'outside');
    expect(lines[0].requestId).toBeUndefined();
    expect(lines[0].userId).toBeUndefined();
  });

  it('never throws on an unserialisable field', () => {
    const circular: any = {}; circular.self = circular;
    expect(() => log('INFO', 'circular', { circular })).not.toThrow();
  });
});

describe('errorFields()', () => {
  it('marks the entry for Error Reporting with the stack', () => {
    const f = errorFields(new Error('boom'));
    expect(f['@type']).toBe(REPORTED_ERROR_TYPE);
    expect(String(f.stack_trace)).toContain('Error: boom');
  });

  it('handles a thrown non-Error value', () => {
    expect(errorFields('just a string')['@type']).toBe(REPORTED_ERROR_TYPE);
  });
});

describe('CloudLogger', () => {
  const logger = new CloudLogger();

  it('maps Nest levels to Cloud Logging severities with the context name', () => {
    logger.log('a', 'PlaidService');
    logger.warn('b', 'PlaidService');
    logger.debug('c', 'PlaidService');
    expect(lines.map((l) => l.severity)).toEqual(['INFO', 'WARNING', 'DEBUG']);
    expect(lines[0].context).toBe('PlaidService');
  });

  it('logs error(message, stack, context) for Error Reporting', () => {
    const err = new Error('db down');
    logger.error('sync failed', err.stack, 'PlaidService');
    expect(lines[0]).toMatchObject({ severity: 'ERROR', message: 'sync failed', context: 'PlaidService', '@type': REPORTED_ERROR_TYPE });
    expect(lines[0].stack_trace).toContain('db down');
  });

  it('logs error(message, errorObject, context)', () => {
    logger.error('sync failed', new Error('inner'), 'PlaidService');
    expect(lines[0].stack_trace).toContain('inner');
  });

  it('logs an object message as JSON text', () => {
    logger.log({ event: 'x' }, 'Ctx');
    expect(lines[0].message).toBe('{"event":"x"}');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (modules missing)

Run: `npx vitest run --root apps/api src/common/logging`

- [ ] **Step 3: Implement**

`request-context.ts`:

```ts
import { AsyncLocalStorage } from 'async_hooks';

/** Per-request fields every log entry written during the request carries. */
export interface RequestContext {
  requestId: string;
  trace?: string;
  userId?: string;
  /** Message of a handled 4xx, added to the request's log line. */
  error?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function setRequestUser(userId: string): void {
  const ctx = storage.getStore();
  if (ctx) ctx.userId = userId;
}
```

`log.ts`:

```ts
import { currentRequestContext } from './request-context';

export type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

export const REPORTED_ERROR_TYPE =
  'type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent';

type Sink = (line: string, severity: Severity) => void;

const defaultSink: Sink = (line, severity) =>
  (severity === 'ERROR' ? process.stderr : process.stdout).write(line + '\n');
let sink: Sink = defaultSink;

/** Tests capture output here; null restores stdout/stderr. */
export function setLogSink(next: Sink | null): void {
  sink = next ?? defaultSink;
}

const pretty = () => process.env.NODE_ENV !== 'production' && sink === defaultSink;

/**
 * One JSON object per line — the shape Cloud Logging parses into severity,
 * message, trace link and jsonPayload fields. Never throws.
 */
export function log(severity: Severity, message: string, fields: Record<string, unknown> = {}): void {
  const entry: Record<string, unknown> = { severity, message, time: new Date().toISOString(), ...fields };
  const ctx = currentRequestContext();
  if (ctx) {
    entry.requestId = ctx.requestId;
    if (ctx.userId) entry.userId = ctx.userId;
    if (ctx.trace) entry['logging.googleapis.com/trace'] = ctx.trace;
  }
  let line: string;
  try {
    line = pretty() ? prettyLine(entry) : JSON.stringify(entry);
  } catch {
    line = JSON.stringify({ severity, message, time: entry.time, note: 'fields not serialisable' });
  }
  try {
    sink(line, severity);
  } catch {
    // Logging must never take a request down.
  }
}

function prettyLine(entry: Record<string, unknown>): string {
  const { severity, message, time, context, ...rest } = entry;
  const extra = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
  return `${String(time).slice(11, 23)} ${severity}${context ? ` [${context}]` : ''} ${message}${extra}`;
}

/** Fields that make GCP Error Reporting pick the entry up and group it. */
export function errorFields(err: unknown): Record<string, unknown> {
  const fields: Record<string, unknown> = { '@type': REPORTED_ERROR_TYPE };
  if (err instanceof Error && err.stack) fields.stack_trace = err.stack;
  else if (typeof err === 'string' && err.includes('\n')) fields.stack_trace = err;
  return fields;
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
```

`cloud-logger.ts`:

```ts
import { LoggerService } from '@nestjs/common';
import { log, errorFields, describeError, Severity } from './log';

/**
 * Nest LoggerService writing Cloud Logging JSON. Installed with app.useLogger(),
 * it turns every existing `new Logger(Name)` call into a structured entry.
 * Nest passes the logger name as the last string argument.
 */
export class CloudLogger implements LoggerService {
  log(message: unknown, ...params: unknown[]) { this.write('INFO', message, params); }
  warn(message: unknown, ...params: unknown[]) { this.write('WARNING', message, params); }
  debug(message: unknown, ...params: unknown[]) { this.write('DEBUG', message, params); }
  verbose(message: unknown, ...params: unknown[]) { this.write('DEBUG', message, params); }
  error(message: unknown, ...params: unknown[]) { this.write('ERROR', message, params); }
  fatal(message: unknown, ...params: unknown[]) { this.write('ERROR', message, params); }

  private write(severity: Severity, message: unknown, params: unknown[]) {
    const args = [...params];
    const last = args[args.length - 1];
    // A trailing plain string is the logger name — unless it is a stack trace.
    const context = typeof last === 'string' && !last.includes('\n') ? (args.pop() as string) : undefined;
    const fields: Record<string, unknown> = context ? { context } : {};

    if (severity === 'ERROR') {
      const cause = message instanceof Error ? message : args.find((a) => a instanceof Error || typeof a === 'string');
      Object.assign(fields, errorFields(cause ?? message));
    } else if (args.length) {
      fields.details = args.map((a) => (a instanceof Error ? a.message : a));
    }
    log(severity, typeof message === 'string' ? message : describeError(message), fields);
  }
}
```

- [ ] **Step 4: Run — expect PASS.** `npx vitest run --root apps/api src/common/logging`
- [ ] **Step 5: Commit** `feat(logging): structured Cloud Logging writer and Nest logger`

---

### Task 2: Request middleware, user context, exception filter, bootstrap

**Files:**
- Create: `apps/api/src/common/logging/request-logging.middleware.ts`
- Modify: `apps/api/src/common/filters/all-exceptions.filter.ts` (replace Nest Logger calls)
- Modify: `apps/api/src/auth/strategies/jwt.strategy.ts` (`setRequestUser`)
- Modify: `apps/api/src/main.ts` (logger, middleware first, process handlers)
- Test: `apps/api/src/common/logging/request-logging.middleware.test.ts`

**Interfaces:**
- Consumes: Task 1 (`log`, `errorFields`, `describeError`, `setLogSink`, `runWithRequestContext`, `currentRequestContext`, `setRequestUser`); `clientIp(req)` from `common/client-ip-throttler.guard.ts`.
- Produces: `requestLoggingMiddleware(req, res, next): void`; `traceField(header: unknown, project: string | undefined): string | undefined`.

- [ ] **Step 1: Write the failing test** — a real Nest app with routes `GET /api/ok`, `GET /api/items/:id`, `GET /api/boom` (throws `new Error('kaput')`), `GET /api/bad` (throws `BadRequestException('nope')`), `GET /api/throws-string` (throws `'raw'`), `GET /api/health`, `GET /api/slow` (waits 30 ms, with `SLOW_REQUEST_MS=20`), `GET /api/me` (calls `setRequestUser('user-9')`). Wire `app.use(requestLoggingMiddleware)`, `setGlobalPrefix('api')`, `useGlobalFilters(new AllExceptionsFilter())`, capture with `setLogSink`. Request lines are the entries with `httpRequest`.

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BadRequestException, Controller, Get, Module, INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { requestLoggingMiddleware, traceField } from './request-logging.middleware';
import { setLogSink } from './log';
import { setRequestUser } from './request-context';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';

class Routes {
  ok() { return { ok: true }; }
  item() { return { ok: true }; }
  boom() { throw new Error('kaput'); }
  bad() { throw new BadRequestException('nope'); }
  throwsString() { throw 'raw'; }
  health() { return { status: 'ok' }; }
  async slow() { await new Promise((r) => setTimeout(r, 30)); return {}; }
  me() { setRequestUser('user-9'); return {}; }
}
const route = (path: string, key: keyof Routes) =>
  Get(path)(Routes.prototype, key, Object.getOwnPropertyDescriptor(Routes.prototype, key)!);
route('ok', 'ok'); route('items/:id', 'item'); route('boom', 'boom'); route('bad', 'bad');
route('throws-string', 'throwsString'); route('health', 'health'); route('slow', 'slow'); route('me', 'me');
Controller()(Routes);
class TestModule {}
Module({ controllers: [Routes] })(TestModule);

let lines: Array<Record<string, any>> = [];
let app: INestApplication;
let base: string;

beforeAll(async () => {
  process.env.SLOW_REQUEST_MS = '20';
  setLogSink((line) => lines.push(JSON.parse(line)));
  app = await NestFactory.create(TestModule, { logger: false });
  app.use(requestLoggingMiddleware);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', 'localhost');
});
afterAll(async () => { await app.close(); setLogSink(null); delete process.env.SLOW_REQUEST_MS; });
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
    await get('/api/slow');
    expect(requestLines()[0]).toMatchObject({ severity: 'WARNING', slow: true });
  });

  it('skips successful health checks', async () => {
    await get('/api/health');
    expect(requestLines()).toHaveLength(0);
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
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run --root apps/api src/common/logging/request-logging`

- [ ] **Step 3: Implement** `request-logging.middleware.ts`

```ts
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { log, Severity } from './log';
import { runWithRequestContext, RequestContext } from './request-context';
import { clientIp } from '../client-ip-throttler.guard';

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const slowMs = () => Number(process.env.SLOW_REQUEST_MS) || 1000;

/** Cloud Run's X-Cloud-Trace-Context is "TRACE_ID/SPAN_ID;o=1". */
export function traceField(header: unknown, project: string | undefined): string | undefined {
  if (typeof header !== 'string' || !project) return undefined;
  const traceId = header.split('/')[0];
  return traceId ? `projects/${project}/traces/${traceId}` : undefined;
}

/**
 * Opens the per-request log context and writes one line per request when the
 * response finishes. Registered first in main.ts so everything after it runs
 * inside the context.
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', requestId);

  const ctx: RequestContext = {
    requestId,
    trace: traceField(req.headers['x-cloud-trace-context'], process.env.GOOGLE_CLOUD_PROJECT),
  };
  const start = process.hrtime.bigint();
  res.on('finish', () => runWithRequestContext(ctx, () => logRequest(req, res, ctx, start)));
  runWithRequestContext(ctx, next);
}

function logRequest(req: Request, res: Response, ctx: RequestContext, start: bigint): void {
  const path = (req.originalUrl ?? req.url).split('?')[0];
  const status = res.statusCode;
  if (path === '/api/health' && status < 400) return;

  const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
  const route = req.route?.path ? `${req.baseUrl ?? ''}${req.route.path}` : undefined;
  const slow = latencyMs >= slowMs();
  const severity: Severity = status >= 500 ? 'ERROR' : status >= 400 || slow ? 'WARNING' : 'INFO';

  log(severity, `${req.method} ${route ?? path} ${status} ${Math.round(latencyMs)}ms`, {
    httpRequest: {
      requestMethod: req.method,
      requestUrl: path,
      status,
      latency: `${(latencyMs / 1000).toFixed(3)}s`,
      userAgent: req.headers['user-agent'],
      remoteIp: clientIp(req),
    },
    route,
    latencyMs: Math.round(latencyMs),
    ...(slow ? { slow: true } : {}),
    ...(ctx.error ? { error: ctx.error } : {}),
  });
}
```

`all-exceptions.filter.ts` — replace the `Logger` with the context-aware writer:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { log, errorFields, describeError } from '../logging/log';
import { currentRequestContext } from '../logging/request-context';

/**
 * Catches everything that reaches Nest's exception layer. 5xx and unexpected
 * errors are logged once with their stack in Error Reporting's format; a
 * handled 4xx adds its message to the request's log line instead. Clients
 * never see a stack trace.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const path = request.url.split('?')[0];

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) {
        log('ERROR', `${request.method} ${path} → ${status}: ${exception.message}`, errorFields(exception));
      } else {
        const reqCtx = currentRequestContext();
        if (reqCtx) reqCtx.error = exception.message;
      }
      response.status(status).json(exception.getResponse());
      return;
    }

    log('ERROR', `${request.method} ${path} → 500: ${describeError(exception)}`, errorFields(exception));
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
      path,
    });
  }
}
```

(The old response body included `path: request.url` with the query string; returning the path without it keeps tokens out of error responses too.)

`jwt.strategy.ts` — record the user:

```ts
  async validate(payload: { sub?: unknown; typ?: unknown }) {
    if (payload.typ !== 'access' || typeof payload.sub !== 'string' || !payload.sub) return null;
    const user = await this.usersService.findById(payload.sub);
    if (user) setRequestUser(user.id);
    return user;
  }
```

with `import { setRequestUser } from '../../common/logging/request-context';`.

`main.ts` — structured logger from the first line of boot, middleware first, crash handlers:

```ts
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, bufferLogs: true });
  app.useLogger(new CloudLogger());
  app.use(requestLoggingMiddleware);
  configureTrustProxy(app);
```

and before `bootstrap()`:

```ts
process.on('unhandledRejection', (reason) => log('ERROR', `Unhandled rejection: ${describeError(reason)}`, errorFields(reason)));
process.on('uncaughtException', (err) => {
  log('ERROR', `Uncaught exception: ${err.message}`, errorFields(err));
  process.exit(1);
});
```

- [ ] **Step 4: Run — expect PASS**, then the full suite: `npm run test:api` (the JWT strategy test must still pass).
- [ ] **Step 5: Commit** `feat(logging): one structured line per request with latency, user and request id`

---

### Task 3: Slow database queries

**Files:**
- Create: `apps/api/src/common/logging/typeorm-logger.ts`
- Modify: `apps/api/src/config/database.config.ts`
- Test: `apps/api/src/common/logging/typeorm-logger.test.ts`

**Interfaces:**
- Consumes: Task 1 `log`, `describeError`, `setLogSink`.
- Produces: `class TypeOrmLogger implements Logger` (typeorm), `slowQueryMs(): number`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataSource } from 'typeorm';
import { TypeOrmLogger } from './typeorm-logger';
import { setLogSink } from './log';

let lines: Array<Record<string, any>> = [];
beforeEach(() => { lines = []; setLogSink((l) => lines.push(JSON.parse(l))); });
afterEach(() => setLogSink(null));

describe('TypeOrmLogger', () => {
  const logger = new TypeOrmLogger();

  it('logs a slow query with its duration and SQL, never its parameters', () => {
    logger.logQuerySlow(812, 'SELECT * FROM "users" WHERE "email" = $1', ['owner@cofre.dev']);
    expect(lines[0]).toMatchObject({ severity: 'WARNING', dbSlowQuery: true, durationMs: 812 });
    expect(lines[0].sql).toContain('SELECT * FROM "users"');
    expect(JSON.stringify(lines)).not.toContain('owner@cofre.dev');
  });

  it('logs a failed query at WARNING without parameters', () => {
    logger.logQueryError(new Error('duplicate key'), 'INSERT INTO "users" VALUES ($1)', ['secret']);
    expect(lines[0]).toMatchObject({ severity: 'WARNING', dbQueryError: true, error: 'duplicate key' });
    expect(JSON.stringify(lines)).not.toContain('secret');
  });

  it('stays quiet for ordinary queries', () => {
    logger.logQuery('SELECT 1');
    expect(lines).toHaveLength(0);
  });

  it('is what TypeORM calls for a query slower than maxQueryExecutionTime', async () => {
    const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', logger, maxQueryExecutionTime: 1 });
    await ds.initialize();
    await ds.query(`WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x < 300000) SELECT count(*) FROM c`);
    await ds.destroy();
    expect(lines.some((l) => l.dbSlowQuery)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement**

```ts
import type { Logger } from 'typeorm';
import { log, describeError } from './log';

export const slowQueryMs = () => Number(process.env.SLOW_QUERY_MS) || 500;
const sqlText = (q: string) => (q.length > 2000 ? `${q.slice(0, 2000)}…` : q);

/**
 * TypeORM logger: slow and failed queries only, SQL text without parameter
 * values (they carry emails, amounts, tokens). Query errors are WARNING —
 * many are handled (unique violations); one that becomes a 500 is reported by
 * the exception filter.
 */
export class TypeOrmLogger implements Logger {
  logQuery(): void {}
  logSchemaBuild(): void {}

  logQuerySlow(time: number, query: string): void {
    log('WARNING', `Slow query ${time}ms`, { context: 'Database', dbSlowQuery: true, durationMs: time, sql: sqlText(query) });
  }

  logQueryError(error: string | Error, query: string): void {
    const message = describeError(error);
    log('WARNING', `Query failed: ${message}`, { context: 'Database', dbQueryError: true, error: message, sql: sqlText(query) });
  }

  logMigration(message: string): void {
    log('INFO', message, { context: 'Migrations' });
  }

  log(level: 'log' | 'info' | 'warn', message: unknown): void {
    if (level === 'warn') log('WARNING', describeError(message), { context: 'Database' });
  }
}
```

`database.config.ts`: add `import { TypeOrmLogger, slowQueryMs } from '../common/logging/typeorm-logger';` and, replacing `logging: false,`:

```ts
  logger: new TypeOrmLogger(),
  maxQueryExecutionTime: slowQueryMs(),
```

- [ ] **Step 4: Run — expect PASS**; `npm run test:api`.
- [ ] **Step 5: Commit** `feat(logging): log slow and failed database queries without parameters`

---

### Task 4: External service timing

**Files:**
- Create: `apps/api/src/common/logging/timed.ts`
- Test: `apps/api/src/common/logging/timed.test.ts`
- Modify (wrap calls): `apps/api/src/plaid/plaid.service.ts`, `apps/api/src/plaid/plaid-webhook-verifier.service.ts`, `apps/api/src/ai-agent/ai-chat.service.ts`, `apps/api/src/billing/billing.service.ts`, `apps/api/src/gmail/gmail.service.ts`, `apps/api/src/mail/mail.service.ts`

**Interfaces:**
- Consumes: Task 1 `log`, `describeError`, `setLogSink`.
- Produces: `timed<T>(service: string, operation: string, fn: () => Promise<T>): Promise<T>`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { timed } from './timed';
import { setLogSink } from './log';

let lines: Array<Record<string, any>> = [];
beforeEach(() => { lines = []; setLogSink((l) => lines.push(JSON.parse(l))); });
afterEach(() => { setLogSink(null); delete process.env.SLOW_EXTERNAL_MS; });

describe('timed', () => {
  it('returns the result and logs duration at INFO', async () => {
    expect(await timed('plaid', 'transactionsSync', async () => 42)).toBe(42);
    expect(lines[0]).toMatchObject({ severity: 'INFO', external: { service: 'plaid', operation: 'transactionsSync', ok: true } });
    expect(typeof lines[0].external.durationMs).toBe('number');
  });

  it('flags a slow call at WARNING', async () => {
    process.env.SLOW_EXTERNAL_MS = '5';
    await timed('stripe', 'customers.create', () => new Promise((r) => setTimeout(r, 15)));
    expect(lines[0]).toMatchObject({ severity: 'WARNING', external: { slow: true, ok: true } });
  });

  it('logs a failure at ERROR and rethrows the same error', async () => {
    const err = Object.assign(new Error('Request failed with status code 400'), { response: { data: { error_code: 'ITEM_LOGIN_REQUIRED' } } });
    await expect(timed('plaid', 'accountsBalanceGet', async () => { throw err; })).rejects.toBe(err);
    expect(lines[0]).toMatchObject({
      severity: 'ERROR',
      external: { service: 'plaid', ok: false, error: 'Request failed with status code 400', errorCode: 'ITEM_LOGIN_REQUIRED' },
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement**

```ts
import { log, describeError } from './log';

const slowExternalMs = () => Number(process.env.SLOW_EXTERNAL_MS) || 2000;

/** Plaid/Stripe style error codes, when the SDK error carries one. */
function errorCode(err: unknown): string | undefined {
  const e = err as { response?: { data?: { error_code?: unknown } }; code?: unknown };
  const code = e?.response?.data?.error_code ?? e?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Times a call to an outside service and logs it, so slowness can be pinned on
 * our code or theirs. Failures are logged and rethrown untouched.
 */
export async function timed<T>(service: string, operation: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const durationMs = Math.round(performance.now() - start);
    const slow = durationMs >= slowExternalMs();
    log(slow ? 'WARNING' : 'INFO', `${service}.${operation} ${durationMs}ms`, {
      external: { service, operation, durationMs, ok: true, ...(slow ? { slow: true } : {}) },
    });
    return result;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const code = errorCode(err);
    log('ERROR', `${service}.${operation} failed after ${durationMs}ms: ${describeError(err)}`, {
      external: { service, operation, durationMs, ok: false, error: describeError(err), ...(code ? { errorCode: code } : {}) },
    });
    throw err;
  }
}
```

Wrap each call by moving the SDK call into the callback, keeping the surrounding code unchanged. Pattern:

```ts
// before
const res = await this.client.transactionsSync({ access_token: accessToken, cursor });
// after
const res = await timed('plaid', 'transactionsSync', () => this.client.transactionsSync({ access_token: accessToken, cursor }));
```

Call sites (`import { timed } from '../common/logging/timed';` in each file):
- `plaid.service.ts`: `userCreate` (:83), `linkTokenCreate` (:94, :459), `itemPublicTokenExchange` (:123), `itemRemove` (:131, :437), `accountsBalanceGet` (:144, :199, :255), `transactionsSync` (:329).
- `plaid-webhook-verifier.service.ts`: `webhookVerificationKeyGet` (:48).
- `ai-chat.service.ts`: the awaited consumption of `this.client.beta.messages.toolRunner(...)` (:198) as `timed('anthropic', 'chat', …)` — wrap the code that awaits the runner's final result, not the synchronous constructor call.
- `billing.service.ts`: `customers.create` (:63), `checkout.sessions.create` (in `createCheckoutSession`), `subscriptions.retrieve` (:119, :145), `subscriptions.update` (:121, :130), `billingPortal.sessions.create` if present.
- `gmail.service.ts`: `getToken` (:90), `refreshAccessToken` (:136), `users.messages.list` (:158), `users.messages.get` (:170).
- `mail.service.ts`: `emails.send` (:87, :115) as `timed('resend', 'emails.send', …)`.

- [ ] **Step 4: Run — expect PASS**; `npm run test:api` (existing Plaid / billing / AI tests must still pass), `npm run build:api`.
- [ ] **Step 5: Commit** `feat(logging): time and log calls to Plaid, Anthropic, Stripe, Gmail and Resend`

---

### Task 5: Web — request id, server errors, browser errors, Web Vitals

**Files:**
- Create: `apps/web/src/lib/log.ts`
- Create: `apps/web/src/lib/web-vitals.ts`
- Create: `apps/web/src/lib/web-vitals.test.ts`
- Create: `apps/web/src/app/report-vitals/route.ts`
- Create: `apps/web/src/components/WebVitals.tsx`
- Create: `apps/web/src/instrumentation.ts`
- Modify: `apps/web/src/app/report-error/route.ts`, `apps/web/src/app/layout.tsx`, `apps/web/src/middleware.ts` (add `/report-vitals` to `PUBLIC_PATHS`), `apps/web/src/lib/proxy-headers.ts` + its test (request id), `apps/web/vitest.config.ts`

**Interfaces:**
- Produces: `writeLog(severity, message, fields?)`, `REPORTED_ERROR_TYPE` (web copy); `parseVital(body: unknown): Vital | null`, `normalizePage(path: string): string`, `pagePath(url: unknown): string | undefined`; `proxyRequestHeaders(incoming, secret, requestId?)`.

- [ ] **Step 1: Failing tests**

`web-vitals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseVital, normalizePage, pagePath } from './web-vitals';

describe('parseVital', () => {
  it('accepts a known metric', () => {
    expect(parseVital({ name: 'LCP', value: 2400.5, rating: 'good', page: '/dashboard' }))
      .toEqual({ name: 'LCP', value: 2400.5, rating: 'good', page: '/dashboard' });
  });

  it('rejects junk and unknown metrics', () => {
    expect(parseVital(null)).toBeNull();
    expect(parseVital('x')).toBeNull();
    expect(parseVital({ name: 'Next.js-hydration', value: 1, rating: 'good', page: '/' })).toBeNull();
    expect(parseVital({ name: 'LCP', value: 'fast', rating: 'good', page: '/' })).toBeNull();
    expect(parseVital({ name: 'LCP', value: 1, rating: 'amazing', page: '/' })).toBeNull();
  });

  it('normalises the page so ids do not fragment it', () => {
    expect(parseVital({ name: 'INP', value: 90, rating: 'good', page: '/projects/123e4567-e89b-42d3-a456-426614174000?tab=1' })!.page)
      .toBe('/projects/:id');
  });
});

describe('normalizePage', () => {
  it('replaces uuid and numeric segments', () => {
    expect(normalizePage('/budgets/2026/9')).toBe('/budgets/:id/:id');
    expect(normalizePage('/transactions')).toBe('/transactions');
  });
});

describe('pagePath', () => {
  it('keeps only the path of a full url', () => {
    expect(pagePath('https://cofre.app/reset-password?token=abc')).toBe('/reset-password');
    expect(pagePath(42)).toBeUndefined();
  });
});
```

Add to `proxy-headers.test.ts`:

```ts
  it('sets a fresh request id, replacing a client-supplied one', () => {
    const out = proxyRequestHeaders(new Headers({ 'x-request-id': 'forged' }), SECRET, 'req-fixed-123');
    expect(out.get('x-request-id')).toBe('req-fixed-123');
  });
```

Add `'src/lib/web-vitals.test.ts'` to `apps/web/vitest.config.ts`.

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run --root apps/web src/lib`

- [ ] **Step 3: Implement**

`lib/log.ts`:

```ts
// Same JSON shape as the API (apps/api/src/common/logging/log.ts) so both
// services read alike in Cloud Logging. Server-side only.
export type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

export const REPORTED_ERROR_TYPE =
  'type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent';

export function writeLog(severity: Severity, message: string, fields: Record<string, unknown> = {}): void {
  let line: string;
  try {
    line = JSON.stringify({ severity, message, time: new Date().toISOString(), ...fields });
  } catch {
    line = JSON.stringify({ severity, message, time: new Date().toISOString() });
  }
  if (severity === 'ERROR') console.error(line);
  else console.log(line);
}
```

`lib/web-vitals.ts`:

```ts
const NAMES = new Set(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']);
const RATINGS = new Set(['good', 'needs-improvement', 'poor']);

export interface Vital { name: string; value: number; rating: string; page: string }

const ID_SEGMENT = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Route-shaped path: query dropped, id-like segments replaced by :id. */
export function normalizePage(path: string): string {
  return path.split('?')[0].split('/').map((s) => (ID_SEGMENT.test(s) ? ':id' : s)).join('/') || '/';
}

export function pagePath(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  try {
    return new URL(url).pathname;
  } catch {
    return url.startsWith('/') ? url.split('?')[0] : undefined;
  }
}

/** Validates a beacon from WebVitals.tsx; anything else is dropped. */
export function parseVital(body: unknown): Vital | null {
  if (!body || typeof body !== 'object') return null;
  const { name, value, rating, page } = body as Record<string, unknown>;
  if (typeof name !== 'string' || !NAMES.has(name)) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (typeof rating !== 'string' || !RATINGS.has(rating)) return null;
  if (typeof page !== 'string' || !page.startsWith('/')) return null;
  return { name, value, rating, page: normalizePage(page) };
}
```

`app/report-vitals/route.ts`:

```ts
import { parseVital } from '@/lib/web-vitals';
import { writeLog } from '@/lib/log';

/** Real-user Core Web Vitals from WebVitals.tsx (sendBeacon, text body). */
export async function POST(request: Request) {
  const text = await request.text().catch(() => '');
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON — ignored below
  }
  const vital = parseVital(body);
  if (vital) {
    writeLog(vital.rating === 'poor' ? 'WARNING' : 'INFO', `web-vital ${vital.name} ${Math.round(vital.value)} ${vital.page}`, {
      webVital: vital,
    });
  }
  return new Response(null, { status: 204 });
}
```

`components/WebVitals.tsx`:

```tsx
'use client';

import { useReportWebVitals } from 'next/web-vitals';

/** Sends each Core Web Vital for the current page to /report-vitals. */
export default function WebVitals() {
  useReportWebVitals((metric) => {
    const body = JSON.stringify({ name: metric.name, value: metric.value, rating: metric.rating, page: window.location.pathname });
    if (!navigator.sendBeacon?.('/report-vitals', body)) {
      fetch('/report-vitals', { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  });
  return null;
}
```

`app/layout.tsx`: `import WebVitals from '@/components/WebVitals';` and render `<WebVitals />` as the first child of `<body>`.

`app/report-error/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { writeLog, REPORTED_ERROR_TYPE } from '@/lib/log';
import { pagePath } from '@/lib/web-vitals';

/**
 * Client-side errors (thrown in the browser after hydration) never reach
 * onRequestError in instrumentation.ts, so the error/global-error boundaries
 * POST here to get them into Cloud Logging → GCP Error Reporting.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body && typeof body === 'object') {
    const { message, stack, digest, url } = body as Record<string, unknown>;
    const page = pagePath(url);
    writeLog('ERROR', `[browser] ${page ?? 'unknown page'} — ${typeof message === 'string' ? message.slice(0, 500) : 'unknown error'}`, {
      '@type': REPORTED_ERROR_TYPE,
      ...(typeof stack === 'string' ? { stack_trace: stack.slice(0, 8000) } : {}),
      ...(typeof digest === 'string' ? { digest } : {}),
      page,
      source: 'browser',
    });
  }
  return NextResponse.json({ ok: true });
}
```

`instrumentation.ts`:

```ts
import type { Instrumentation } from 'next';

/** Errors thrown while rendering or in route handlers on the server. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { writeLog, REPORTED_ERROR_TYPE } = await import('./lib/log');
  const e = err as Error & { digest?: string };
  writeLog('ERROR', `[server] ${request.method} ${request.path.split('?')[0]} — ${e?.message ?? String(err)}`, {
    '@type': REPORTED_ERROR_TYPE,
    ...(e?.stack ? { stack_trace: e.stack } : {}),
    ...(e?.digest ? { digest: e.digest } : {}),
    routePath: context.routePath,
    routeType: context.routeType,
    source: 'next-server',
  });
};
```

`proxy-headers.ts` — new signature `proxyRequestHeaders(incoming: Headers, secret: string | undefined, requestId: string = crypto.randomUUID())`; after deleting the proxy headers add `headers.set('x-request-id', requestId);`. Update the doc comment to mention the request id.

`middleware.ts`: add `'/report-vitals'` to `PUBLIC_PATHS`.

- [ ] **Step 4: Run — expect PASS**; `npm run test:dashboard`, `npm run build:web`.
- [ ] **Step 5: Commit** `feat(web): structured server/browser error logs, Web Vitals and request ids`

---

### Task 6: Deploy config and runbook

**Files:**
- Modify: `deploy/ci-deploy.sh` (API env: `GOOGLE_CLOUD_PROJECT=${PROJECT_ID}`)
- Create: `docs/observability.md`
- Modify: `CLAUDE.md` (env list: `SLOW_REQUEST_MS`, `SLOW_QUERY_MS`, `SLOW_EXTERNAL_MS`, `GOOGLE_CLOUD_PROJECT`; one paragraph pointing at `common/logging/` and `docs/observability.md`)

- [ ] **Step 1:** Add `GOOGLE_CLOUD_PROJECT=${PROJECT_ID}` to the API's `--set-env-vars`; `bash -n deploy/ci-deploy.sh`.
- [ ] **Step 2:** Write `docs/observability.md` with: what is logged (field reference), Logs Explorer queries (by `jsonPayload.requestId`, `jsonPayload.slow=true`, `jsonPayload.dbSlowQuery=true`, `jsonPayload.external.ok=false`, `jsonPayload.webVital.rating="poor"`), and the `gcloud` commands for the latency distribution metric (config file), an error-count metric, an email notification channel, an alert policy on errors, and an uptime check on `/api/health`.
- [ ] **Step 3:** Full verification: `npm run test:api && npm run test:dashboard && npm run build:api && npm run build:web`, then boot `node dist/apps/api/main.js` locally, hit `/api/health` and an authenticated route, and check the JSON lines.
- [ ] **Step 4: Commit** `docs(observability): runbook, queries and alerting commands`
