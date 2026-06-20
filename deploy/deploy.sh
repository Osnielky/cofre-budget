#!/usr/bin/env bash
#
# One-shot deploy of Cofre (API + web) to Cloud Run, backed by Cloud SQL.
# Handles the NEXT_PUBLIC_API_URL chicken-and-egg: API deploys first, then the
# web image is built with the API's URL, then the API learns the web URL.
#
# Prereqs (run once, see deploy/README notes):
#   - gcloud auth login && gcloud config set project <id>
#   - APIs enabled, Artifact Registry repo "cofre" created
#   - Cloud SQL instance created, JWT_SECRET + DB_PASS secrets created
#
# Usage:
#   PROJECT_ID=my-proj SQL_CONN=my-proj:us-central1:cofre-dev ./deploy/deploy.sh
#
set -euo pipefail

# ── Config (override via env) ────────────────────────────────────────
PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-us-central1}"
SQL_CONN="${SQL_CONN:?set SQL_CONN (PROJECT:REGION:INSTANCE)}"
REPO="${REPO:-cofre}"
DB_NAME="${DB_NAME:-cofre_budget}"
DB_USER="${DB_USER:-postgres}"

REG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}"
API_IMAGE="${REG}/api"
WEB_IMAGE="${REG}/web"

echo "▶ 1/5  Building API image…"
gcloud builds submit --config deploy/cloudbuild-api.yaml \
  --substitutions=_IMAGE="${API_IMAGE}"

echo "▶ 2/5  Deploying API (scales to zero)…"
gcloud run deploy cofre-api \
  --image "${API_IMAGE}" --region "${REGION}" --allow-unauthenticated \
  --min-instances=0 --max-instances=2 --memory=512Mi \
  --add-cloudsql-instances "${SQL_CONN}" \
  --set-env-vars "NODE_ENV=production,DB_HOST=/cloudsql/${SQL_CONN},DB_PORT=5432,DB_USER=${DB_USER},DB_NAME=${DB_NAME},JWT_EXPIRES_IN=7d" \
  --set-secrets "DB_PASS=DB_PASS:latest,JWT_SECRET=JWT_SECRET:latest"

API_URL="$(gcloud run services describe cofre-api --region "${REGION}" --format='value(status.url)')"
echo "   API at ${API_URL}"

echo "▶ 3/5  Building web image (browser calls the relative /api proxy)…"
gcloud builds submit --config deploy/cloudbuild-web.yaml \
  --substitutions=_IMAGE="${WEB_IMAGE}",_API_URL="/api"

echo "▶ 4/5  Deploying web (proxies /api → ${API_URL} at runtime)…"
gcloud run deploy cofre-web \
  --image "${WEB_IMAGE}" --region "${REGION}" --allow-unauthenticated \
  --min-instances=0 --max-instances=2 --memory=512Mi \
  --set-env-vars "API_PROXY_URL=${API_URL}"

WEB_URL="$(gcloud run services describe cofre-web --region "${REGION}" --format='value(status.url)')"
echo "   Web at ${WEB_URL}"

echo "▶ 5/5  Pointing API's FRONTEND_URL (CORS + cookie) at ${WEB_URL} …"
gcloud run services update cofre-api --region "${REGION}" \
  --update-env-vars "FRONTEND_URL=${WEB_URL}"

echo ""
echo "✅ Done."
echo "   Web:  ${WEB_URL}"
echo "   API:  ${API_URL}/api"
echo ""
echo "Remember: add ${API_URL}/api/auth/google/callback to your Google OAuth"
echo "authorized redirect URIs, or Google sign-in will be rejected."
