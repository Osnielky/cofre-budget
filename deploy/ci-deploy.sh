#!/usr/bin/env bash
#
# Deploy step for the Cloud Build pipeline (deploy/cloudbuild.yaml).
# Lives as a real script so shell variables ($API_URL, $WEB_URL) are never
# mistaken for Cloud Build substitutions. Inputs arrive as env vars set by the
# `env:` block of the deploy step:
#   PROJECT_ID SHA REGION REPO SQL_CONN DB_NAME DB_USER GOOGLE_CLIENT_ID
#   PLAID_CLIENT_ID MAIL_FROM STRIPE_PRICE_PRO_MONTHLY STRIPE_PRICE_PRO_YEARLY
#   STRIPE_PRICE_ELITE_MONTHLY STRIPE_PRICE_ELITE_YEARLY
#   PUBLIC_URL (optional; defaults to the cofre-web run.app URL)
#   API_URL    (optional; defaults to the cofre-api run.app URL)
#
# What it does:
#   1. Works out each image's `src-<hash>` tag (deploy/src-hash.sh — the same
#      hash the build steps used), so the deploy always points at the image
#      built from exactly these sources, whether that was this run or an
#      earlier one.
#   2. Skips a service that is already running that tag with this deploy
#      config (label `cfg` = hash of this script + cloudbuild.yaml). A web-only
#      push therefore leaves the API untouched: no new revision, no cold start.
#   3. Deploys the API and web in PARALLEL. Both URLs are known up front (the
#      Cloud Run URL is deterministic), so the API gets FRONTEND_URL and its
#      OAuth/Plaid callbacks in the same deploy — one revision, not two.
#
# Secrets required in Secret Manager (this script references them; it does not
# create them): DB_PASS JWT_SECRET GOOGLE_CLIENT_SECRET RESEND_API_KEY
# PLAID_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET ANTHROPIC_API_KEY
# PROXY_SHARED_SECRET (both services: web forwards the client IP to the API
# with it, the API trusts that IP for rate limiting only when it matches)
# ADMIN_EMAILS (API: comma-separated admin login emails)
#
set -euo pipefail

cd "$(dirname "$0")/.."

# The build steps leave their hash in /workspace/.hash-<app>; use it so the deploy
# names exactly the tag that was built (or found) in this run. Computing it again
# here is only the fallback for running the script outside Cloud Build.
hash_for() { if [ -s "/workspace/.hash-$1" ]; then cat "/workspace/.hash-$1"; else bash deploy/src-hash.sh "$1"; fi; }
API_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/api:src-$(hash_for api)"
WEB_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/web:src-$(hash_for web)"
# Deploy config fingerprint: any change to this script or the pipeline (env vars,
# secrets, memory, substitutions) forces a redeploy even when the image is the same.
CFG="$(cat deploy/ci-deploy.sh deploy/cloudbuild.yaml | sha256sum | cut -c1-12)"

describe() { gcloud run services describe "$1" --region "${REGION}" --format="value($2)" 2>/dev/null || true; }

# The addresses. Both are deterministic, so they are known before deploying;
# the describe() fallbacks only matter on a brand-new project.
API_URL="${API_URL:-$(describe cofre-api status.url)}"
WEB_URL="$(describe cofre-web status.url)"
PUBLIC_URL="${PUBLIC_URL:-${WEB_URL}}"
if [ -z "${API_URL}" ] || [ -z "${PUBLIC_URL}" ]; then
  echo "✖ API_URL / PUBLIC_URL unknown (first deploy on a new project?). Set _API_PROXY_URL and _PUBLIC_URL in deploy/cloudbuild.yaml." >&2
  exit 1
fi
echo "   API    ${API_URL}"
echo "   Public ${PUBLIC_URL}"
echo "   cfg    ${CFG}"

# True when the service already runs this exact image with this exact config.
unchanged() {
  [ "$(describe "$1" 'spec.template.spec.containers[0].image')" = "$2" ] &&
  [ "$(describe "$1" 'metadata.labels.cfg')" = "${CFG}" ]
}

deploy_api() {
  # 1Gi: the API keeps the offline GeoLite2 city data (geoip-lite, ~100 MB) in memory
  # for visitor locations. Costs nothing while scaled to zero.
  gcloud run deploy cofre-api \
    --image "${API_IMAGE}" --region "${REGION}" --allow-unauthenticated \
    --min-instances=0 --max-instances=2 --memory=1Gi \
    --add-cloudsql-instances "${SQL_CONN}" \
    --update-labels "cfg=${CFG}" \
    --set-env-vars "NODE_ENV=production,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},DB_HOST=/cloudsql/${SQL_CONN},DB_PORT=5432,DB_USER=${DB_USER},DB_NAME=${DB_NAME},JWT_EXPIRES_IN=7d,GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID},MAIL_FROM=${MAIL_FROM},PLAID_CLIENT_ID=${PLAID_CLIENT_ID},PLAID_ENV=production,PLAID_LIABILITIES_ENABLED=true,STRIPE_PRICE_PRO_MONTHLY=${STRIPE_PRICE_PRO_MONTHLY},STRIPE_PRICE_PRO_YEARLY=${STRIPE_PRICE_PRO_YEARLY},STRIPE_PRICE_ELITE_MONTHLY=${STRIPE_PRICE_ELITE_MONTHLY},STRIPE_PRICE_ELITE_YEARLY=${STRIPE_PRICE_ELITE_YEARLY},FRONTEND_URL=${PUBLIC_URL},GOOGLE_CALLBACK_URL=${PUBLIC_URL}/api/auth/google/callback,GOOGLE_GMAIL_REDIRECT_URI=${PUBLIC_URL}/api/gmail/callback,PLAID_WEBHOOK_URL=${API_URL}/api/plaid/webhook,PLAID_OAUTH_REDIRECT_URI=${PUBLIC_URL}/settings/plaid-oauth-redirect" \
    --set-secrets "DB_PASS=DB_PASS:latest,JWT_SECRET=JWT_SECRET:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,RESEND_API_KEY=RESEND_API_KEY:latest,PLAID_SECRET=PLAID_SECRET:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,PROXY_SHARED_SECRET=PROXY_SHARED_SECRET:latest,ADMIN_EMAILS=ADMIN_EMAILS:latest"
}

deploy_web() {
  gcloud run deploy cofre-web \
    --image "${WEB_IMAGE}" --region "${REGION}" --allow-unauthenticated \
    --min-instances=0 --max-instances=2 --memory=512Mi \
    --update-labels "cfg=${CFG}" \
    --set-env-vars "API_PROXY_URL=${API_URL}" \
    --set-secrets "PROXY_SHARED_SECRET=PROXY_SHARED_SECRET:latest"
}

PID_API=""; PID_WEB=""
if unchanged cofre-api "${API_IMAGE}"; then
  echo "▶ API unchanged (${API_IMAGE##*/}, cfg ${CFG}) — deploy skipped"
else
  echo "▶ Deploying API ${API_IMAGE##*/}…"
  deploy_api 2>&1 | sed 's/^/[api] /' & PID_API=$!
fi
if unchanged cofre-web "${WEB_IMAGE}"; then
  echo "▶ Web unchanged (${WEB_IMAGE##*/}, cfg ${CFG}) — deploy skipped"
else
  echo "▶ Deploying web ${WEB_IMAGE##*/} (proxies /api → ${API_URL})…"
  deploy_web 2>&1 | sed 's/^/[web] /' & PID_WEB=$!
fi

# `wait <pid>` returns that job's exit status; with `set -e` a failed deploy
# fails the step. Wait on both so a web failure is still reported when the
# API deploy also failed (and vice versa).
STATUS=0
[ -n "${PID_API}" ] && { wait "${PID_API}" || STATUS=$?; }
[ -n "${PID_WEB}" ] && { wait "${PID_WEB}" || STATUS=$?; }
[ "${STATUS}" -eq 0 ] || { echo "✖ Deploy failed (exit ${STATUS})" >&2; exit "${STATUS}"; }

echo ""
echo "✅ Deployed."
echo "   Web: ${PUBLIC_URL} (Cloud Run: ${WEB_URL:-$(describe cofre-web status.url)})"
echo "   API: ${API_URL}/api"
