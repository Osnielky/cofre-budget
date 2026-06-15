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

RUN npx nx build web --configuration=production

# ── Runtime stage ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone output includes its own node_modules subset
COPY --from=builder /app/dist/apps/web/.next/standalone ./
COPY --from=builder /app/dist/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder /app/apps/web/public                 ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
