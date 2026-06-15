# ── Build stage ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
# npm install (not ci): the lockfile is generated on macOS/npm 11 and omits
# some linux-only optional deps (rolldown/vitest bindings) that strict `npm ci`
# rejects on this alpine image. install reconciles them for the build platform.
RUN npm install --ignore-scripts --no-audit --no-fund

COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Next bakes rewrites() at BUILD time, so the proxy target must be present now,
# not just at runtime. The browser calls the relative /api; this forwards it to
# the API service server-side.
ARG API_PROXY_URL
ENV API_PROXY_URL=$API_PROXY_URL

RUN npx nx build web --configuration=production

# ── Runtime stage ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js writes its output to apps/web/.next (not dist/, unlike the API's
# webpack build). standalone bundles server.js at apps/web/server.js + a
# node_modules subset; static and public are copied in alongside it.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder /app/apps/web/public           ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
