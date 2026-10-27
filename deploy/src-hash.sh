#!/usr/bin/env bash
#
# Prints a short content hash of everything that goes into one image.
#
#   deploy/src-hash.sh api   → e.g. 3f9c2a7d41b8e6f0
#   deploy/src-hash.sh web
#
# The CI pipeline tags each image `src-<hash>`. A push whose hash already exists
# in Artifact Registry skips that image's build, and ci-deploy.sh skips the
# Cloud Run deploy when the service is already running that tag — so a web-only
# change never rebuilds or redeploys the API, and vice versa.
#
# Inputs: the app's own folder (apps/api or apps/web — the two apps import nothing
# from each other), the root package files, nx + tsconfig config, and the two
# pipeline files (they carry the Dockerfile paths and web build args). Test
# files are left out: they never reach the image. Keep this list honest — a
# missed input means a change ships without a rebuild.
set -euo pipefail

target="${1:?usage: src-hash.sh api|web}"
cd "$(dirname "$0")/.."

case "$target" in
  api) app=apps/api ;;
  web) app=apps/web ;;
  *) echo "src-hash.sh: unknown target '$target' (api|web)" >&2; exit 2 ;;
esac

common=(package.json package-lock.json nx.json tsconfig.base.json deploy/cloudbuild.yaml deploy/src-hash.sh)

if command -v sha256sum >/dev/null 2>&1; then SUM=(sha256sum); else SUM=(shasum -a 256); fi

{
  find "$app" -type f \
    -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/dist/*' \
    -not -name '*.test.ts' -not -name '*.test.tsx' -not -name '*.tsbuildinfo' -not -name '.DS_Store' \
    | LC_ALL=C sort
  printf '%s\n' "${common[@]}"
} | tr '\n' '\0' | xargs -0 "${SUM[@]}" | "${SUM[@]}" | cut -c1-16
