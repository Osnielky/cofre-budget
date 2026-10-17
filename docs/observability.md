# Observability runbook

Everything the app logs goes to **Cloud Logging** as JSON, one entry per line.
Errors are also grouped in **Error Reporting**, and each API entry links to its
request in **Cloud Trace**. Nothing else to install. Design: `docs/superpowers/specs/2026-09-28-observability-design.md`.

Logs never contain request bodies, cookies, tokens, emails, names, amounts or
SQL parameter values. URLs are logged without their query string, and users
appear only by their internal ID.

## What gets logged

| Entry | Service | Key fields | Severity |
|---|---|---|---|
| One line per API request | cofre-api | `httpRequest` (method, url, status, latency, remoteIp — Cloud Logging lifts this to the entry's top-level `httpRequest`), `route` (e.g. `/api/transactions/:id`), `latencyMs`, `requestId`, `userId`, `slow`, `streaming` (AI chat, never `slow`), `aborted` (client hung up; status 499), `error` (4xx message) | INFO; WARNING for 4xx, 499 or ≥ `SLOW_REQUEST_MS`; ERROR for 5xx |
| API error with stack | cofre-api | `stack_trace`, `requestId`, `userId` | ERROR (Error Reporting) |
| Slow / failed DB query | cofre-api | `dbSlowQuery` or `dbQueryError`, `durationMs`, `sql` | WARNING |
| Outside service call | cofre-api | `external.{service, operation, durationMs, ok, slow, error, errorCode}` — services: plaid, stripe, anthropic, gmail, resend | INFO; WARNING if slow; ERROR if it failed |
| Existing service logs (`PlaidService`, `BillingService`, …) | cofre-api | `context` (logger name), `requestId`, `userId` | as written |
| Server render / route error | cofre-web | `stack_trace`, `routePath`, `routeType` | ERROR (Error Reporting) |
| Browser error | cofre-web | `stack_trace`, `page`, `source: "browser"` | ERROR (Error Reporting) |
| Real-user page speed | cofre-web | `webVital.{name, value, rating, page}` — LCP, INP, CLS, FCP, TTFB | INFO; WARNING when `rating` is `poor` |

Every API response carries an `x-request-id` header. The web app creates the ID
for each request it proxies and the API logs it, so the ID from a response
header finds every API entry for that request. (The web service doesn't write
its own line per proxied request.) Email addresses are masked as `[email]` in
every API entry, including SDK error messages.

Thresholds are env vars on cofre-api: `SLOW_REQUEST_MS` (1000), `SLOW_QUERY_MS`
(500), `SLOW_EXTERNAL_MS` (2000; the AI chat uses 30000).

## Finding things (Logs Explorer)

Console → Logging → Logs Explorer, project `cofre-dev`. Paste a query:

```text
# Everything for one request (ID from the x-request-id response header)
jsonPayload.requestId="PASTE-ID"

# Everything one user did (ID from the users table)
jsonPayload.userId="PASTE-USER-ID"

# Slow API requests
resource.labels.service_name="cofre-api" jsonPayload.slow=true

# 5xx responses (httpRequest is a top-level field, not under jsonPayload)
resource.labels.service_name="cofre-api" httpRequest.status>=500

# Requests the client abandoned (timeouts, closed tabs)
resource.labels.service_name="cofre-api" jsonPayload.aborted=true

# Slow database queries
jsonPayload.dbSlowQuery=true

# Outside services that failed, or were slow
jsonPayload.external.ok=false
jsonPayload.external.slow=true

# Pages real users found slow
jsonPayload.webVital.rating="poor"

# Browser crashes
jsonPayload.source="browser"
```

Errors grouped by cause: Console → Error Reporting.

## Dashboards and alerts (run these in Cloud Shell)

Set these once per shell session:

```bash
PROJECT=cofre-dev
WEB_HOST=cofre-web-4rcapvhcga-uc.a.run.app
ALERT_EMAIL=you@example.com   # where alerts go
```

### 1. Latency by route (log-based metric)

```bash
cat > /tmp/api-latency.yaml <<'EOF'
name: api_request_latency
description: API request latency in ms, by route
filter: resource.type="cloud_run_revision" AND resource.labels.service_name="cofre-api" AND jsonPayload.latencyMs>=0 AND NOT jsonPayload.streaming=true
valueExtractor: EXTRACT(jsonPayload.latencyMs)
labelExtractors:
  route: EXTRACT(jsonPayload.route)
metricDescriptor:
  metricKind: DELTA
  valueType: DISTRIBUTION
  unit: ms
  labels:
    - key: route
bucketOptions:
  exponentialBuckets:
    numFiniteBuckets: 24
    growthFactor: 1.5
    scale: 5
EOF
gcloud logging metrics create api_request_latency --project=$PROJECT --config-from-file=/tmp/api-latency.yaml
```

Streamed AI chat responses are left out: they stay open for the whole answer on
purpose and would dominate every percentile. View the metric in Metrics Explorer: metric `logging/user/api_request_latency`, aggregation
95th percentile, group by `route`. That shows the slowest routes first.

### 2. Error count (log-based metric)

```bash
gcloud logging metrics create cofre_errors --project=$PROJECT \
  --description="Server-side ERROR entries from cofre-api and cofre-web" \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name=("cofre-api" OR "cofre-web") AND severity>=ERROR AND NOT jsonPayload.source="browser"'

gcloud logging metrics create cofre_browser_errors --project=$PROJECT \
  --description="Browser error reports posted to /report-error" \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="cofre-web" AND jsonPayload.source="browser"'
```

Browser reports get their own metric because `/report-error` is public: anyone
can post to it, so it must not be able to trip the server-error alert. One
failing request usually writes 2–3 ERROR entries (the outside-call line, the
error with its stack, the request line), so "more than 5" below is about two
or three failed requests.

### 3. Email channel for alerts

```bash
gcloud beta monitoring channels create --project=$PROJECT \
  --display-name="Cofre alerts" --type=email --channel-labels=email_address=$ALERT_EMAIL
CHANNEL=$(gcloud beta monitoring channels list --project=$PROJECT \
  --filter='displayName="Cofre alerts"' --format='value(name)')
echo $CHANNEL
```

The metrics from steps 1–2 take a few minutes to exist before an alert can use them.

### 4. Alert: errors spiking

```bash
cat > /tmp/alert-errors.yaml <<EOF
displayName: Cofre — errors spiking
combiner: OR
notificationChannels: [$CHANNEL]
conditions:
  - displayName: More than 5 errors in 5 minutes
    conditionThreshold:
      filter: metric.type="logging.googleapis.com/user/cofre_errors" AND resource.type="cloud_run_revision"
      aggregations:
        - alignmentPeriod: 300s
          perSeriesAligner: ALIGN_SUM
          crossSeriesReducer: REDUCE_SUM
      comparison: COMPARISON_GT
      thresholdValue: 5
      duration: 0s
EOF
gcloud alpha monitoring policies create --project=$PROJECT --policy-from-file=/tmp/alert-errors.yaml
```

To alert on browser errors too, copy the file above with
`logging.googleapis.com/user/cofre_browser_errors`, a higher `thresholdValue`
(say 20) and a different `displayName`.

### 5. Alert: API getting slow

```bash
cat > /tmp/alert-latency.yaml <<EOF
displayName: Cofre — API p95 over 2s
combiner: OR
notificationChannels: [$CHANNEL]
conditions:
  - displayName: p95 latency above 2000 ms for 10 minutes
    conditionThreshold:
      filter: metric.type="logging.googleapis.com/user/api_request_latency" AND resource.type="cloud_run_revision"
      aggregations:
        - alignmentPeriod: 300s
          perSeriesAligner: ALIGN_PERCENTILE_95
          crossSeriesReducer: REDUCE_MAX
      comparison: COMPARISON_GT
      thresholdValue: 2000
      duration: 600s
EOF
gcloud alpha monitoring policies create --project=$PROJECT --policy-from-file=/tmp/alert-latency.yaml
```

### 6. Uptime check

Goes through the web service to `/api/health`, so it covers web, API and the
database together. Successful health checks are not written to the app's logs.

```bash
gcloud monitoring uptime create cofre-health --project=$PROJECT \
  --resource-type=uptime-url --resource-labels=host=$WEB_HOST,project_id=$PROJECT \
  --path=/api/health --protocol=https --period=5
```

Then Console → Monitoring → Alerting → Create policy → "Uptime check" →
`cofre-health` → notify "Cofre alerts", to get an email when it fails.

## Cost

Cloud Logging includes 50 GiB/month of ingestion free; at current traffic
these logs are a small fraction of that. Log-based metrics, alert policies and
uptime checks at this size are within the free tier.
