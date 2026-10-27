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
     ├─ verify     npm install → test:api → test:dashboard       ┐
     ├─ build-api  hash sources → skip if image exists → build  ├─ in parallel
     └─ build-web  hash sources → skip if image exists → build  ┘
                                  │
                                  ▼ (all three done, tests green)
                              deploy      deploy/ci-deploy.sh
                                  ├─ cofre-api  (skipped if unchanged) ┐ parallel
                                  └─ cofre-web  (skipped if unchanged) ┘
```

### Only build what changed

`deploy/src-hash.sh api|web` prints a hash of every file that goes into that
image: the app's own folder (minus tests), the root `package*.json`, `nx.json`,
`tsconfig.base.json` and the two pipeline files. The two apps import nothing
from each other, so the hashes are independent.

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
