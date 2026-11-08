# How Cofre is deployed

Everything runs in the GCP project `cofre-dev` (region `us-central1`). There are
three pieces of infrastructure and one pipeline.

## The services

```
 browser ──► https://budgetcofre.com ──► cofre-web (Cloud Run, Next.js)
                                             │
                                             │  /api/* proxied server-side
                                             ▼
                                        cofre-api (Cloud Run, NestJS)
                                             │
                                             ▼
                                        Cloud SQL Postgres `cofre-dev`
```

| Piece | What it is | Notes |
|---|---|---|
| `cofre-web` | Cloud Run service running the Next.js app (`apps/web`) | 512 MiB, 0–2 instances, scales to zero. The custom domain is a Cloud Run domain mapping on this service (apex + `www`, DNS at Squarespace). |
| `cofre-api` | Cloud Run service running the NestJS API (`apps/api`) | 1 GiB (holds the offline GeoIP data), 0–2 instances, scales to zero. Reached at its deterministic `cofre-api-193134215805.us-central1.run.app` URL. Applies pending TypeORM migrations on boot. |
| Cloud SQL `cofre-dev` | Postgres, `db-f1-micro` | The only always-on cost (≈$8–12/mo). The API connects over the Cloud SQL connector socket `/cloudsql/<connection>`. |
| Artifact Registry `cofre` | Docker images `api` and `web` | Each build pushes `src-<hash>`, `<git sha>` and `latest` tags. |
| Secret Manager | DB password, JWT secret, OAuth / Plaid / Stripe / Resend / Anthropic keys, `PROXY_SHARED_SECRET`, `ADMIN_EMAILS` | Mounted as env vars on the services by `deploy/ci-deploy.sh`. Non-secret config (price IDs, client IDs, URLs) lives as substitutions in `deploy/cloudbuild.yaml`. |

**Single origin.** The browser only ever talks to `cofre-web`. A `rewrites()` rule
in `apps/web/next.config.js` proxies `/api/*` to the API service, so cookies are
first-party and no CORS is involved. Next evaluates `rewrites()` at build time,
which is why the API URL is baked into the web image as a build arg
(`API_PROXY_URL`). The web middleware forwards the real client IP with
`PROXY_SHARED_SECRET` so the API can rate-limit per visitor.

**Scale to zero.** Both services sleep when idle; the first request after a quiet
spell pays a cold start of a few seconds. This is deliberate — it keeps Cloud Run
free at current traffic.

## The pipeline

A Cloud Build trigger (`deploy-dev`) runs `deploy/cloudbuild.yaml` on every push
to `dev`. Steps, and what runs in parallel:

```
 push to dev
     │
     ├─ hash       src-hash.sh api|web → /workspace/.hash-{api,web}   (seconds)
     ├─ verify     npm install → test:api → test:dashboard       ┐
     ├─ build-api  read hash → skip if image exists → build      ├─ in parallel
     └─ build-web  read hash → skip if image exists → build      ┘
                                  │
                                  ▼ (all done, tests green)
                              deploy      deploy/ci-deploy.sh (reads the same hash files)
                                  ├─ cofre-api  (skipped if unchanged) ┐ parallel
                                  └─ cofre-web  (skipped if unchanged) ┘
```

### Only build what changed

`deploy/src-hash.sh api|web` prints a hash of every file that goes into that
image: the app's own folder (minus tests), the root `package*.json`, `nx.json`,
`tsconfig.base.json` and the two pipeline files. The two apps import nothing
from each other, so the hashes are independent.

The hash is computed **once, in the first step**, and written to
`/workspace/.hash-api` / `.hash-web` for every later step to read. It must not
be recomputed later: the workspace is shared, and `verify`'s `npm install`
rewrites `package-lock.json` (generated on macOS, npm on Linux adds its
platform-specific optional packages). The first run of this pipeline did
recompute it in the deploy step and failed with "image … not found".

- The build step tags the image `src-<hash>`. If that tag already exists in
  Artifact Registry the sources are identical to an earlier build, so the step
  exits immediately. A web-only push never rebuilds the API, and vice versa.
- When it does build, it pulls the previous `:latest` and uses `--cache-from`, so
  an unchanged `package-lock.json` reuses the npm-install layer.
- `ci-deploy.sh` computes the same hashes and deploys `src-<hash>` tags, so the
  deploy always points at the image built from exactly these sources, whether
  that was this run or an earlier one.

### Only deploy what changed

Before deploying a service the script compares the image tag the service is
currently running and a `cfg` label (a hash of `ci-deploy.sh` +
`cloudbuild.yaml`) against what this run would deploy. Same image and same
config ⇒ nothing to do, no new revision, no cold start. Editing the deploy
script or any substitution (env var, secret, memory) changes `cfg` and forces a
redeploy even with an unchanged image.

### One revision per service, in parallel

Both Cloud Run URLs are deterministic, so the API's `FRONTEND_URL`, Google and
Gmail callbacks and Plaid redirect/webhook URLs are set in the same deploy as
the image. The API and web deploys run concurrently; output lines are prefixed
`[api]` / `[web]`. A failure in either fails the build.

### What is deliberately not done

- **No bigger machine.** Cloud Build's free 2,500 minutes/month only apply to
  the default 2-vCPU pool. `E2_HIGHCPU_8` would cut a cold build to 3–4 minutes
  but bills every build (≈6–10 ¢ each, which was ~70 % of GCP spend when it was
  on). The comment in `cloudbuild.yaml` explains the trade-off.
- **No lint in CI.** It could never fail the build (≈110 pre-existing findings
  are allowed), so it only stole CPU from the steps that matter. Run
  `npx nx run-many -t lint` locally.
- **Tests always run** for both apps. They are the gate and are cheap relative
  to a build.

## Keeping bank data fresh when nobody is looking

Automatic Plaid sync is webhook-driven (`POST /api/plaid/webhook`). As a floor under
that, `PlaidSweepService` resyncs every active item whose last sync is older than
24 hours: 30 s after boot and then hourly, but only while an instance is awake, and
`cofre-api` scales to zero. To guarantee the daily floor, point Cloud Scheduler at
`POST /api/plaid/sweep` with the `x-sweep-secret` header. The route 404s until
`PLAID_SWEEP_SECRET` is set.

```bash
# 1. Create the secret and mount it (add PLAID_SWEEP_SECRET=PLAID_SWEEP_SECRET:latest
#    to the API's --set-secrets list in deploy/ci-deploy.sh on the next deploy)
openssl rand -hex 32 | gcloud secrets create PLAID_SWEEP_SECRET --data-file=-

# 2. Nightly at 05:30 UTC, after most US banks have posted the previous day
gcloud scheduler jobs create http plaid-sweep \
  --schedule="30 5 * * *" --time-zone="Etc/UTC" \
  --uri="https://<api-host>/api/plaid/sweep" --http-method=POST \
  --headers="x-sweep-secret=$(gcloud secrets versions access latest --secret=PLAID_SWEEP_SECRET)" \
  --attempt-deadline=600s --location=<region>
```

The response is `{ stale, synced, failed, skipped }`; `failed` > 0 for the same item
on consecutive nights means its token is bad and the user should see Reconnect.

## Billing sweeps when nobody is looking

The same problem applies to billing: the 24-hour past-due downgrade and the
"your trial ends in 3 days" reminder run on an in-process hourly timer, so with
no traffic for a few days a reminder would go out late or a lapsed user would
keep Pro. `POST /api/billing/sweep` runs both on demand with the **same**
`x-sweep-secret` header and `PLAID_SWEEP_SECRET` (no second secret). Add a
second scheduler job:

```bash
# Daily at 06:00 UTC, after the Plaid sweep
gcloud scheduler jobs create http billing-sweep \
  --schedule="0 6 * * *" --time-zone="Etc/UTC" \
  --uri="https://<api-host>/api/billing/sweep" --http-method=POST \
  --headers="x-sweep-secret=$(gcloud secrets versions access latest --secret=PLAID_SWEEP_SECRET)" \
  --attempt-deadline=300s --location=<region>
```

The response is `{ pastDueDowngraded, trialRemindersSent }`. Both sweeps are
idempotent: a user is downgraded once and a trial reminded once
(`subscriptions.trialReminderSentAt`), so running the job more often is safe.

## Operating it

```bash
# Watch a build
gcloud builds list --limit=5 --format="table(id,status,duration,createTime)"
gcloud builds log <BUILD_ID> --stream

# Per-step timings of a finished build
gcloud builds describe <BUILD_ID> --format="table(steps.id,steps.status,steps.timing.startTime,steps.timing.endTime)"

# What is live right now
gcloud run services describe cofre-web --region us-central1 --format="value(spec.template.spec.containers[0].image,metadata.labels.cfg)"
gcloud run services describe cofre-api --region us-central1 --format="value(spec.template.spec.containers[0].image,metadata.labels.cfg)"

# Roll back web to a previous revision (no rebuild)
gcloud run revisions list --service cofre-web --region us-central1
gcloud run services update-traffic cofre-web --region us-central1 --to-revisions <REVISION>=100

# Force a full rebuild of one image (e.g. a base-image CVE): delete its src tag
gcloud artifacts docker tags delete us-central1-docker.pkg.dev/cofre-dev/cofre/web:src-<hash>

# Change a secret (takes effect on the next deploy; bump cfg by touching ci-deploy.sh or push a code change)
gcloud secrets versions add ADMIN_EMAILS --data-file=-
```

Logs and alert queries: `docs/observability.md`.

## Performance baseline

Measured against budgetcofre.com with the demo account (warm instances, curl
from a home connection to us-central1, and headless Chromium at 1440×900).
"Before" is 2026-11-07 ahead of the speed work on `dev` (indexes, slim
transaction rows, once-a-day recurring materialiser, cached user lookup, boot
sweeps off the cold-start path, SWR client cache, lazy chunks, one authenticated
layout); "After" is the same day once `42ada39` was live. The browser method is written up under Task 12 of
`docs/superpowers/plans/2026-11-07-app-speed.md`; the curl bursts fire the dashboard's eight calls at once with the session cookie.

| Measurement | Before | After |
|---|---|---|
| `/api/auth/me` alone, through the web proxy | 250 ms | 270–330 ms (unchanged: that is the network floor of two hops from here) |
| `/api/auth/me` alone, straight at the API | — | 180–430 ms |
| Dashboard burst of 8 calls, through the web proxy | 600–1,100 ms each | 300–1,100 ms each |
| Dashboard burst of 8 calls, straight at the API | — | 190–350 ms each; the 958 KB list 570 ms |
| Dashboard cold load: first API request / all data in | 0.73 s / ~1.9 s | 0.85 s / 1.8 s (reload with a warm browser cache: 0.28 s / 1.3 s) |
| Dashboard requests / wire transfer per cold load | 109 / 2.8 MB | 103 / 1.4 MB (44 scripts 1.19 MB, 51 fetches 95 KB, fonts 66 KB) |
| `/api/transactions`, 12 months (`limit=20000`) | 841 KB raw, 48 KB gzip, 1.2 s | 958 KB raw / 65 KB gzip for 778 rows (1,228 B per row, was ~1,680), 0.6 s gzip |
| `ask-cofre-logo.png` on every app page | 1.58 MB | 45 KB |
| Dashboard → Transactions → Dashboard | every list refetched | 1 API call, 0 KB (cached ≤ 10 s, then background refresh) |
| Landing page first paint | 3.4 s | not addressed (4 MB hero video, three 330 KB JPEGs, own font) |

What the after column says: the API itself is no longer where the time goes —
straight at cofre-api every call in a burst lands in 190–350 ms, which is the
round trip from here. The same burst through cofre-web spreads to 0.3–1.1 s, so
the remaining per-call cost is the Next.js proxy hop (one 512 MiB instance
forwarding eight concurrent requests, one of them a 958 KB body). Still open
after this round: `--min-instances=1` on cofre-web or a direct browser → API
path (both cost money or a cookie-domain change), the next Cloud SQL tier, the
1.2 MB of dashboard JavaScript over 44 chunks, and the landing page assets.
