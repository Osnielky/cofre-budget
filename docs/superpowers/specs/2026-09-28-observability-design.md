# Observability: structured logs, latency, and error context

Date: 2026-09-28 · Status: approved design, pending spec review

## Goal

Detect every error precisely (which request, which user, which line) and see
where the app is slow, so services can be tuned for a faster experience. All
of it lands in Google Cloud Logging / Error Reporting / Cloud Trace, which the
deployment already uses — no new paid service, no new npm dependency.

**Success looks like:**
- Any failed request can be found in Cloud Logging by its request ID, with the
  user ID, route, status, latency and (for 5xx) the stack trace on one entry.
- Every error is grouped in GCP Error Reporting.
- Requests slower than 1 s, DB queries slower than 500 ms, and slow or failing
  calls to Plaid / Anthropic / Stripe / Gmail / Resend are each queryable.
- Real-user page speed (Core Web Vitals) per page is in the logs.
- The user has `gcloud` commands for a latency metric, an error-rate alert and
  an uptime check (the user runs cloud commands; we do not).

**Non-goals:** Sentry or any third-party APM, OpenTelemetry tracing spans,
per-user analytics, log-based billing. Distributed tracing beyond linking log
entries to Cloud Run's existing request trace.

## Privacy rules (apply to every component)

Logs never contain: request or response bodies, cookies, `Authorization`
headers, JWTs or OAuth/Plaid tokens, email addresses, names, or money amounts.
Query strings are dropped from logged URLs (the verify-email link carries a
token in its query). SQL is logged without parameter values. Users are
identified only by their internal UUID.

## Architecture

### 1. Structured logger — `apps/api/src/common/logging/`

- `CloudLogger` implements Nest's `LoggerService` and writes one JSON object per
  line to stdout (stderr for `error`), in the shape Cloud Logging parses:
  `severity`, `message`, `time`, `context` (the Nest logger name), plus any
  structured fields. Installed with `app.useLogger()` and `bufferLogs: true`, so
  the 35 existing `new Logger(...)` call sites become structured unchanged.
- Local dev (`NODE_ENV !== 'production'`) keeps a readable one-line format.
- Nest severities map to Cloud Logging: `log`→INFO, `warn`→WARNING,
  `error`/`fatal`→ERROR, `debug`/`verbose`→DEBUG.
- Error entries carry `stack_trace` and
  `@type: type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent`
  so Error Reporting groups them.

### 2. Request context — `request-context.ts`

- `AsyncLocalStorage` holding `{ requestId, traceId?, userId? }`.
- A middleware opens the context for each request: `requestId` comes from the
  incoming `x-request-id` (set by the web middleware) or a new UUID, and is
  echoed back as the `x-request-id` response header.
- `traceId` comes from Cloud Run's `X-Cloud-Trace-Context` header and is emitted as
  `logging.googleapis.com/trace = projects/<GOOGLE_CLOUD_PROJECT>/traces/<id>`,
  so each log entry is linked to the request in the Logs Explorer.
- `JwtStrategy.validate` writes the authenticated `userId` into the context.
- `CloudLogger` adds `requestId`, trace and `userId` to every entry written
  inside a request, so logs from services such as `PlaidService` are correlated
  without changing their call sites.

### 3. Request log middleware

One entry per API request, written when the response finishes:
- `httpRequest` object in Cloud Logging's format (`requestMethod`, `requestUrl`
  without query string, `status`, `latency` as `"0.123s"`, `userAgent`,
  `remoteIp` from `clientIp()`), plus `route` (the Express route pattern, e.g.
  `/api/transactions/:id`, so IDs don't fragment grouping), `latencyMs` and
  `slow: true` when latency is at least `SLOW_REQUEST_MS` (default 1000).
- Severity: ERROR for 5xx; WARNING for 4xx or slow; otherwise INFO.
- `/api/health` is not logged when it succeeds (uptime-check noise).

### 4. Exception filter

`AllExceptionsFilter` keeps its current responses but logs through the context:
5xx and unexpected exceptions at ERROR with the stack (Error Reporting format);
4xx at WARNING with the status and the exception's message (no body). Client
responses are unchanged: no stack traces.

### 5. Slow database queries

A TypeORM `Logger` implementation, set with `maxQueryExecutionTime: SLOW_QUERY_MS`
(default 500), logs slow queries at WARNING (`dbSlowQuery: true`, `durationMs`,
SQL text with no parameters) and query errors at ERROR. Other query logging
stays off.

### 6. External service timing — `timed()` helper

`timed(service, operation, fn)` runs `fn`, then logs `external: { service,
operation, durationMs, ok }`: INFO when it succeeds under `SLOW_EXTERNAL_MS`
(default 2000), WARNING when it is slow, ERROR when it fails (then rethrows,
unchanged). Wrapped call sites:
- Plaid (`plaid.service.ts`, `plaid-webhook-verifier.service.ts`): userCreate,
  linkTokenCreate, itemPublicTokenExchange, itemRemove, accountsBalanceGet,
  transactionsSync, webhookVerificationKeyGet.
- Anthropic (`ai-chat.service.ts`): the tool-runner run as a whole.
- Stripe (`billing.service.ts`): customers.create, subscriptions.retrieve/update,
  checkout session creation.
- Gmail (`gmail.service.ts`): getToken, refreshAccessToken, messages.list,
  messages.get.
- Resend (`mail.service.ts`): emails.send.

### 7. Web app

- **Request ID:** the web middleware sets a fresh `x-request-id` (UUID) on each
  proxied `/api/*` request, alongside the proxy headers it already adds.
- **`instrumentation.ts`** (`apps/web/src/`): `onRequestError` logs server-side
  render/route errors as structured JSON (ERROR, stack, route path, digest).
- **`/report-error`:** the existing client error route logs structured JSON
  (ERROR, Error Reporting format, page path without query, digest).
- **Web Vitals:** a small client component using `useReportWebVitals`
  (`next/web-vitals`), mounted in the root layout, sends LCP, INP, CLS, FCP and
  TTFB with the page route and rating via `navigator.sendBeacon` to a new
  `/report-vitals` route. That route validates the payload shape and logs it as
  INFO with `webVital: { name, value, rating, page }`, or WARNING when the rating
  is `poor`. Both report routes are public and carry no user identity.
- A shared `apps/web/src/lib/log.ts` writes the same JSON shape as the API.

### 8. Configuration

Env vars, all optional with the defaults above: `SLOW_REQUEST_MS`,
`SLOW_QUERY_MS`, `SLOW_EXTERNAL_MS`. `GOOGLE_CLOUD_PROJECT` is needed for the
trace link; `ci-deploy.sh` sets it on the API from `PROJECT_ID`.

### 9. Dashboards and alerts (documentation only)

`docs/observability.md` documents: useful Logs Explorer queries (by request ID,
slow requests, slow queries, external failures, poor web vitals); `gcloud`
commands for a log-based latency distribution metric, an alert policy on the
5xx rate with an email channel, and an uptime check on `/api/health`. The user
runs these.

## Error handling

Logging never throws: a failure to serialise an entry falls back to a plain
`console.error` line. `timed()` rethrows the original error untouched. The
report routes always answer 204/200 and never echo input.

## Testing

- `CloudLogger`: entry shape, severity mapping, Error Reporting fields, context
  fields added inside a request context and absent outside.
- Request log middleware (real Nest app over HTTP, as in the throttler test):
  one entry per request with route pattern, status, latency, `requestId` echoed
  in the response header, no query string or cookies in the entry, severity
  rules, slow flag, health check skipped.
- Exception filter: 5xx logged at ERROR with stack; 4xx at WARNING; response
  bodies unchanged.
- TypeORM logger: slow query logged without parameters.
- `timed()`: success, slow and failure cases; failure rethrows the same error.
- Web: `/report-vitals` payload validation and severity; the logging helper's
  shape; the middleware sets `x-request-id`.
