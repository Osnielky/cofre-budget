#!/usr/bin/env bash
#
# Deploy step for the Cloud Build pipeline (deploy/cloudbuild.yaml).
# Lives as a real script so shell variables ($API_URL, $WEB_URL) are never
# mistaken for Cloud Build substitutions. Inputs arrive as env vars set by the
# `env:` block of the deploy step:
#   PROJECT_ID SHA REGION REPO SQL_CONN DB_NAME DB_USER GOOGLE_CLIENT_ID MAIL_FROM
#
set -euo pipefail

API_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/api:${SHA}"
WEB_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/web:${SHA}"

echo "▶ Deploying API…"
gcloud run deploy cofre-api \
  --image "${API_IMAGE}" --region "${REGION}" --allow-unauthenticated \
  --min-instances=0 --max-instances=2 --memory=512Mi \
  --add-cloudsql-instances "${SQL_CONN}" \
  --set-env-vars "NODE_ENV=production,DB_HOST=/cloudsql/${SQL_CONN},DB_PORT=5432,DB_USER=${DB_USER},DB_NAME=${DB_NAME},JWT_EXPIRES_IN=7d,GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID},MAIL_FROM=${MAIL_FROM}" \
  --set-secrets "DB_PASS=DB_PASS:latest,JWT_SECRET=JWT_SECRET:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,RESEND_API_KEY=RESEND_API_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest"

API_URL="$(gcloud run services describe cofre-api --region "${REGION}" --format='value(status.url)')"
echo "  API at ${API_URL}"

echo "▶ Deploying web (proxies /api → ${API_URL})…"
gcloud run deploy cofre-web \
  --image "${WEB_IMAGE}" --region "${REGION}" --allow-unauthenticated \
  --min-instances=0 --max-instances=2 --memory=512Mi \
  --set-env-vars "API_PROXY_URL=${API_URL}"

WEB_URL="$(gcloud run services describe cofre-web --region "${REGION}" --format='value(status.url)')"
echo "  Web at ${WEB_URL}"

echo "▶ Syncing API FRONTEND_URL + Google callback + Gmail redirect → ${WEB_URL}…"
gcloud run services update cofre-api --region "${REGION}" \
  --update-env-vars "FRONTEND_URL=${WEB_URL},GOOGLE_CALLBACK_URL=${WEB_URL}/api/auth/google/callback,GOOGLE_GMAIL_REDIRECT_URI=${WEB_URL}/api/gmail/callback"

echo ""
echo "✅ Deployed."
echo "   Web: ${WEB_URL}"
echo "   API: ${API_URL}/api"
